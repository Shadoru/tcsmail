use std::{
    net::{TcpStream, ToSocketAddrs},
    time::Duration,
};

#[derive(Clone, Copy)]
pub struct CalendarInviteRequest<'a> {
    pub to_text: &'a str,
    pub uid: &'a str,
    pub start_ts: i64,
    pub end_ts: i64,
    pub summary: &'a str,
    pub location: &'a str,
    pub video_url: &'a str,
}
use chrono::{DateTime, Local, TimeZone};
use lettre::{
    message::{header::ContentType, Attachment, Mailbox, Mailboxes, MultiPart, SinglePart},
    transport::smtp::authentication::{Credentials, Mechanism},
    Message, SmtpTransport, Transport,
};
use mailparse::MailHeaderMap;
use serde::Serialize;
use thiserror::Error;

use crate::models::{Account, AttachmentInfo, DiagnosticReport, MailDraft, MessageSummary};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct FolderInfo {
    pub name: String,
    pub display_name: String,
    pub parent: Option<String>,
    pub delimiter: Option<String>,
    pub selectable: bool,
    pub subscribed: bool,
    pub special_use: Option<String>,
}

#[derive(Debug, Error)]
pub enum MailError {
    #[error("connection failed: {0}")]
    Connection(String),
    #[error("authentication failed: {0}")]
    Authentication(String),
    #[error("protocol error: {0}")]
    Protocol(String),
    #[error("message error: {0}")]
    Message(String),
}

pub fn xoauth2_payload(user: &str, access_token: &str) -> String {
    format!("user={user}\x01auth=Bearer {access_token}\x01\x01")
}

/// Shared RFC822 parser for both synchronous and asynchronous IMAP retrieval.
/// This function never talks to the network and preserves the original message mapping.
pub(crate) fn summary_from_raw(
    account: &Account,
    folder: &str,
    uid: u32,
    raw: &[u8],
    unread: bool,
    starred: bool,
    force_spam: bool,
) -> Option<MessageSummary> {
    let parsed = mailparse::parse_mail(raw).ok()?;
    let subject = parsed
        .headers
        .get_first_value("Subject")
        .unwrap_or_default();
    let from = parsed.headers.get_first_value("From").unwrap_or_default();
    let to = parsed.headers.get_first_value("To").unwrap_or_default();
    let cc = parsed.headers.get_first_value("Cc").unwrap_or_default();
    let date = parsed
        .headers
        .get_first_value("Date")
        .and_then(|d| mailparse::dateparse(&d).ok())
        .and_then(|ts| DateTime::from_timestamp(ts, 0))
        .map(|d| d.with_timezone(&Local))
        .unwrap_or_else(|| {
            DateTime::from_timestamp(0, 0)
                .expect("Unix epoch válido")
                .with_timezone(&Local)
        });
    let (from_name, from_email) = split_address(&from);
    let body_text = extract_text(&parsed);
    let body_html = extract_html(&parsed);
    let attachments = extract_attachments(&parsed);
    let calendar_ics = extract_calendar_ics(&parsed);
    let snippet = body_text
        .chars()
        .take(180)
        .collect::<String>()
        .replace('\n', " ");
    Some(MessageSummary {
        id: 0,
        account_id: account.id,
        folder: folder.to_string(),
        uid,
        subject,
        from_name,
        from_email,
        to_text: to,
        cc_text: cc,
        date,
        snippet,
        body_text,
        body_html,
        attachments: attachments.clone(),
        calendar_ics,
        unread,
        starred,
        spam: force_spam || looks_like_spam(&parsed),
        message_id: parsed
            .headers
            .get_first_value("Message-ID")
            .unwrap_or_default(),
        in_reply_to: parsed
            .headers
            .get_first_value("In-Reply-To")
            .unwrap_or_default(),
        references_text: parsed
            .headers
            .get_first_value("References")
            .unwrap_or_default(),
        has_attachments: !attachments.is_empty() || has_attachments(&parsed),
        pinned: false,
        priority: false,
    })
}

fn sender_mailbox(from_name: &str, from_email: &str) -> Result<Mailbox, MailError> {
    // Parse only the address. Lettre encodes/quotes the display name itself.
    let address: lettre::Address = from_email
        .trim()
        .parse()
        .map_err(|e| MailError::Message(format!("invalid From: {e}")))?;
    let name = from_name.trim();
    Ok(Mailbox::new(
        (!name.is_empty()).then(|| name.to_owned()),
        address,
    ))
}

fn build_message_inner(
    account: &Account,
    d: &MailDraft,
    require_recipient: bool,
) -> Result<Message, MailError> {
    if require_recipient
        && d.to.trim().is_empty()
        && d.cc.trim().is_empty()
        && d.bcc.trim().is_empty()
    {
        return Err(MailError::Message(
            "at least one recipient is required".into(),
        ));
    }
    let from_email = if d.from_email.trim().is_empty() {
        &account.email
    } else {
        &d.from_email
    };
    let from = sender_mailbox(&d.from_name, from_email)?;
    let mut builder = Message::builder().from(from).subject(&d.subject);
    if let Some(reply_to) = d
        .reply_to
        .as_ref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    {
        let mailbox: Mailbox = reply_to
            .parse()
            .map_err(|e| MailError::Message(format!("invalid Reply-To: {e}")))?;
        builder = builder.reply_to(mailbox);
    }
    for address in split_mailboxes(&d.to)? {
        builder = builder.to(address);
    }
    for address in split_mailboxes(&d.cc)? {
        builder = builder.cc(address);
    }
    for address in split_mailboxes(&d.bcc)? {
        builder = builder.bcc(address);
    }
    if let Some(value) = d.in_reply_to.clone().filter(|v| !v.trim().is_empty()) {
        builder = builder.in_reply_to(value);
    }
    if let Some(value) = d.references.clone().filter(|v| !v.trim().is_empty()) {
        builder = builder.references(value);
    }
    if let Some(key) = d.draft_key.as_ref().filter(|v| !v.trim().is_empty()) {
        builder = builder.raw_header(lettre::message::header::HeaderValue::new(
            lettre::message::header::HeaderName::new_from_ascii_str("X-TCS-Draft-ID"),
            key.trim().to_string(),
        ));
    }
    if d.request_read_receipt {
        let receipt_to = from_email.trim().to_string();
        builder = builder
            .raw_header(lettre::message::header::HeaderValue::new(
                lettre::message::header::HeaderName::new_from_ascii_str(
                    "Disposition-Notification-To",
                ),
                receipt_to.clone(),
            ))
            .raw_header(lettre::message::header::HeaderValue::new(
                lettre::message::header::HeaderName::new_from_ascii_str("Return-Receipt-To"),
                receipt_to,
            ));
    }
    let plain = SinglePart::builder()
        .header(ContentType::TEXT_PLAIN)
        .body(d.text_body.clone());
    if d.html_body.trim().is_empty() {
        if d.attachments.is_empty() && d.inline_attachments.is_empty() {
            return builder
                .singlepart(plain)
                .map_err(|e| MailError::Message(e.to_string()));
        }
        let mut mixed = MultiPart::mixed().singlepart(plain);
        for item in &d.inline_attachments {
            let bytes = std::fs::read(&item.path).map_err(|e| {
                MailError::Message(format!("inline attachment {}: {e}", item.path.display()))
            })?;
            let content_type = ContentType::parse(&item.mime_type)
                .map_err(|e| MailError::Message(e.to_string()))?;
            mixed = mixed
                .singlepart(Attachment::new(item.content_id.clone()).body(bytes, content_type));
        }
        for path in &d.attachments {
            let bytes = std::fs::read(path)
                .map_err(|e| MailError::Message(format!("attachment {}: {e}", path.display())))?;
            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("attachment")
                .to_string();
            let mime = match path
                .extension()
                .and_then(|x| x.to_str())
                .unwrap_or("")
                .to_ascii_lowercase()
                .as_str()
            {
                "pdf" => "application/pdf",
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "gif" => "image/gif",
                "webp" => "image/webp",
                "txt" => "text/plain",
                "html" | "htm" => "text/html",
                "ics" => "text/calendar",
                _ => "application/octet-stream",
            };
            let content_type =
                ContentType::parse(mime).map_err(|e| MailError::Message(e.to_string()))?;
            mixed = mixed.singlepart(Attachment::new(filename).body(bytes, content_type));
        }
        return builder
            .multipart(mixed)
            .map_err(|e| MailError::Message(e.to_string()));
    }
    let html = SinglePart::builder()
        .header(ContentType::TEXT_HTML)
        .body(d.html_body.clone());
    let alternative = if d.inline_attachments.is_empty() {
        MultiPart::alternative().singlepart(plain).singlepart(html)
    } else {
        let mut related = MultiPart::related().singlepart(html);
        for item in &d.inline_attachments {
            let bytes = std::fs::read(&item.path).map_err(|e| {
                MailError::Message(format!("inline attachment {}: {e}", item.path.display()))
            })?;
            let content_type = ContentType::parse(&item.mime_type)
                .map_err(|e| MailError::Message(e.to_string()))?;
            related = related.singlepart(
                Attachment::new_inline(item.content_id.clone()).body(bytes, content_type),
            );
        }
        MultiPart::alternative()
            .singlepart(plain)
            .multipart(related)
    };
    let mut mixed = MultiPart::mixed().multipart(alternative);
    for path in &d.attachments {
        let bytes = std::fs::read(path)
            .map_err(|e| MailError::Message(format!("attachment {}: {e}", path.display())))?;
        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("attachment")
            .to_string();
        let mime = match path
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str()
        {
            "pdf" => "application/pdf",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "txt" => "text/plain",
            "html" | "htm" => "text/html",
            "ics" => "text/calendar",
            _ => "application/octet-stream",
        };
        let content_type =
            ContentType::parse(mime).map_err(|e| MailError::Message(e.to_string()))?;
        mixed = mixed.singlepart(Attachment::new(filename).body(bytes, content_type));
    }
    builder
        .multipart(mixed)
        .map_err(|e| MailError::Message(e.to_string()))
}

pub fn send_message(account: &Account, password: &str, d: &MailDraft) -> Result<(), MailError> {
    let email = build_message_inner(account, d, true)?;
    smtp_transport(account, password)?
        .send(&email)
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    Ok(())
}

pub fn render_draft_rfc822(account: &Account, draft: &MailDraft) -> Result<Vec<u8>, MailError> {
    Ok(build_message_inner(account, draft, false)?.formatted())
}

pub fn send_calendar_invite(
    account: &Account,
    password: &str,
    invite: CalendarInviteRequest<'_>,
) -> Result<(), MailError> {
    let recipients = split_mailboxes(invite.to_text)?;
    if recipients.is_empty() {
        return Err(MailError::Message(
            "calendar invite requires at least one attendee".into(),
        ));
    }
    let from: Mailbox = account
        .email
        .parse()
        .map_err(|e| MailError::Message(format!("invalid From: {e}")))?;
    let mut builder = Message::builder().from(from).subject(invite.summary);
    let mut attendee_lines = String::new();
    for recipient in recipients {
        attendee_lines.push_str(&format!(
            "ATTENDEE;RSVP=TRUE:mailto:{}\r\n",
            recipient.email
        ));
        builder = builder.to(recipient);
    }
    let start = chrono::Local
        .timestamp_opt(invite.start_ts, 0)
        .single()
        .unwrap_or_else(chrono::Local::now)
        .format("%Y%m%dT%H%M%S")
        .to_string();
    let end = chrono::Local
        .timestamp_opt(invite.end_ts, 0)
        .single()
        .unwrap_or_else(chrono::Local::now)
        .format("%Y%m%dT%H%M%S")
        .to_string();
    let url_line = if invite.video_url.trim().is_empty() {
        String::new()
    } else {
        format!("URL:{}\r\n", invite.video_url.trim())
    };
    let summary = invite.summary.replace(['\r', '\n'], " ");
    let location = invite.location.replace(['\r', '\n'], " ");
    let ics = format!(
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TCS Mail//Calendar Request//PT-BR\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nUID:{}\r\nDTSTAMP:{}\r\nDTSTART:{}\r\nDTEND:{}\r\nSUMMARY:{}\r\nLOCATION:{}\r\nORGANIZER:mailto:{}\r\n{}{}END:VEVENT\r\nEND:VCALENDAR\r\n",
        invite.uid,
        chrono::Utc::now().format("%Y%m%dT%H%M%SZ"),
        start,
        end,
        summary,
        location,
        account.email,
        attendee_lines,
        url_line
    );
    let content_type = ContentType::parse("text/calendar; method=REQUEST; charset=utf-8")
        .map_err(|e| MailError::Message(e.to_string()))?;
    let email = builder
        .singlepart(SinglePart::builder().header(content_type).body(ics))
        .map_err(|e| MailError::Message(e.to_string()))?;
    smtp_transport(account, password)?
        .send(&email)
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    Ok(())
}

pub fn send_calendar_reply(
    account: &Account,
    password: &str,
    organizer: &str,
    uid: &str,
    start_value: &str,
    summary: &str,
    partstat: &str,
) -> Result<(), MailError> {
    let organizer = organizer
        .trim()
        .trim_start_matches("mailto:")
        .trim_start_matches("MAILTO:");
    if organizer.is_empty() {
        return Err(MailError::Message("calendar organizer is missing".into()));
    }
    let from: Mailbox = account
        .email
        .parse()
        .map_err(|e| MailError::Message(format!("invalid From: {e}")))?;
    let to: Mailbox = organizer
        .parse()
        .map_err(|e| MailError::Message(format!("invalid organizer: {e}")))?;
    let attendee = format!("mailto:{}", account.email);
    let ics=format!("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TCS Mail//Calendar Reply//PT-BR\r\nMETHOD:REPLY\r\nBEGIN:VEVENT\r\nUID:{}\r\nDTSTART:{}\r\nSUMMARY:{}\r\nATTENDEE;PARTSTAT={}:{}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n",uid,start_value,summary.replace(['\r', '\n'], " " ),partstat,attendee);
    let content_type = ContentType::parse("text/calendar; method=REPLY; charset=utf-8")
        .map_err(|e| MailError::Message(e.to_string()))?;
    let email = Message::builder()
        .from(from)
        .to(to)
        .subject(format!("Re: {summary}"))
        .singlepart(SinglePart::builder().header(content_type).body(ics))
        .map_err(|e| MailError::Message(e.to_string()))?;
    smtp_transport(account, password)?
        .send(&email)
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    Ok(())
}

fn smtp_transport_for(
    account: &Account,
    password: &str,
    port: u16,
) -> Result<SmtpTransport, MailError> {
    let credentials = Credentials::new(account.username.clone(), password.to_string());
    // 465 is implicit TLS (SMTPS). Submission ports such as 587 normally use
    // mandatory STARTTLS. Keep a short timeout so diagnostics never leave the
    // UI apparently frozen for a full minute when a firewall drops packets.
    let builder = if account.smtp_security.eq_ignore_ascii_case("tls") {
        SmtpTransport::relay(&account.smtp_host)
    } else {
        SmtpTransport::starttls_relay(&account.smtp_host)
    }
    .map_err(|e| MailError::Connection(e.to_string()))?;

    let mut builder = builder
        .port(port)
        .timeout(Some(Duration::from_secs(10)))
        .credentials(credentials);
    if account.auth_method.eq_ignore_ascii_case("oauth2") {
        builder = builder.authentication(vec![Mechanism::Xoauth2]);
    }
    Ok(builder.build())
}

fn smtp_transport(account: &Account, password: &str) -> Result<SmtpTransport, MailError> {
    smtp_transport_for(account, password, account.smtp_port)
}

fn tcp_port_reachable(host: &str, port: u16) -> bool {
    let Ok(addrs) = (host, port).to_socket_addrs() else {
        return false;
    };
    for addr in addrs {
        if TcpStream::connect_timeout(&addr, Duration::from_secs(4)).is_ok() {
            return true;
        }
    }
    false
}

/// SMTP diagnostics remain independent from the IMAP transport.
/// They are also called by the asynchronous IMAP diagnostic route.
pub fn diagnose_smtp(
    account: &Account,
    password: &str,
    report: &mut DiagnosticReport,
    details: &mut Vec<String>,
) {
    // Diagnose SMTP independently from IMAP. A mail client should be able to
    // tell the user what is wrong with outgoing mail even when incoming mail is
    // misconfigured, and vice versa.
    report.smtp_tcp = tcp_port_reachable(&account.smtp_host, account.smtp_port);
    if report.smtp_tcp {
        match smtp_transport(account, password) {
            Ok(mailer) => match mailer.test_connection() {
                Ok(value) => report.smtp = value,
                Err(e) => details.push(format!(
                    "SMTP {}:{} respondeu em TCP, mas a negociação TLS/autenticação falhou: {e}",
                    account.smtp_host, account.smtp_port
                )),
            },
            Err(e) => details.push(format!("SMTP setup: {e}")),
        }
    } else {
        let mut recommendation = None;
        for candidate in [465_u16, 587_u16, 25_u16] {
            if candidate == account.smtp_port || !tcp_port_reachable(&account.smtp_host, candidate)
            {
                continue;
            }
            if let Ok(mailer) = smtp_transport_for(account, password, candidate) {
                if matches!(mailer.test_connection(), Ok(true)) {
                    recommendation = Some(candidate);
                    report.smtp = true;
                    break;
                }
            }
        }
        report.smtp_recommended_port = recommendation;
        if let Some(port) = recommendation {
            details.push(format!(
                "SMTP {}:{} não respondeu. A porta {port} respondeu com TLS e credenciais válidas; ela pode ser aplicada à conta.",
                account.smtp_host, account.smtp_port
            ));
        } else {
            details.push(format!(
                "SMTP {}:{} não respondeu em TCP. Verifique porta publicada, firewall/NAT e DNS; nenhuma alternativa 465/587/25 foi validada automaticamente.",
                account.smtp_host, account.smtp_port
            ));
        }
    }
}

pub fn validate_address_list(raw: &str) -> Result<(), MailError> {
    split_mailboxes(raw).map(|_| ())
}

fn split_mailboxes(raw: &str) -> Result<Vec<Mailbox>, MailError> {
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    let parsed: Mailboxes = raw
        .parse()
        .map_err(|e| MailError::Message(format!("invalid address list: {e}")))?;
    Ok(parsed.iter().cloned().collect())
}

fn split_address(raw: &str) -> (String, String) {
    if let (Some(left), Some(right)) = (raw.rfind('<'), raw.rfind('>')) {
        (
            raw[..left].trim().trim_matches('"').to_string(),
            raw[left + 1..right].trim().to_string(),
        )
    } else {
        (raw.to_string(), raw.to_string())
    }
}

fn looks_like_spam(mail: &mailparse::ParsedMail<'_>) -> bool {
    let flag = mail
        .headers
        .get_first_value("X-Spam-Flag")
        .unwrap_or_default()
        .to_ascii_lowercase();
    let status = mail
        .headers
        .get_first_value("X-Spam-Status")
        .unwrap_or_default()
        .to_ascii_lowercase();
    flag == "yes" || status.starts_with("yes")
}

fn has_attachments(mail: &mailparse::ParsedMail<'_>) -> bool {
    if mail
        .headers
        .get_first_value("Content-Disposition")
        .unwrap_or_default()
        .to_ascii_lowercase()
        .contains("attachment")
    {
        return true;
    }
    mail.subparts.iter().any(has_attachments)
}

fn extract_html(mail: &mailparse::ParsedMail<'_>) -> String {
    if mail.ctype.mimetype.eq_ignore_ascii_case("text/html") {
        return mail.get_body().unwrap_or_default();
    }
    for part in &mail.subparts {
        let html = extract_html(part);
        if !html.trim().is_empty() {
            return html;
        }
    }
    String::new()
}

fn header_param(value: &str, key: &str) -> String {
    for piece in value.split(';').skip(1) {
        let mut it = piece.trim().splitn(2, '=');
        if it.next().unwrap_or("").trim().eq_ignore_ascii_case(key) {
            return it.next().unwrap_or("").trim().trim_matches('"').to_string();
        }
    }
    String::new()
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 15) as usize] as char);
    }
    out
}

fn extract_attachments(mail: &mailparse::ParsedMail<'_>) -> Vec<AttachmentInfo> {
    let mut out = Vec::new();
    fn walk(mail: &mailparse::ParsedMail<'_>, out: &mut Vec<AttachmentInfo>) {
        let disp = mail
            .headers
            .get_first_value("Content-Disposition")
            .unwrap_or_default();
        let ctype = mail
            .headers
            .get_first_value("Content-Type")
            .unwrap_or_default();
        let filename = {
            let f = header_param(&disp, "filename");
            if f.is_empty() {
                header_param(&ctype, "name")
            } else {
                f
            }
        };
        let is_attachment =
            disp.to_ascii_lowercase().contains("attachment") || !filename.is_empty();
        if is_attachment && mail.subparts.is_empty() {
            if let Ok(raw) = mail.get_body_raw() {
                out.push(AttachmentInfo {
                    filename: if filename.is_empty() {
                        "anexo".into()
                    } else {
                        filename
                    },
                    mime_type: mail.ctype.mimetype.clone(),
                    data_hex: hex_encode(&raw),
                    content_id: mail
                        .headers
                        .get_first_value("Content-ID")
                        .unwrap_or_default()
                        .trim_matches(&['<', '>'][..])
                        .to_string(),
                    part_id: String::new(),
                    size_hint: Some(raw.len() as u64),
                });
            }
        }
        for part in &mail.subparts {
            walk(part, out);
        }
    }
    walk(mail, &mut out);
    out
}

fn extract_calendar_ics(mail: &mailparse::ParsedMail<'_>) -> String {
    if mail.ctype.mimetype.eq_ignore_ascii_case("text/calendar")
        || mail.ctype.mimetype.eq_ignore_ascii_case("application/ics")
    {
        return mail.get_body().unwrap_or_default();
    }
    for part in &mail.subparts {
        let ics = extract_calendar_ics(part);
        if !ics.trim().is_empty() {
            return ics;
        }
    }
    String::new()
}

fn extract_text(mail: &mailparse::ParsedMail<'_>) -> String {
    let content_type = mail.ctype.mimetype.to_ascii_lowercase();
    if content_type == "text/plain" {
        return mail.get_body().unwrap_or_default();
    }
    if content_type == "text/html" {
        return html2text::from_read(mail.get_body().unwrap_or_default().as_bytes(), 100);
    }
    for part in &mail.subparts {
        let text = extract_text(part);
        if !text.trim().is_empty() {
            return text;
        }
    }
    String::new()
}

/// 0.7 metadata-first synchronization: fetch headers/flags only.
/// Bodies and attachments are fetched lazily with `fetch_message_by_uid`.

#[derive(Debug, Clone)]
pub struct RemoteFlagState {
    pub uid: u32,
    pub unread: bool,
    pub starred: bool,
}

/// Send once and return the exact RFC822 bytes accepted by SMTP so the same
/// message can be appended to Sent without rebuilding headers/Message-ID.
pub fn send_message_capture(
    account: &Account,
    password: &str,
    d: &MailDraft,
) -> Result<Vec<u8>, MailError> {
    let email = build_message_inner(account, d, true)?;
    let raw = email.formatted();
    smtp_transport(account, password)?
        .send(&email)
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    Ok(raw)
}

#[derive(Debug, Clone)]
pub struct LazyMessageContent {
    pub body_text: String,
    pub body_html: String,
    pub calendar_ics: String,
    pub attachments: Vec<AttachmentInfo>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_accepts_non_ascii_and_special_display_names() {
        for name in ["José da Silva", "Ana, Costa", "João \"QA\""] {
            let mailbox = sender_mailbox(name, "someone@gmail.com").unwrap();
            assert_eq!(mailbox.name.as_deref(), Some(name));
            assert_eq!(mailbox.email.to_string(), "someone@gmail.com");
        }
    }

    #[test]
    fn from_rejects_bad_address_even_when_name_is_valid() {
        assert!(sender_mailbox("José", "not-an-email").is_err());
        assert!(sender_mailbox("", "someone@gmail.com").is_ok());
    }

    #[test]
    fn split_address_handles_named_address() {
        let (name, email) = split_address("Alice Example <alice@example.com>");
        assert_eq!(name, "Alice Example");
        assert_eq!(email, "alice@example.com");
    }

    #[test]
    fn split_mailboxes_accepts_simple_list() {
        let list = split_mailboxes("a@example.com, b@example.com").unwrap();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn split_mailboxes_accepts_quoted_display_name_with_comma() {
        let list = split_mailboxes("\"Doe, John\" <john@example.com>, jane@example.com").unwrap();
        assert_eq!(list.len(), 2);
    }
}

#[cfg(test)]
mod oauth_transport_tests {
    use super::xoauth2_payload;
    #[test]
    fn xoauth2_payload_matches_google_sasl_shape() {
        assert_eq!(
            xoauth2_payload("user@example.com", "mock-access-token"),
            "user=user@example.com\x01auth=Bearer mock-access-token\x01\x01"
        );
    }
}
