//! Async IMAP transport for production routes. `mail.rs` retains MIME and SMTP
//! helpers; live-provider IMAP validation still remains pending.

use async_imap::{Authenticator, Client, Session};
use futures_util::TryStreamExt;
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};
use tokio_native_tls::{TlsConnector, TlsStream};

pub mod coordination;

use crate::mail::MailError;
use crate::models::Account;

type SecureTransport = TlsStream<TcpStream>;
type SecureSession = Session<SecureTransport>;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const TLS_TIMEOUT: Duration = Duration::from_secs(20);
const IMAP_GREETING_TIMEOUT: Duration = Duration::from_secs(20);

/// Outcome of one bounded, read-only background IDLE session.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdleOutcome {
    Changed,
    Timeout,
    Disabled,
    Unsupported,
}

/// Observe a mailbox without holding the mutation coordinator. The dedicated
/// read-only connection owns no local state and is closed on every outcome.
pub async fn idle_once<T>(
    mut session: Session<T>,
    folder: &str,
    duration: Duration,
    mut disabled: tokio::sync::watch::Receiver<bool>,
) -> Result<IdleOutcome, MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    use async_imap::extensions::idle::IdleResponse;
    use futures_util::future::{select, Either};

    checked_folder(folder)?;
    if duration.is_zero() || duration > Duration::from_secs(29 * 60) {
        return Err(MailError::Protocol("Invalid IMAP IDLE duration".into()));
    }
    if *disabled.borrow() {
        return Ok(IdleOutcome::Disabled);
    }
    let capabilities = timeout(CONNECT_TIMEOUT, session.capabilities())
        .await
        .map_err(|_| MailError::Protocol("Timeout reading IMAP capabilities".into()))?
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    if !capabilities.has_str("IDLE") {
        let _ = timeout(Duration::from_secs(5), session.logout()).await;
        return Ok(IdleOutcome::Unsupported);
    }
    timeout(CONNECT_TIMEOUT, session.examine(folder))
        .await
        .map_err(|_| MailError::Protocol("Timeout selecting mailbox for IDLE".into()))?
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let mut idle = session.idle();
    timeout(CONNECT_TIMEOUT, idle.init())
        .await
        .map_err(|_| MailError::Protocol("Timeout starting IMAP IDLE".into()))?
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let outcome = {
        let (wait, _stop) = idle.wait_with_timeout(duration);
        let cancellation = async {
            loop {
                if *disabled.borrow() || disabled.changed().await.is_err() {
                    break;
                }
            }
        };
        futures_util::pin_mut!(wait, cancellation);
        match select(wait, cancellation).await {
            Either::Left((result, _)) => {
                match result.map_err(|e| MailError::Protocol(e.to_string()))? {
                    IdleResponse::NewData(_) => IdleOutcome::Changed,
                    IdleResponse::Timeout => IdleOutcome::Timeout,
                    IdleResponse::ManualInterrupt => {
                        return Err(MailError::Protocol(
                            "IMAP IDLE interrupted unexpectedly".into(),
                        ))
                    }
                }
            }
            Either::Right((_, _)) => IdleOutcome::Disabled,
        }
    };
    let mut session = timeout(Duration::from_secs(10), idle.done())
        .await
        .map_err(|_| MailError::Protocol("Timeout stopping IMAP IDLE".into()))?
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let _ = timeout(Duration::from_secs(5), session.logout()).await;
    Ok(outcome)
}

/// Only recognize configured encrypted transports; never silently downgrade.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ImapTransport {
    ImplicitTls,
    StartTls,
}

fn transport_for(account: &Account) -> Result<ImapTransport, MailError> {
    if account.imap_host.trim().is_empty() {
        return Err(MailError::Connection("IMAP host is empty".into()));
    }
    if account.imap_port == 0 {
        return Err(MailError::Connection("IMAP port zero is invalid".into()));
    }
    match account.imap_security.trim().to_ascii_lowercase().as_str() {
        "ssl" | "tls" | "ssl/tls" | "implicit_tls" => Ok(ImapTransport::ImplicitTls),
        "starttls" => Ok(ImapTransport::StartTls),
        _ => Err(MailError::Connection(
            "Unsupported IMAP security mode; refusing to connect".into(),
        )),
    }
}

fn tls_connector() -> Result<TlsConnector, MailError> {
    let tls = native_tls::TlsConnector::builder()
        .build()
        .map_err(|e| MailError::Connection(e.to_string()))?;
    Ok(TlsConnector::from(tls))
}

async fn read_greeting<T>(client: &mut Client<T>) -> Result<(), MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    let greeting = timeout(IMAP_GREETING_TIMEOUT, client.read_response())
        .await
        .map_err(|_| MailError::Protocol("IMAP server greeting timed out".into()))?
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    if greeting.is_none() {
        return Err(MailError::Protocol(
            "IMAP server closed before greeting".into(),
        ));
    }
    Ok(())
}

/// Connect via implicit TLS or STARTTLS. STARTTLS is negotiated *before*
/// authentication, and the connection is never allowed to fall back to plaintext.
/// The server does not issue a second IMAP greeting after a STARTTLS upgrade.
pub async fn connect_tls(account: &Account) -> Result<Client<SecureTransport>, MailError> {
    let transport = transport_for(account)?;
    let socket = timeout(
        CONNECT_TIMEOUT,
        TcpStream::connect((account.imap_host.as_str(), account.imap_port)),
    )
    .await
    .map_err(|_| MailError::Connection("IMAP TCP connection timed out".into()))?
    .map_err(|e| MailError::Connection(e.to_string()))?;

    let stream = match transport {
        ImapTransport::ImplicitTls => timeout(
            TLS_TIMEOUT,
            tls_connector()?.connect(&account.imap_host, socket),
        )
        .await
        .map_err(|_| MailError::Connection("IMAP TLS handshake timed out".into()))?
        .map_err(|e| MailError::Connection(e.to_string()))?,
        ImapTransport::StartTls => {
            let mut plaintext_client = Client::new(socket);
            read_greeting(&mut plaintext_client).await?;
            // This command must succeed before credentials are ever transmitted.
            timeout(
                TLS_TIMEOUT,
                plaintext_client.run_command_and_check_ok("STARTTLS", None),
            )
            .await
            .map_err(|_| MailError::Protocol("IMAP STARTTLS command timed out".into()))?
            .map_err(|e| MailError::Protocol(e.to_string()))?;
            timeout(
                TLS_TIMEOUT,
                tls_connector()?.connect(&account.imap_host, plaintext_client.into_inner()),
            )
            .await
            .map_err(|_| MailError::Connection("IMAP STARTTLS handshake timed out".into()))?
            .map_err(|e| MailError::Connection(e.to_string()))?
        }
    };
    let mut client = Client::new(stream);
    if transport == ImapTransport::ImplicitTls {
        read_greeting(&mut client).await?;
    }
    Ok(client)
}

/// Password authentication over an encrypted transport.
pub async fn login_password(account: &Account, password: &str) -> Result<SecureSession, MailError> {
    if account.auth_method.eq_ignore_ascii_case("oauth2") {
        return Err(MailError::Authentication(
            "Use login_secure for OAuth2 authentication".into(),
        ));
    }
    connect_tls(account)
        .await?
        .login(&account.username, password)
        .await
        .map_err(|(err, _client)| MailError::Authentication(err.to_string()))
}

/// List folders with stream error propagation, not silent filtering.
pub async fn list_folder_names(session: &mut SecureSession) -> Result<Vec<String>, MailError> {
    let folders = session
        .list(None, Some("*"))
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let names = folders
        .map_ok(|entry| entry.name().to_owned())
        .try_collect()
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    Ok(names)
}

async fn folder_entries<T>(session: &mut Session<T>) -> Result<Vec<(String, String)>, MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    session
        .list(None, Some("*"))
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?
        .map_ok(|entry| {
            (
                entry.name().to_string(),
                format!("{:?}", entry.attributes()).to_ascii_lowercase(),
            )
        })
        .try_collect()
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))
}

fn archive_candidate(folder: &str, attrs: &str) -> bool {
    let low = folder.to_ascii_lowercase();
    attrs.contains("archive")
        || attrs.contains("all")
        || low.contains("archive")
        || low.contains("archives")
        || low.contains("arquivo")
        || low.contains("arquivado")
        || matches!(
            low.as_str(),
            "all mail" | "all messages" | "todos os e-mails" | "todos os emails"
        )
}

/// Discover special-use mailboxes, retaining the legacy name fallbacks.
pub async fn discover_special_folders<T>(
    session: &mut Session<T>,
) -> Result<crate::models::SpecialFolders, MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    let mut out = crate::models::SpecialFolders::default();
    for (folder, attrs) in folder_entries(session).await? {
        let low = folder.to_ascii_lowercase();
        if attrs.contains("junk") {
            out.junk = Some(folder.clone());
        } else if attrs.contains("sent") {
            out.sent = Some(folder.clone());
        } else if attrs.contains("draft") {
            out.drafts = Some(folder.clone());
        } else if attrs.contains("archive") || attrs.contains("all") {
            out.archive = Some(folder.clone());
        } else if attrs.contains("trash") {
            out.trash = Some(folder.clone());
        }
        if out.junk.is_none() && (low.contains("spam") || low.contains("junk")) {
            out.junk = Some(folder.clone());
        }
        if out.sent.is_none() && matches!(low.as_str(), "sent" | "sent mail" | "sent items") {
            out.sent = Some(folder.clone());
        }
        if out.drafts.is_none() && low.contains("draft") {
            out.drafts = Some(folder.clone());
        }
        if out.archive.is_none() && archive_candidate(&folder, "") {
            out.archive = Some(folder.clone());
        }
        if out.trash.is_none() && (low.contains("trash") || low.contains("deleted")) {
            out.trash = Some(folder.clone());
        }
    }
    Ok(out)
}

/// Derive account roles from a single LIST/LSUB snapshot. Explicit SPECIAL-USE
/// attributes always beat a folder merely named Sent, including localized Gmail.
/// Pure function: suitable for fixture tests and independent of the platform.
pub fn special_folders_from_tree(
    folders: &[crate::mail::FolderInfo],
) -> crate::models::SpecialFolders {
    let mut roles = crate::models::SpecialFolders::default();
    for f in folders.iter().filter(|f| f.selectable) {
        match f.special_use.as_deref() {
            Some("sent") => roles.sent = Some(f.name.clone()),
            Some("drafts") => roles.drafts = Some(f.name.clone()),
            Some("trash") => roles.trash = Some(f.name.clone()),
            Some("junk") => roles.junk = Some(f.name.clone()),
            Some("archive" | "all") => roles.archive = Some(f.name.clone()),
            _ => (),
        }
    }
    // Fallbacks must not replace an explicit SPECIAL-USE role. No speculative
    // mapping from an arbitrary localized mailbox name is safe.
    for f in folders.iter().filter(|f| f.selectable) {
        let name = f.name.to_ascii_lowercase();
        if roles.sent.is_none() && matches!(name.as_str(), "sent" | "sent mail" | "sent items") {
            roles.sent = Some(f.name.clone());
        }
        if roles.drafts.is_none() && matches!(name.as_str(), "drafts" | "draft") {
            roles.drafts = Some(f.name.clone());
        }
        if roles.trash.is_none() && matches!(name.as_str(), "trash" | "deleted items") {
            roles.trash = Some(f.name.clone());
        }
        if roles.junk.is_none() && matches!(name.as_str(), "junk" | "spam") {
            roles.junk = Some(f.name.clone());
        }
        if roles.archive.is_none() && matches!(name.as_str(), "archive" | "all mail") {
            roles.archive = Some(f.name.clone());
        }
    }
    roles
}

/// Find or create an archive folder. If CREATE fails, verify a possible race
/// by LIST; never report success unless the folder is observed remotely.
pub async fn ensure_archive_folder<T>(
    session: &mut Session<T>,
    preferred: Option<&str>,
) -> Result<String, MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    let names = folder_entries(session).await?;
    let preferred = preferred.map(str::trim).filter(|value| !value.is_empty());
    if let Some(preferred) = preferred {
        checked_folder(preferred)?;
        if let Some((folder, _)) = names
            .iter()
            .find(|(folder, _)| folder.eq_ignore_ascii_case(preferred))
        {
            return Ok(folder.clone());
        }
    }
    if let Some((folder, _)) = names
        .iter()
        .find(|(folder, attrs)| archive_candidate(folder, attrs))
    {
        return Ok(folder.clone());
    }
    let folder = preferred.unwrap_or("Archive").to_string();
    match session.create(&folder).await {
        Ok(()) => {
            let _ = session.subscribe(&folder).await;
            Ok(folder)
        }
        Err(error) => {
            let verification = folder_entries(session).await?;
            if let Some((actual, _)) = verification
                .iter()
                .find(|(name, _)| name.eq_ignore_ascii_case(&folder))
            {
                Ok(actual.clone())
            } else {
                Err(MailError::Protocol(format!(
                    "não foi possível criar a pasta de Arquivo '{folder}': {error}"
                )))
            }
        }
    }
}

/// Folder hierarchy with subscription and SPECIAL-USE attributes preserved.
/// LIST and LSUB failures are propagated: never silently mark all folders unsubscribed.
pub async fn list_folder_tree(
    session: &mut SecureSession,
) -> Result<Vec<crate::mail::FolderInfo>, MailError> {
    use std::collections::HashSet;
    let names = session
        .list(None, Some("*"))
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?
        .try_collect::<Vec<_>>()
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let subscribed = session
        .lsub(None, Some("*"))
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?
        .map_ok(|entry| entry.name().to_ascii_lowercase())
        .try_collect::<HashSet<_>>()
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;

    let mut folders = Vec::with_capacity(names.len());
    for name in &names {
        let full = name.name().to_string();
        let delimiter = name.delimiter().map(str::to_string);
        let attrs = format!("{:?}", name.attributes());
        let selectable = !attrs.to_ascii_lowercase().contains("noselect");
        let parent = delimiter.as_deref().and_then(|d| {
            if d.is_empty() {
                return None;
            }
            full.rfind(d)
                .and_then(|idx| (idx > 0).then(|| full[..idx].to_string()))
        });
        let display_name = delimiter
            .as_deref()
            .and_then(|d| (!d.is_empty()).then_some(d))
            .and_then(|d| full.rsplit_once(d).map(|(_, tail)| tail.to_string()))
            .unwrap_or_else(|| full.clone());
        folders.push(crate::mail::FolderInfo {
            name: full.clone(),
            display_name,
            parent,
            delimiter,
            selectable,
            subscribed: subscribed.contains(&full.to_ascii_lowercase()),
            special_use: folder_special_use(&attrs),
        });
    }
    folders.sort_by_key(|entry| entry.name.to_ascii_lowercase());
    folders.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));
    Ok(folders)
}

fn folder_special_use(attrs: &str) -> Option<String> {
    let low = attrs.to_ascii_lowercase();
    for (needle, role) in [
        ("\\sent", "sent"),
        ("\\drafts", "drafts"),
        ("\\archive", "archive"),
        ("\\trash", "trash"),
        ("\\junk", "junk"),
        ("\\all", "all"),
        ("\\flagged", "flagged"),
    ] {
        if low.contains(needle) || low.contains(role) {
            return Some(role.to_string());
        }
    }
    None
}

/// Refuse an empty mailbox name instead of relying on server-specific behavior.
fn checked_folder(folder: &str) -> Result<&str, MailError> {
    if folder.is_empty() {
        return Err(MailError::Protocol("IMAP mailbox name is empty".into()));
    }
    Ok(folder)
}

/// Fetch only Reply-To headers by UID. `BODY.PEEK` never changes the Seen flag.
/// Reject duplicate matching responses and malformed UID metadata.
pub async fn fetch_reply_to_if_epoch<T>(
    session: &mut Session<T>,
    folder: &str,
    uid: u32,
    expected_validity: u32,
) -> Result<Option<String>, MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    use mailparse::MailHeaderMap;
    if uid == 0 || expected_validity == 0 {
        return Err(MailError::Protocol("UID zero is invalid".into()));
    }
    checked_folder(folder)?;
    let mailbox = session
        .examine(folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    if mailbox.uid_validity != Some(expected_validity) {
        return Err(MailError::Protocol(
            "UIDVALIDITY ausente ou alterada; sincronize antes de responder".into(),
        ));
    }
    let stream = session
        .uid_fetch(uid.to_string(), "(UID BODY.PEEK[HEADER.FIELDS (REPLY-TO)])")
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let replies: Vec<_> = stream
        .try_collect()
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let mut value = None;
    let mut seen = false;
    for response in replies {
        if response.uid != Some(uid) {
            continue;
        }
        if seen {
            return Err(MailError::Protocol(
                "Duplicate Reply-To UID FETCH response".into(),
            ));
        }
        seen = true;
        let header = response
            .header()
            .ok_or_else(|| MailError::Protocol("Reply-To UID FETCH omitted headers".into()))?;
        let parsed =
            mailparse::parse_headers(header).map_err(|e| MailError::Message(e.to_string()))?;
        value = parsed
            .0
            .get_first_value("Reply-To")
            .filter(|v| !v.trim().is_empty());
    }
    Ok(value)
}

/// Retrieve message RFC822 bytes by UID without marking the message as seen.
pub async fn read_raw_by_uid_if_epoch<T>(
    session: &mut Session<T>,
    folder: &str,
    uid: u32,
    expected_validity: u32,
) -> Result<Option<Vec<u8>>, MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    if uid == 0 || expected_validity == 0 {
        return Err(MailError::Protocol("UID 0 is invalid".into()));
    }
    checked_folder(folder)?;
    let mailbox = session
        .examine(folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    if mailbox.uid_validity != Some(expected_validity) {
        return Err(MailError::Protocol(
            "UIDVALIDITY ausente ou alterada; sincronize antes de exportar".into(),
        ));
    }
    let responses = session
        .uid_fetch(uid.to_string(), "(UID BODY.PEEK[])")
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let fetched: Vec<_> = responses
        .try_collect()
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    // FETCH responses can also arise unsolicited. Only return the requested UID.
    // A response lacking UID must not be treated as the requested message.
    let mut raw = None;
    let mut matching_responses = 0usize;
    for item in fetched {
        if item.uid != Some(uid) {
            continue;
        }
        matching_responses += 1;
        if matching_responses > 1 {
            return Err(MailError::Protocol(format!(
                "Duplicate FETCH response for requested UID {uid}"
            )));
        }
        let body = item.body().ok_or_else(|| {
            MailError::Protocol(format!(
                "FETCH response for requested UID {uid} has no body"
            ))
        })?;
        raw = Some(body.to_vec());
    }
    Ok(raw)
}

/// Download one MIME part without setting \Seen. The caller supplies the
/// UIDVALIDITY associated with the cached local UID; a changed or missing
/// value must never be allowed to address a different remote message.
pub async fn fetch_attachment_part<T>(
    session: &mut Session<T>,
    folder: &str,
    uid: u32,
    expected_validity: u32,
    part_id: &str,
) -> Result<Vec<u8>, MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    checked_folder(folder)?;
    if uid == 0 || expected_validity == 0 {
        return Err(MailError::Protocol("Invalid UID or UIDVALIDITY".into()));
    }
    let path: Vec<u32> = part_id
        .split('.')
        .map(|component| {
            component
                .parse::<u32>()
                .ok()
                .filter(|value| *value != 0)
                .ok_or_else(|| MailError::Protocol("Invalid MIME part identifier".into()))
        })
        .collect::<Result<_, _>>()?;
    let mailbox = session
        .examine(folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    if mailbox.uid_validity != Some(expected_validity) {
        return Err(MailError::Protocol(
            "UIDVALIDITY missing or changed; resynchronize before downloading".into(),
        ));
    }
    let raw = fetch_selected_mime_part(session, uid, &path).await?;
    let parsed = mailparse::parse_mail(&raw).map_err(|e| MailError::Message(e.to_string()))?;
    parsed
        .get_body_raw()
        .map_err(|e| MailError::Message(e.to_string()))
}

/// The caller must already have selected and verified the mailbox epoch.
async fn fetch_selected_mime_part<T>(
    session: &mut Session<T>,
    uid: u32,
    path: &[u32],
) -> Result<Vec<u8>, MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    use async_imap::imap_proto::{MessageSection, SectionPath};

    let section = path
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(".");
    let query = format!("(UID BODY.PEEK[{section}.MIME] BODY.PEEK[{section}])");
    let mut responses = session
        .uid_fetch(uid.to_string(), query)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let mut raw = None;
    while let Some(item) = responses
        .try_next()
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?
    {
        if item.uid != Some(uid) {
            continue;
        }
        if raw.is_some() {
            return Err(MailError::Protocol("Duplicate UID FETCH response".into()));
        }
        let mime = item
            .section(&SectionPath::Part(
                path.to_vec(),
                Some(MessageSection::Mime),
            ))
            .ok_or_else(|| MailError::Protocol("Missing MIME headers".into()))?;
        let body = item
            .section(&SectionPath::Part(path.to_vec(), None))
            .ok_or_else(|| MailError::Protocol("Missing MIME body".into()))?;
        let mut message = Vec::with_capacity(mime.len() + body.len() + 4);
        message.extend_from_slice(mime);
        if !mime.ends_with(b"\r\n\r\n") && !mime.ends_with(b"\n\n") {
            message.extend_from_slice(b"\r\n");
        }
        message.extend_from_slice(body);
        raw = Some(message);
    }
    raw.ok_or_else(|| MailError::Protocol("Requested UID not returned".into()))
}

#[derive(Debug)]
struct AsyncMimePart {
    path: Vec<u32>,
    mime_type: String,
    filename: String,
    content_id: String,
    size: u64,
    is_attachment: bool,
}

fn collect_async_mime_parts(
    body: &async_imap::imap_proto::BodyStructure<'_>,
    prefix: &[u32],
    parts: &mut Vec<AsyncMimePart>,
) -> Result<(), MailError> {
    use async_imap::imap_proto::{BodyParams, BodyStructure};

    if prefix.len() > 64 || parts.len() >= 4096 {
        return Err(MailError::Protocol("MIME structure limit exceeded".into()));
    }
    fn param(params: &BodyParams<'_>, name: &str) -> String {
        params
            .as_ref()
            .and_then(|items| items.iter().find(|(key, _)| key.eq_ignore_ascii_case(name)))
            .map(|(_, value)| value.to_string())
            .unwrap_or_default()
    }
    match body {
        BodyStructure::Multipart { bodies, .. } => {
            for (index, child) in bodies.iter().enumerate() {
                let mut path = prefix.to_vec();
                path.push(
                    u32::try_from(index + 1)
                        .map_err(|_| MailError::Protocol("Invalid MIME section".into()))?,
                );
                collect_async_mime_parts(child, &path, parts)?;
            }
        }
        BodyStructure::Basic { common, other, .. }
        | BodyStructure::Text { common, other, .. }
        | BodyStructure::Message { common, other, .. } => {
            let mut path = prefix.to_vec();
            if path.is_empty() {
                path.push(1);
            }
            let mime_type = format!("{}/{}", common.ty.ty, common.ty.subtype).to_ascii_lowercase();
            let disposition = common
                .disposition
                .as_ref()
                .map(|v| v.ty.as_ref())
                .unwrap_or("");
            let mut filename = common
                .disposition
                .as_ref()
                .map(|v| param(&v.params, "filename"))
                .unwrap_or_default();
            if filename.is_empty() {
                filename = param(&common.ty.params, "name");
            }
            let textual = mime_type.starts_with("text/plain")
                || mime_type.starts_with("text/html")
                || mime_type.starts_with("text/calendar")
                || mime_type == "application/ics";
            parts.push(AsyncMimePart {
                path,
                mime_type,
                is_attachment: disposition.eq_ignore_ascii_case("attachment")
                    || !filename.is_empty()
                    || !textual,
                filename,
                content_id: other
                    .id
                    .as_deref()
                    .unwrap_or("")
                    .trim_matches(&['<', '>'][..])
                    .to_string(),
                size: u64::from(other.octets),
            });
        }
    }
    Ok(())
}

/// Retrieve body text and MIME metadata without transferring attachments.
pub async fn fetch_lazy_message_content<T>(
    session: &mut Session<T>,
    folder: &str,
    uid: u32,
    expected_validity: u32,
) -> Result<crate::mail::LazyMessageContent, MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    checked_folder(folder)?;
    if uid == 0 || expected_validity == 0 {
        return Err(MailError::Protocol("Invalid UID or UIDVALIDITY".into()));
    }
    let mailbox = session
        .examine(folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    if mailbox.uid_validity != Some(expected_validity) {
        return Err(MailError::Protocol(
            "UIDVALIDITY missing or changed; resynchronize before hydration".into(),
        ));
    }
    let mut responses = session
        .uid_fetch(uid.to_string(), "(UID BODYSTRUCTURE)")
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let mut parts = None;
    while let Some(item) = responses
        .try_next()
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?
    {
        if item.uid != Some(uid) {
            continue;
        }
        if parts.is_some() {
            return Err(MailError::Protocol(
                "Duplicate UID BODYSTRUCTURE response".into(),
            ));
        }
        let body = item
            .bodystructure()
            .ok_or_else(|| MailError::Protocol("Missing BODYSTRUCTURE".into()))?;
        let mut found = Vec::new();
        collect_async_mime_parts(body, &[], &mut found)?;
        parts = Some(found);
    }
    drop(responses);
    let parts = parts.ok_or_else(|| MailError::Protocol("Requested UID not returned".into()))?;
    let mut content = crate::mail::LazyMessageContent {
        body_text: String::new(),
        body_html: String::new(),
        calendar_ics: String::new(),
        attachments: Vec::new(),
    };
    for part in parts {
        let part_id = part
            .path
            .iter()
            .map(u32::to_string)
            .collect::<Vec<_>>()
            .join(".");
        if part.is_attachment {
            content.attachments.push(crate::models::AttachmentInfo {
                filename: if part.filename.is_empty() {
                    format!("anexo-{part_id}")
                } else {
                    part.filename
                },
                mime_type: part.mime_type,
                data_hex: String::new(),
                content_id: part.content_id,
                part_id,
                size_hint: Some(part.size),
            });
            continue;
        }
        let raw = fetch_selected_mime_part(session, uid, &part.path).await?;
        let parsed = mailparse::parse_mail(&raw).map_err(|e| MailError::Message(e.to_string()))?;
        let decoded = parsed
            .get_body()
            .map_err(|e| MailError::Message(e.to_string()))?;
        if part.mime_type.starts_with("text/plain") && content.body_text.is_empty() {
            content.body_text = decoded;
        } else if part.mime_type.starts_with("text/html") && content.body_html.is_empty() {
            content.body_html = decoded;
        } else if (part.mime_type.starts_with("text/calendar")
            || part.mime_type == "application/ics")
            && content.calendar_ics.is_empty()
        {
            content.calendar_ics = decoded;
        }
    }
    Ok(content)
}

/// Fetch a mailbox's UID/flag snapshot without downloading message bodies.
/// Never apply a malformed snapshot to local persistence. An IMAP server may
/// send unrequested FETCH updates; protocol integration tests remain required.
/// This supports the later replacement of metadata-first reconciliation.
/// A UID of zero is not a valid persistent message identifier.
pub async fn fetch_folder_flag_state<T>(
    session: &mut Session<T>,
    folder: &str,
) -> Result<(Vec<crate::mail::RemoteFlagState>, Option<u32>), MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    checked_folder(folder)?;
    let mailbox = session
        .examine(folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    if mailbox.exists == 0 {
        return Ok((Vec::new(), mailbox.uid_validity));
    }
    let responses = session
        .uid_fetch("1:*", "(UID FLAGS)")
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let fetched: Vec<_> = responses
        .try_collect()
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    // An incomplete response must not be reconciled as a complete mailbox.
    // EXAMINE/UID FETCH races are treated conservatively as retryable errors.
    if fetched.len() != mailbox.exists as usize {
        return Err(MailError::Protocol(format!(
            "Incomplete IMAP flag snapshot: expected {} messages, received {}",
            mailbox.exists,
            fetched.len()
        )));
    }
    // A partial snapshot must never be mistaken for a complete remote mailbox:
    // reconciliation could otherwise delete valid local metadata. Fail closed on
    // malformed or duplicate UIDs rather than silently dropping responses.
    let mut states = Vec::with_capacity(fetched.len());
    let mut seen_uids = std::collections::HashSet::with_capacity(fetched.len());
    for item in fetched {
        let uid = item.uid.filter(|uid| *uid != 0).ok_or_else(|| {
            MailError::Protocol("IMAP flag snapshot returned missing or zero UID".into())
        })?;
        if !seen_uids.insert(uid) {
            return Err(MailError::Protocol(format!(
                "IMAP flag snapshot returned duplicate UID {uid}"
            )));
        }
        if !item.has_single_flags() {
            return Err(MailError::Protocol(format!(
                "IMAP flag snapshot has missing or duplicate FLAGS for UID {uid}"
            )));
        }
        let unread = !item
            .flags()
            .any(|flag| matches!(flag, async_imap::types::Flag::Seen));
        let starred = item
            .flags()
            .any(|flag| matches!(flag, async_imap::types::Flag::Flagged));
        states.push(crate::mail::RemoteFlagState {
            uid,
            unread,
            starred,
        });
    }
    states.sort_unstable_by_key(|entry| entry.uid);
    if states.len() > mailbox.exists as usize {
        return Err(MailError::Protocol(
            "IMAP flag snapshot exceeds selected mailbox size".into(),
        ));
    }
    Ok((states, mailbox.uid_validity))
}

/// OAuth2 challenge handler. Keep the access token out of logs and errors.
struct XOAuth2<'a> {
    username: &'a str,
    access_token: &'a str,
}

impl Authenticator for XOAuth2<'_> {
    type Response = String;

    fn process(&mut self, _challenge: &[u8]) -> Self::Response {
        crate::mail::xoauth2_payload(self.username, self.access_token)
    }
}

/// Authenticate over an already TLS-protected IMAP connection.
/// `credential` is a password or OAuth2 access token according to the account.
/// The caller is responsible for refreshing OAuth2 tokens before connecting.
pub async fn login_secure(account: &Account, credential: &str) -> Result<SecureSession, MailError> {
    if account.username.trim().is_empty() {
        return Err(MailError::Authentication("IMAP username is empty".into()));
    }
    if credential.is_empty() {
        return Err(MailError::Authentication("IMAP credential is empty".into()));
    }
    let client = connect_tls(account).await?;
    if account.auth_method.eq_ignore_ascii_case("oauth2") {
        client
            .authenticate(
                "XOAUTH2",
                XOAuth2 {
                    username: &account.username,
                    access_token: credential,
                },
            )
            .await
            .map_err(|(err, _client)| MailError::Authentication(err.to_string()))
    } else {
        client
            .login(&account.username, credential)
            .await
            .map_err(|(err, _client)| MailError::Authentication(err.to_string()))
    }
}

/// Test the IMAP connection via the production asynchronous transport, while
/// keeping SMTP diagnostics independent. Never include account secrets in reports.
pub async fn diagnose_imap(
    account: &Account,
    credential: &str,
) -> (crate::models::DiagnosticReport, Vec<String>) {
    let mut report = crate::models::DiagnosticReport::default();
    let mut details = Vec::new();
    // Connection and authentication diagnostics must remain distinct.
    match connect_tls(account).await {
        Ok(_) => {
            report.imap_connect = true;
            match timeout(Duration::from_secs(45), login_secure(account, credential)).await {
                Ok(Ok(mut session)) => {
                    report.imap_login = true;
                    let operation = timeout(Duration::from_secs(90), async {
                        session
                            .select("INBOX")
                            .await
                            .map_err(|e| format!("SELECT INBOX: {e}"))?;
                        report.select_inbox = true;
                        let uids = session
                            .uid_search("ALL")
                            .await
                            .map_err(|e| format!("UID SEARCH: {e}"))?;
                        report.search = true;
                        if let Some(uid) = uids.iter().max() {
                            let mut fetches = session
                                .uid_fetch(uid.to_string(), "(UID FLAGS BODY.PEEK[])")
                                .await
                                .map_err(|e| format!("UID FETCH: {e}"))?;
                            let mut matched = false;
                            while let Some(item) = fetches
                                .try_next()
                                .await
                                .map_err(|e| format!("UID FETCH: {e}"))?
                            {
                                if item.uid == Some(*uid) {
                                    matched = true;
                                }
                            }
                            if !matched {
                                return Err(
                                    "UID FETCH: selected UID missing in response".to_owned()
                                );
                            }
                        }
                        report.fetch = true;
                        Ok::<(), String>(())
                    })
                    .await;
                    match operation {
                        Ok(Ok(())) => (),
                        Ok(Err(err)) => details.push(err),
                        Err(_) => details.push("IMAP diagnostic timed out".to_owned()),
                    }
                    let _ = timeout(Duration::from_secs(8), session.logout()).await;
                }
                Ok(Err(err)) => details.push(format!("IMAP authentication: {err}")),
                Err(_) => details.push("IMAP authentication timed out".to_owned()),
            }
        }
        Err(err) => details.push(format!("IMAP connection: {err}")),
    }
    (report, details)
}

/// Mutations operate only on explicitly provided mailbox names; the caller
/// must apply the existing account/folder authorization rules beforehand.
pub async fn create_folder(session: &mut SecureSession, folder: &str) -> Result<(), MailError> {
    session
        .create(folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))
}

pub async fn rename_folder(
    session: &mut SecureSession,
    old_name: &str,
    new_name: &str,
) -> Result<(), MailError> {
    session
        .rename(old_name, new_name)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))
}

pub async fn delete_folder(session: &mut SecureSession, folder: &str) -> Result<(), MailError> {
    session
        .delete(folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))
}

pub async fn set_subscription(
    session: &mut SecureSession,
    folder: &str,
    subscribed: bool,
) -> Result<(), MailError> {
    let result = if subscribed {
        session.subscribe(folder).await
    } else {
        session.unsubscribe(folder).await
    };
    result.map_err(|e| MailError::Protocol(e.to_string()))
}

/// Search for UIDs in a selected mailbox. Avoid lossy result conversions.
pub async fn search_uids(
    session: &mut SecureSession,
    folder: &str,
    criteria: &str,
) -> Result<Vec<u32>, MailError> {
    checked_folder(folder)?;
    if criteria.trim().is_empty() {
        return Err(MailError::Protocol("IMAP search criteria are empty".into()));
    }
    session
        .examine(folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let found = session
        .uid_search(criteria)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    if found.contains(&0) {
        return Err(MailError::Protocol(
            "IMAP UID SEARCH returned UID zero".into(),
        ));
    }
    let mut uids: Vec<u32> = found.into_iter().collect();
    uids.sort_unstable();
    debug_assert!(uids.windows(2).all(|window| window[0] < window[1]));
    Ok(uids)
}

/// Validate a single UID before issuing a mutating command. Sequence numbers
/// and UID 0 must never be silently substituted for a UID.
fn checked_uid(uid: u32) -> Result<String, MailError> {
    if uid == 0 {
        return Err(MailError::Protocol(
            "IMAP UID must be greater than zero".into(),
        ));
    }
    Ok(uid.to_string())
}

/// Copy a message identified by UID, never by its unstable sequence number.
pub async fn copy_uid(
    session: &mut SecureSession,
    source_folder: &str,
    uid: u32,
    destination_folder: &str,
) -> Result<(), MailError> {
    let uid = checked_uid(uid)?;
    checked_folder(source_folder)?;
    checked_folder(destination_folder)?;
    session
        .select(source_folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    session
        .uid_copy(&uid, destination_folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))
}

/// Move using UID MOVE. Do not emulate MOVE with COPY and EXPUNGE, which can
/// remove unrelated messages and is not equivalent under concurrent clients.
pub async fn move_uid(
    session: &mut SecureSession,
    source_folder: &str,
    uid: u32,
    destination_folder: &str,
) -> Result<(), MailError> {
    move_uid_impl(session, source_folder, uid, destination_folder, None).await
}

pub async fn move_uid_if_epoch<T>(
    session: &mut Session<T>,
    source_folder: &str,
    uid: u32,
    destination_folder: &str,
    validity: u32,
) -> Result<(), MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    if validity == 0 {
        return Err(MailError::Protocol("Invalid UIDVALIDITY".into()));
    }
    move_uid_impl(
        session,
        source_folder,
        uid,
        destination_folder,
        Some(validity),
    )
    .await
}

async fn move_uid_impl<T>(
    session: &mut Session<T>,
    source_folder: &str,
    uid: u32,
    destination_folder: &str,
    validity: Option<u32>,
) -> Result<(), MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    let uid = checked_uid(uid)?;
    checked_folder(source_folder)?;
    checked_folder(destination_folder)?;
    let selected = session
        .select(source_folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    if validity.is_some() && selected.uid_validity != validity {
        return Err(MailError::Protocol(
            "UIDVALIDITY missing or changed; refusing MOVE".into(),
        ));
    }
    if validity.is_some() {
        let found = session
            .uid_search(format!("UID {uid}"))
            .await
            .map_err(|e| MailError::Protocol(e.to_string()))?;
        if !found.contains(
            &uid.parse::<u32>()
                .map_err(|e| MailError::Protocol(e.to_string()))?,
        ) {
            return Err(MailError::Protocol(
                "UID not found in selected mailbox".into(),
            ));
        }
    }
    session
        .uid_mv(&uid, destination_folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))
}

/// Permanently delete exactly one UID; refuse servers without UIDPLUS.
/// Never fall back to mailbox-wide EXPUNGE, which could remove other clients' mail.
pub async fn delete_uid_permanently(
    session: &mut SecureSession,
    folder: &str,
    uid: u32,
) -> Result<(), MailError> {
    delete_uid_permanently_impl(session, folder, uid, None).await
}

/// Delete a cached identity only when SELECT confirms its mailbox epoch.
pub async fn delete_uid_permanently_if_epoch<T>(
    session: &mut Session<T>,
    folder: &str,
    uid: u32,
    expected_validity: u32,
) -> Result<(), MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    if expected_validity == 0 {
        return Err(MailError::Protocol("Invalid UIDVALIDITY".into()));
    }
    delete_uid_permanently_impl(session, folder, uid, Some(expected_validity)).await
}

async fn delete_uid_permanently_impl<T>(
    session: &mut Session<T>,
    folder: &str,
    uid: u32,
    expected_validity: Option<u32>,
) -> Result<(), MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    let uid = checked_uid(uid)?;
    checked_folder(folder)?;
    let capabilities = session
        .capabilities()
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    if !capabilities.has_str("UIDPLUS") {
        return Err(MailError::Protocol(
            "Permanent deletion requires UIDPLUS; refusing broad EXPUNGE".into(),
        ));
    }
    let mailbox = session
        .select(folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    if expected_validity.is_some() && mailbox.uid_validity != expected_validity {
        return Err(MailError::Protocol(
            "UIDVALIDITY missing or changed; refusing permanent deletion".into(),
        ));
    }
    // A stale local UID must not be treated as a confirmed server-side deletion.
    let found = session
        .uid_search(format!("UID {uid}"))
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let parsed_uid: u32 = uid
        .parse()
        .map_err(|e: std::num::ParseIntError| MailError::Protocol(e.to_string()))?;
    if !found.contains(&parsed_uid) {
        return Err(MailError::Protocol(
            "UID not found in selected mailbox".into(),
        ));
    }
    let store = session
        .uid_store(&uid, "+FLAGS.SILENT (\\Deleted)")
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let _: Vec<_> = store
        .try_collect()
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let expunged = session
        .uid_expunge(&uid)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let _: Vec<_> = expunged
        .try_collect()
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    Ok(())
}

/// Remove server drafts associated with an application draft key using only UID-targeted
/// deletion. Never use mailbox-wide EXPUNGE; a partially completed deletion is
/// reported as an error and is not retried automatically by this function.
pub async fn delete_draft_by_key_secure(
    session: &mut SecureSession,
    folder: &str,
    key: &str,
) -> Result<usize, MailError> {
    let key = key.trim();
    if key.is_empty() {
        return Ok(0);
    }
    // The key is a quoted IMAP search argument. Newline and other control
    // characters must never enter the wire command as untrusted input.
    if key.chars().any(char::is_control) {
        return Err(MailError::Protocol("Invalid draft identifier".into()));
    }
    let escaped = key.replace('\\', "\\\\").replace('"', "\\\"");
    let criteria = format!("HEADER X-TCS-Draft-ID \"{escaped}\"");
    let uids = search_uids(session, folder, &criteria).await?;
    for uid in &uids {
        delete_uid_permanently(session, folder, *uid).await?;
    }
    Ok(uids.len())
}

/// Change a single standard flag and fully consume the STORE response stream
/// so protocol errors are not lost before the next command.
pub async fn set_seen_uid(
    session: &mut SecureSession,
    folder: &str,
    uid: u32,
    seen: bool,
) -> Result<(), MailError> {
    let uid = checked_uid(uid)?;
    checked_folder(folder)?;
    session
        .select(folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let command = if seen {
        "+FLAGS.SILENT (\\Seen)"
    } else {
        "-FLAGS.SILENT (\\Seen)"
    };
    let responses = session
        .uid_store(&uid, command)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let _: Vec<_> = responses
        .try_collect()
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    Ok(())
}

/// Changes the Flagged state by UID, never by sequence number.
/// Consumes the entire STORE stream to surface delayed protocol errors.
pub async fn set_starred_uid(
    session: &mut SecureSession,
    folder: &str,
    uid: u32,
    starred: bool,
) -> Result<(), MailError> {
    let uid = checked_uid(uid)?;
    checked_folder(folder)?;
    session
        .select(folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let command = if starred {
        "+FLAGS.SILENT (\\Flagged)"
    } else {
        "-FLAGS.SILENT (\\Flagged)"
    };
    let responses = session
        .uid_store(&uid, command)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let _: Vec<_> = responses
        .try_collect()
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    Ok(())
}

/// Apply both remotely stored message flags in a single selected mailbox.
/// A failure in either STORE is propagated; callers must not commit optimistic
/// local flag changes unless this method returns successfully.
pub async fn set_message_flags_uid(
    session: &mut SecureSession,
    folder: &str,
    uid: u32,
    seen: Option<bool>,
    starred: Option<bool>,
) -> Result<(), MailError> {
    set_message_flags_uid_impl(session, folder, uid, seen, starred, None).await
}

pub async fn set_message_flags_uid_if_epoch<T>(
    session: &mut Session<T>,
    folder: &str,
    uid: u32,
    seen: Option<bool>,
    starred: Option<bool>,
    validity: u32,
) -> Result<(), MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    if validity == 0 {
        return Err(MailError::Protocol("Invalid UIDVALIDITY".into()));
    }
    set_message_flags_uid_impl(session, folder, uid, seen, starred, Some(validity)).await
}

async fn set_message_flags_uid_impl<T>(
    session: &mut Session<T>,
    folder: &str,
    uid: u32,
    seen: Option<bool>,
    starred: Option<bool>,
    validity: Option<u32>,
) -> Result<(), MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    let uid = checked_uid(uid)?;
    checked_folder(folder)?;
    if seen.is_none() && starred.is_none() {
        return Ok(());
    }
    let selected = session
        .select(folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    if validity.is_some() && selected.uid_validity != validity {
        return Err(MailError::Protocol(
            "UIDVALIDITY missing or changed; refusing flag mutation".into(),
        ));
    }
    if validity.is_some() {
        let found = session
            .uid_search(format!("UID {uid}"))
            .await
            .map_err(|e| MailError::Protocol(e.to_string()))?;
        if !found.contains(
            &uid.parse::<u32>()
                .map_err(|e| MailError::Protocol(e.to_string()))?,
        ) {
            return Err(MailError::Protocol(
                "UID not found in selected mailbox".into(),
            ));
        }
    }
    for (flag, enabled) in [("\\Seen", seen), ("\\Flagged", starred)] {
        if let Some(enabled) = enabled {
            let command = if enabled {
                format!("+FLAGS.SILENT ({flag})")
            } else {
                format!("-FLAGS.SILENT ({flag})")
            };
            let responses = session
                .uid_store(&uid, &command)
                .await
                .map_err(|e| MailError::Protocol(e.to_string()))?;
            let _: Vec<_> = responses
                .try_collect()
                .await
                .map_err(|e| MailError::Protocol(e.to_string()))?;
        }
    }
    Ok(())
}

/// Append complete RFC822 bytes without converting binary data to text.
/// Any retry after a lost acknowledgement must check for duplicates first.
pub async fn append_raw(
    session: &mut SecureSession,
    folder: &str,
    raw: &[u8],
) -> Result<(), MailError> {
    if raw.is_empty() {
        return Err(MailError::Protocol("Cannot append an empty message".into()));
    }
    session
        .append(folder, None, None, raw)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))
}

/// Write a new remote draft before removing previous revisions. A failed APPEND
/// never destroys the previous remote draft. Do not retry ambiguous APPEND errors
/// automatically: the server may have accepted the payload without acknowledging.
pub async fn replace_draft_by_key_secure(
    session: &mut SecureSession,
    folder: &str,
    draft_key: &str,
    raw: &[u8],
) -> Result<Option<u32>, MailError> {
    checked_folder(folder)?;
    if raw.is_empty() || draft_key.trim().is_empty() || draft_key.chars().any(char::is_control) {
        return Err(MailError::Protocol(
            "Invalid remote draft payload or key".into(),
        ));
    }
    let escaped = draft_key.trim().replace('\\', "\\\\").replace('"', "\\\"");
    let criteria = format!("HEADER X-TCS-Draft-ID \"{escaped}\"");
    let previous = search_uids(session, folder, &criteria).await?;
    if !previous.is_empty() {
        let capabilities = session
            .capabilities()
            .await
            .map_err(|e| MailError::Protocol(e.to_string()))?;
        if !capabilities.has_str("UIDPLUS") {
            return Err(MailError::Protocol(
                "Replacing an existing draft requires UIDPLUS".into(),
            ));
        }
    }
    session
        .append(folder, Some(r"(\Draft)"), None, raw)
        .await
        .map_err(|e| {
            MailError::Protocol(format!(
                "Draft APPEND outcome uncertain; review before retrying: {e}"
            ))
        })?;
    // Search again only after the new APPEND succeeds. The new UID is never
    // included in `previous`, so cleanup cannot target the newly saved draft.
    let observed = search_uids(session, folder, &criteria).await?;
    let fresh = observed
        .iter()
        .copied()
        .filter(|uid| !previous.contains(uid))
        .max();
    if fresh.is_none() {
        return Err(MailError::Protocol(
            "APPEND acknowledged, but new draft UID was not confirmed; review before retrying"
                .into(),
        ));
    }
    for old_uid in previous {
        delete_uid_permanently(session, folder, old_uid).await?;
    }
    Ok(fresh)
}

/// Incremental RFC822 synchronization using a single async IMAP session.
/// UID ranges are filtered locally as `UID n:*` may include UID n-1 when no
/// greater UID exists. Empty searches never advance the cursor.
/// A transport failure propagates before the caller can persist a partial batch.
pub async fn sync_folder_since<T>(
    session: &mut Session<T>,
    account: &Account,
    folder: &str,
    last_uid: u32,
    limit: usize,
    force_spam: bool,
) -> Result<(Vec<crate::models::MessageSummary>, u32, Option<u32>), MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    if limit == 0 {
        return Err(MailError::Protocol(
            "IMAP sync limit must be positive".into(),
        ));
    }
    checked_folder(folder)?;
    let mailbox = session
        .select(folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    if mailbox.exists == 0 {
        return Ok((Vec::new(), last_uid, mailbox.uid_validity));
    }
    // No UID can exceed u32::MAX. Do not saturate and issue UID MAX:*:
    // IMAP ranges can match the last message again, causing duplicate work.
    if last_uid == u32::MAX {
        return Ok((Vec::new(), last_uid, mailbox.uid_validity));
    }
    let query = if last_uid > 0 {
        format!("UID {}:*", last_uid + 1)
    } else {
        "ALL".to_string()
    };
    let search_result = session
        .uid_search(query)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    if search_result.contains(&0) {
        return Err(MailError::Protocol(
            "IMAP UID SEARCH returned UID zero".into(),
        ));
    }
    let mut uids: Vec<u32> = search_result
        .into_iter()
        .filter(|uid| *uid > last_uid)
        .collect();
    uids.sort_unstable();
    let selected: Vec<u32> = if last_uid == 0 {
        uids.into_iter().rev().take(limit).collect()
    } else {
        uids.into_iter().take(limit).collect()
    };
    let max_uid = selected.iter().copied().max().unwrap_or(last_uid);
    if selected.is_empty() {
        return Ok((Vec::new(), max_uid, mailbox.uid_validity));
    }
    let sequence = selected
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let stream = session
        .uid_fetch(sequence, "(UID FLAGS BODY.PEEK[HEADER] BODYSTRUCTURE)")
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let fetched: Vec<_> = stream
        .try_collect()
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    // Do not advance the local cursor if the server omitted a requested UID or
    // returned an unparseable message. Such a cursor would silently skip mail.
    let selected_set: std::collections::HashSet<u32> = selected.iter().copied().collect();
    if selected_set.len() != selected.len() {
        return Err(MailError::Protocol(
            "Duplicate UID in selected IMAP search batch".into(),
        ));
    }
    let mut received = std::collections::HashSet::with_capacity(selected.len());
    let mut messages = Vec::with_capacity(fetched.len());
    for item in fetched {
        let uid = item.uid.ok_or_else(|| {
            MailError::Protocol(
                "IMAP FETCH response omitted UID; refusing cursor advancement".into(),
            )
        })?;
        if uid == 0 {
            return Err(MailError::Protocol("IMAP FETCH returned UID zero".into()));
        }
        if !selected_set.contains(&uid) {
            continue;
        }
        let raw = item.header().ok_or_else(|| {
            MailError::Protocol(format!("IMAP FETCH for UID {uid} omitted message header"))
        })?;
        let structure = item.bodystructure().ok_or_else(|| {
            MailError::Protocol(format!("IMAP FETCH for UID {uid} omitted BODYSTRUCTURE"))
        })?;
        if !received.insert(uid) {
            return Err(MailError::Protocol(format!(
                "Duplicate IMAP FETCH UID {uid}"
            )));
        }
        if !item.has_single_flags() {
            return Err(MailError::Protocol(format!(
                "IMAP FETCH has missing or duplicate FLAGS for UID {uid}"
            )));
        }
        let unread = !item
            .flags()
            .any(|f| matches!(f, async_imap::types::Flag::Seen));
        let starred = item
            .flags()
            .any(|f| matches!(f, async_imap::types::Flag::Flagged));
        let mut summary =
            crate::mail::summary_from_raw(account, folder, uid, raw, unread, starred, force_spam)
                .ok_or_else(|| {
                MailError::Message(format!("Unable to parse IMAP UID {uid}; cursor unchanged"))
            })?;
        let mut parts = Vec::new();
        collect_async_mime_parts(structure, &[], &mut parts)?;
        summary.has_attachments = parts.iter().any(|part| part.is_attachment);
        summary.attachments.clear();
        summary.body_text.clear();
        summary.body_html.clear();
        summary.calendar_ics.clear();
        summary.snippet.clear();
        messages.push(summary);
    }
    if received != selected_set {
        return Err(MailError::Protocol(
            "Incomplete IMAP FETCH batch; cursor must not advance".into(),
        ));
    }
    messages.sort_by_key(|m| std::cmp::Reverse(m.date));
    Ok((messages, max_uid, mailbox.uid_validity))
}

/// Fetch the next older UID page. Never advance the historical cursor after
/// an incomplete or unparseable FETCH response.
pub async fn sync_folder_before<T>(
    session: &mut Session<T>,
    account: &Account,
    folder: &str,
    before_uid: u32,
    limit: usize,
    force_spam: bool,
) -> Result<(Vec<crate::models::MessageSummary>, Option<u32>, Option<u32>), MailError>
where
    T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + std::fmt::Debug + Send,
{
    checked_folder(folder)?;
    if limit == 0 || before_uid <= 1 {
        return Err(MailError::Protocol(
            "Invalid historical IMAP cursor or limit".into(),
        ));
    }
    let mailbox = session
        .select(folder)
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    if mailbox.exists == 0 {
        return Ok((Vec::new(), None, mailbox.uid_validity));
    }
    let found = session
        .uid_search(format!("UID 1:{}", before_uid - 1))
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    if found.contains(&0) {
        return Err(MailError::Protocol(
            "IMAP UID SEARCH returned UID zero".into(),
        ));
    }
    let mut uids: Vec<u32> = found.into_iter().filter(|uid| *uid < before_uid).collect();
    uids.sort_unstable_by(|a, b| b.cmp(a));
    let selected: Vec<u32> = uids.into_iter().take(limit).collect();
    if selected.is_empty() {
        return Ok((Vec::new(), None, mailbox.uid_validity));
    }
    let sequence = selected
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    let fetched: Vec<_> = session
        .uid_fetch(sequence, "(UID FLAGS BODY.PEEK[HEADER] BODYSTRUCTURE)")
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?
        .try_collect()
        .await
        .map_err(|e| MailError::Protocol(e.to_string()))?;
    let expected: std::collections::HashSet<u32> = selected.iter().copied().collect();
    let mut received = std::collections::HashSet::new();
    let mut messages = Vec::with_capacity(selected.len());
    for item in fetched {
        let uid = item
            .uid
            .ok_or_else(|| MailError::Protocol("Historical IMAP FETCH omitted UID".into()))?;
        if !expected.contains(&uid) {
            return Err(MailError::Protocol(format!(
                "Unexpected historical IMAP UID {uid}"
            )));
        }
        if !received.insert(uid) {
            return Err(MailError::Protocol(format!(
                "Duplicate historical IMAP UID {uid}"
            )));
        }
        let raw = item.header().ok_or_else(|| {
            MailError::Protocol(format!("Historical IMAP UID {uid} omitted header"))
        })?;
        let structure = item.bodystructure().ok_or_else(|| {
            MailError::Protocol(format!("Historical IMAP UID {uid} omitted BODYSTRUCTURE"))
        })?;
        if !item.has_single_flags() {
            return Err(MailError::Protocol(format!(
                "Historical IMAP FETCH has missing or duplicate FLAGS for UID {uid}"
            )));
        }
        let unread = !item
            .flags()
            .any(|flag| matches!(flag, async_imap::types::Flag::Seen));
        let starred = item
            .flags()
            .any(|flag| matches!(flag, async_imap::types::Flag::Flagged));
        let mut summary = crate::mail::summary_from_raw(
            account, folder, uid, raw, unread, starred, force_spam,
        )
        .ok_or_else(|| MailError::Message(format!("Cannot parse historical IMAP UID {uid}")))?;
        let mut parts = Vec::new();
        collect_async_mime_parts(structure, &[], &mut parts)?;
        summary.has_attachments = parts.iter().any(|part| part.is_attachment);
        summary.attachments.clear();
        summary.body_text.clear();
        summary.body_html.clear();
        summary.calendar_ics.clear();
        summary.snippet.clear();
        messages.push(summary);
    }
    if received != expected {
        return Err(MailError::Protocol(
            "Incomplete historical IMAP FETCH; cursor unchanged".into(),
        ));
    }
    messages.sort_by_key(|m| std::cmp::Reverse(m.date));
    Ok((
        messages,
        selected.iter().min().copied(),
        mailbox.uid_validity,
    ))
}

#[cfg(test)]
mod migration_unit_tests {
    use super::{checked_folder, checked_uid};
    #[test]
    fn empty_folder_is_rejected() {
        assert!(checked_folder("").is_err());
        assert_eq!(checked_folder("INBOX").unwrap(), "INBOX");
    }
    #[test]
    fn uid_zero_is_rejected() {
        assert!(checked_uid(0).is_err());
    }
    #[test]
    fn nonzero_uids_are_preserved_exactly() {
        assert_eq!(checked_uid(1).unwrap(), "1");
        assert_eq!(checked_uid(u32::MAX).unwrap(), "4294967295");
        assert_eq!(checked_uid(u32::MAX - 1).unwrap(), "4294967294");
    }
}

#[cfg(test)]
mod attachment_protocol_tests {
    use super::{
        delete_uid_permanently_if_epoch, discover_special_folders, ensure_archive_folder,
        fetch_attachment_part, fetch_folder_flag_state, fetch_lazy_message_content, idle_once,
        move_uid_if_epoch, set_message_flags_uid_if_epoch, sync_folder_before, sync_folder_since,
        IdleOutcome,
    };
    use futures_util::TryStreamExt;
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::time::Duration;

    #[derive(Clone, Copy)]
    enum CompletionFixture {
        StoreNo,
        FetchPartialNo,
        SearchNo,
        ExpungeNo,
        CapabilityNo,
        SearchEof,
        SelectEof,
    }

    fn completion_fixture(case: CompletionFixture) -> Result<(), String> {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            socket.write_all(b"* OK fixture ready\r\n").unwrap();
            let tag = command(&mut reader, "LOGIN");
            write!(socket, "{tag} OK authenticated\r\n").unwrap();
            if matches!(case, CompletionFixture::CapabilityNo) {
                let tag = command(&mut reader, "CAPABILITY");
                write!(
                    socket,
                    "* CAPABILITY IMAP4rev1 UIDPLUS\r\n{tag} NO capability denied\r\n"
                )
                .unwrap();
                return;
            }
            let tag = command(&mut reader, "SELECT");
            socket
                .write_all(b"* 1 EXISTS\r\n* OK [UIDVALIDITY 71] valid\r\n")
                .unwrap();
            if matches!(case, CompletionFixture::SelectEof) {
                return;
            }
            write!(socket, "{tag} OK selected\r\n").unwrap();
            let command_name = match case {
                CompletionFixture::StoreNo => "UID STORE",
                CompletionFixture::FetchPartialNo => "UID FETCH",
                CompletionFixture::SearchNo | CompletionFixture::SearchEof => "UID SEARCH",
                CompletionFixture::ExpungeNo => "UID EXPUNGE",
                _ => unreachable!(),
            };
            let tag = command(&mut reader, command_name);
            match case {
                CompletionFixture::FetchPartialNo => socket
                    .write_all(b"* 1 FETCH (UID 42 FLAGS ())\r\n")
                    .unwrap(),
                CompletionFixture::SearchNo | CompletionFixture::SearchEof => {
                    socket.write_all(b"* SEARCH 42\r\n").unwrap()
                }
                CompletionFixture::ExpungeNo => socket.write_all(b"* 1 EXPUNGE\r\n").unwrap(),
                _ => (),
            }
            if !matches!(case, CompletionFixture::SearchEof) {
                write!(socket, "{tag} NO command failed\r\n").unwrap();
            }
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = runtime.block_on(async {
            let stream = tokio::net::TcpStream::connect(address).await.unwrap();
            let mut client = async_imap::Client::new(stream);
            client.read_response().await.unwrap().unwrap();
            let mut session = client.login("synthetic", "synthetic").await.unwrap();
            tokio::time::timeout(Duration::from_secs(5), async {
                if matches!(case, CompletionFixture::CapabilityNo) {
                    return session.capabilities().await.map(|_| ());
                }
                session.select("INBOX").await?;
                match case {
                    CompletionFixture::StoreNo => session
                        .uid_store("42", "+FLAGS.SILENT (\\Seen)")
                        .await?
                        .try_collect::<Vec<_>>()
                        .await
                        .map(|_| ()),
                    CompletionFixture::FetchPartialNo => session
                        .uid_fetch("42", "(UID FLAGS)")
                        .await?
                        .try_collect::<Vec<_>>()
                        .await
                        .map(|_| ()),
                    CompletionFixture::SearchNo | CompletionFixture::SearchEof => {
                        session.uid_search("UID 42").await.map(|_| ())
                    }
                    CompletionFixture::ExpungeNo => session
                        .uid_expunge("42")
                        .await?
                        .try_collect::<Vec<_>>()
                        .await
                        .map(|_| ()),
                    _ => unreachable!(),
                }
            })
            .await
            .unwrap()
            .map_err(|e| e.to_string())
        });
        server.join().unwrap();
        result
    }

    #[test]
    fn partial_or_rejected_commands_never_report_success() {
        for case in [
            CompletionFixture::StoreNo,
            CompletionFixture::FetchPartialNo,
            CompletionFixture::SearchNo,
            CompletionFixture::ExpungeNo,
            CompletionFixture::CapabilityNo,
            CompletionFixture::SearchEof,
            CompletionFixture::SelectEof,
        ] {
            assert!(completion_fixture(case).is_err());
        }
    }

    #[derive(Clone, Copy)]
    enum FolderFixture {
        Discover,
        Preferred,
        Special,
        Create,
        Race,
        CreateFailure,
        ListFailure,
    }

    fn folder_fixture(case: FolderFixture) -> Result<String, String> {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            socket.write_all(b"* OK fixture ready\r\n").unwrap();
            let tag = command(&mut reader, "LOGIN");
            write!(socket, "{tag} OK authenticated\r\n").unwrap();
            let tag = command(&mut reader, "LIST");
            match case {
                FolderFixture::Discover => socket.write_all(b"* LIST (\\Junk) \"/\" \"Spam\"\r\n* LIST () \"/\" \"Sent\"\r\n* LIST (\\Sent) \"/\" \"Sent Actual\"\r\n* LIST (\\All) \"/\" \"All Mail\"\r\n* LIST (\\Drafts) \"/\" \"Drafts\"\r\n* LIST (\\Trash) \"/\" \"Trash\"\r\n").unwrap(),
                FolderFixture::Preferred => socket.write_all(b"* LIST () \"/\" \"CustomArchive\"\r\n").unwrap(),
                FolderFixture::Special => socket.write_all(b"* LIST (\\All) \"/\" \"All Mail\"\r\n").unwrap(),
                _ => (),
            }
            if matches!(case, FolderFixture::ListFailure) {
                write!(socket, "{tag} NO LIST failed\r\n").unwrap();
            } else {
                write!(socket, "{tag} OK list complete\r\n").unwrap();
            }
            if matches!(
                case,
                FolderFixture::Create | FolderFixture::Race | FolderFixture::CreateFailure
            ) {
                let tag = command(&mut reader, "CREATE");
                if matches!(case, FolderFixture::Create) {
                    write!(socket, "{tag} OK created\r\n").unwrap();
                    let tag = command(&mut reader, "SUBSCRIBE");
                    write!(socket, "{tag} NO subscription unavailable\r\n").unwrap();
                } else {
                    write!(socket, "{tag} NO create failed\r\n").unwrap();
                    let tag = command(&mut reader, "LIST");
                    if matches!(case, FolderFixture::Race) {
                        socket
                            .write_all(b"* LIST () \"/\" \"Archive\"\r\n")
                            .unwrap();
                    }
                    write!(socket, "{tag} OK list complete\r\n").unwrap();
                }
            }
            let mut extra = String::new();
            assert_eq!(
                reader.read_line(&mut extra).unwrap(),
                0,
                "unexpected command: {extra}"
            );
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = runtime.block_on(async {
            let stream = tokio::net::TcpStream::connect(address).await.unwrap();
            let mut client = async_imap::Client::new(stream);
            client.read_response().await.unwrap().unwrap();
            let mut session = client.login("synthetic", "synthetic").await.unwrap();
            tokio::time::timeout(Duration::from_secs(5), async {
                if matches!(case, FolderFixture::Discover) {
                    let roles = discover_special_folders(&mut session).await?;
                    assert_eq!(roles.sent.as_deref(), Some("Sent Actual"));
                    assert_eq!(roles.junk.as_deref(), Some("Spam"));
                    assert_eq!(roles.drafts.as_deref(), Some("Drafts"));
                    assert_eq!(roles.archive.as_deref(), Some("All Mail"));
                    assert_eq!(roles.trash.as_deref(), Some("Trash"));
                    Ok("roles".to_string())
                } else {
                    ensure_archive_folder(
                        &mut session,
                        if matches!(case, FolderFixture::Preferred) {
                            Some("customarchive")
                        } else {
                            None
                        },
                    )
                    .await
                }
            })
            .await
            .unwrap()
            .map_err(|e| e.to_string())
        });
        server.join().unwrap();
        result
    }

    #[test]
    fn special_folders_and_archive_creation_preserve_behavior_and_errors() {
        assert_eq!(folder_fixture(FolderFixture::Discover).unwrap(), "roles");
        assert_eq!(
            folder_fixture(FolderFixture::Preferred).unwrap(),
            "CustomArchive"
        );
        assert_eq!(folder_fixture(FolderFixture::Special).unwrap(), "All Mail");
        assert_eq!(folder_fixture(FolderFixture::Create).unwrap(), "Archive");
        assert_eq!(folder_fixture(FolderFixture::Race).unwrap(), "Archive");
        assert!(folder_fixture(FolderFixture::CreateFailure).is_err());
        assert!(folder_fixture(FolderFixture::ListFailure).is_err());
    }

    #[derive(Clone, Copy)]
    enum IdleFixture {
        Changed,
        Timeout,
        Disabled,
        Unsupported,
        Rejected,
        RejectedNo,
        RejectedWithoutText,
        Disconnected,
    }

    fn idle_fixture(case: IdleFixture) -> Result<IdleOutcome, String> {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            socket.write_all(b"* OK fixture ready\r\n").unwrap();
            let tag = command(&mut reader, "LOGIN");
            write!(socket, "{tag} OK authenticated\r\n").unwrap();
            let tag = command(&mut reader, "CAPABILITY");
            write!(
                socket,
                "* CAPABILITY IMAP4rev1{}\r\n{tag} OK capability\r\n",
                if matches!(case, IdleFixture::Unsupported) {
                    ""
                } else {
                    " IDLE"
                }
            )
            .unwrap();
            if !matches!(case, IdleFixture::Unsupported) {
                let tag = command(&mut reader, "EXAMINE");
                write!(
                    socket,
                    "* 1 EXISTS\r\n* OK [UIDVALIDITY 71] valid\r\n{tag} OK examined\r\n"
                )
                .unwrap();
                let idle_tag = command(&mut reader, "IDLE");
                if matches!(case, IdleFixture::Rejected) {
                    write!(socket, "{idle_tag} BAD IDLE unavailable\r\n").unwrap();
                    return;
                }
                if matches!(case, IdleFixture::RejectedNo) {
                    write!(socket, "{idle_tag} NO IDLE unavailable\r\n").unwrap();
                    return;
                }
                if matches!(case, IdleFixture::RejectedWithoutText) {
                    write!(socket, "{idle_tag} BAD [ALERT]\r\n").unwrap();
                    return;
                }
                socket.write_all(b"+ idling\r\n").unwrap();
                if matches!(case, IdleFixture::Disconnected) {
                    return;
                }
                if matches!(case, IdleFixture::Changed) {
                    socket.write_all(b"* 2 EXISTS\r\n").unwrap();
                }
                command(&mut reader, "DONE");
                write!(socket, "{idle_tag} OK idle completed\r\n").unwrap();
            }
            let tag = command(&mut reader, "LOGOUT");
            write!(socket, "* BYE closing\r\n{tag} OK logout\r\n").unwrap();
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = runtime.block_on(async {
            let stream = tokio::net::TcpStream::connect(address).await.unwrap();
            let mut client = async_imap::Client::new(stream);
            client.read_response().await.unwrap().unwrap();
            let session = client.login("synthetic", "synthetic").await.unwrap();
            let (sender, receiver) = tokio::sync::watch::channel(false);
            let task = if matches!(case, IdleFixture::Disabled) {
                let sender = sender.clone();
                Some(tokio::spawn(async move {
                    tokio::time::sleep(Duration::from_millis(40)).await;
                    let _ = sender.send(true);
                }))
            } else {
                None
            };
            let result = tokio::time::timeout(
                Duration::from_secs(5),
                idle_once(session, "INBOX", Duration::from_millis(150), receiver),
            )
            .await
            .unwrap()
            .map_err(|e| e.to_string());
            if let Some(task) = task {
                task.await.unwrap();
            }
            drop(sender);
            result
        });
        server.join().unwrap();
        result
    }

    #[test]
    fn idle_handles_changes_timeout_disable_and_unsupported_servers() {
        for (case, expected) in [
            (IdleFixture::Changed, IdleOutcome::Changed),
            (IdleFixture::Timeout, IdleOutcome::Timeout),
            (IdleFixture::Disabled, IdleOutcome::Disabled),
            (IdleFixture::Unsupported, IdleOutcome::Unsupported),
        ] {
            assert_eq!(idle_fixture(case).unwrap(), expected);
        }
        assert!(idle_fixture(IdleFixture::Rejected).is_err());
        assert!(idle_fixture(IdleFixture::RejectedNo).is_err());
        assert!(idle_fixture(IdleFixture::RejectedWithoutText).is_err());
        assert!(idle_fixture(IdleFixture::Disconnected).is_err());
    }

    fn guarded_mutation_fixture(
        move_message: bool,
        validity: Option<u32>,
        found: bool,
    ) -> Result<(), String> {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            socket.write_all(b"* OK fixture ready\r\n").unwrap();
            let tag = command(&mut reader, "LOGIN");
            write!(socket, "{tag} OK authenticated\r\n").unwrap();
            let tag = command(&mut reader, "SELECT");
            write!(socket, "* 1 EXISTS\r\n").unwrap();
            if let Some(value) = validity {
                write!(socket, "* OK [UIDVALIDITY {value}] valid\r\n").unwrap();
            }
            write!(socket, "{tag} OK selected\r\n").unwrap();
            if validity == Some(71) {
                let tag = command(&mut reader, "UID SEARCH UID 42");
                write!(
                    socket,
                    "* SEARCH {}\r\n{tag} OK search\r\n",
                    if found { "42" } else { "" }
                )
                .unwrap();
                if found {
                    let expected = if move_message {
                        "UID MOVE 42"
                    } else {
                        "UID STORE 42 +FLAGS.SILENT"
                    };
                    let tag = command(&mut reader, expected);
                    write!(socket, "{tag} OK mutation\r\n").unwrap();
                }
            }
            let mut extra = String::new();
            assert_eq!(
                reader.read_line(&mut extra).unwrap(),
                0,
                "unexpected command: {extra}"
            );
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = runtime.block_on(async {
            let stream = tokio::net::TcpStream::connect(address).await.unwrap();
            let mut client = async_imap::Client::new(stream);
            client.read_response().await.unwrap().unwrap();
            let mut session = client.login("synthetic", "synthetic").await.unwrap();
            tokio::time::timeout(Duration::from_secs(5), async {
                if move_message {
                    move_uid_if_epoch(&mut session, "INBOX", 42, "Archive", 71).await
                } else {
                    set_message_flags_uid_if_epoch(&mut session, "INBOX", 42, Some(true), None, 71)
                        .await
                }
            })
            .await
            .unwrap()
            .map_err(|e| e.to_string())
        });
        server.join().unwrap();
        result
    }

    #[test]
    fn queue_mutations_require_epoch_and_existing_uid() {
        for move_message in [false, true] {
            assert!(guarded_mutation_fixture(move_message, Some(71), true).is_ok());
            assert!(guarded_mutation_fixture(move_message, Some(71), false).is_err());
            assert!(guarded_mutation_fixture(move_message, Some(72), true).is_err());
            assert!(guarded_mutation_fixture(move_message, None, true).is_err());
        }
    }

    fn guarded_delete_fixture(validity: Option<u32>) -> Result<(), String> {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            socket.write_all(b"* OK fixture ready\r\n").unwrap();
            let tag = command(&mut reader, "LOGIN");
            write!(socket, "{tag} OK authenticated\r\n").unwrap();
            let tag = command(&mut reader, "CAPABILITY");
            write!(
                socket,
                "* CAPABILITY IMAP4rev1 UIDPLUS\r\n{tag} OK capability\r\n"
            )
            .unwrap();
            let tag = command(&mut reader, "SELECT");
            write!(socket, "* 1 EXISTS\r\n").unwrap();
            if let Some(value) = validity {
                write!(socket, "* OK [UIDVALIDITY {value}] valid\r\n").unwrap();
            }
            write!(socket, "{tag} OK selected\r\n").unwrap();
            if validity == Some(71) {
                let tag = command(&mut reader, "UID SEARCH UID 42");
                write!(socket, "* SEARCH 42\r\n{tag} OK search\r\n").unwrap();
                let tag = command(&mut reader, "UID STORE 42 +FLAGS.SILENT");
                write!(socket, "{tag} OK store\r\n").unwrap();
                let tag = command(&mut reader, "UID EXPUNGE 42");
                write!(socket, "* 1 EXPUNGE\r\n{tag} OK expunge\r\n").unwrap();
            }
            let mut extra = String::new();
            assert_eq!(
                reader.read_line(&mut extra).unwrap(),
                0,
                "unexpected command: {extra}"
            );
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = runtime.block_on(async {
            let stream = tokio::net::TcpStream::connect(address).await.unwrap();
            let mut client = async_imap::Client::new(stream);
            client.read_response().await.unwrap().unwrap();
            let mut session = client.login("synthetic", "synthetic").await.unwrap();
            tokio::time::timeout(
                Duration::from_secs(5),
                delete_uid_permanently_if_epoch(&mut session, "Trash", 42, 71),
            )
            .await
            .unwrap()
            .map_err(|e| e.to_string())
        });
        server.join().unwrap();
        result
    }

    #[test]
    fn permanent_delete_requires_matching_mailbox_epoch() {
        assert!(guarded_delete_fixture(Some(71)).is_ok());
        assert!(guarded_delete_fixture(Some(72)).is_err());
        assert!(guarded_delete_fixture(None).is_err());
        assert!(guarded_delete_fixture(Some(0)).is_err());
    }

    #[derive(Clone, Copy)]
    enum HeaderReply {
        Valid,
        MissingHeader,
        MissingStructure,
        Duplicate,
        WrongUid,
        MissingFetch,
        MissingFlags,
        EmptyFlags,
        DuplicateFlags,
    }

    fn header_sync_fixture(
        before: bool,
        reply: HeaderReply,
    ) -> Result<Vec<crate::models::MessageSummary>, String> {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            socket.write_all(b"* OK fixture ready\r\n").unwrap();
            let tag = command(&mut reader, "LOGIN");
            write!(socket, "{tag} OK authenticated\r\n").unwrap();
            let tag = command(&mut reader, "SELECT");
            write!(
                socket,
                "* 1 EXISTS\r\n* OK [UIDVALIDITY 71] valid\r\n{tag} OK selected\r\n"
            )
            .unwrap();
            let tag = command(&mut reader, "UID SEARCH");
            write!(socket, "* SEARCH 42\r\n{tag} OK SEARCH completed\r\n").unwrap();
            let tag = command(&mut reader, "BODY.PEEK[HEADER] BODYSTRUCTURE");
            let header = "Subject: Teste\r\nFrom: a@example.invalid\r\nMessage-ID: <fixture@example.invalid>\r\n\r\n";
            let header_section = if matches!(reply, HeaderReply::MissingHeader) {
                String::new()
            } else {
                format!(" BODY[HEADER] {{{}}}\r\n{header}", header.len())
            };
            let structure = r#"(("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 5 1 NIL NIL NIL NIL)("APPLICATION" "OCTET-STREAM" ("NAME" "a.bin") NIL NIL "BASE64" 8 NIL ("ATTACHMENT" ("FILENAME" "a.bin")) NIL NIL) "MIXED")"#;
            let structure_section = if matches!(reply, HeaderReply::MissingStructure) {
                String::new()
            } else {
                format!(" BODYSTRUCTURE {structure}")
            };
            let uid = if matches!(reply, HeaderReply::WrongUid) {
                99
            } else {
                42
            };
            let flags = match reply {
                HeaderReply::MissingFlags => "",
                HeaderReply::EmptyFlags => " FLAGS ()",
                HeaderReply::DuplicateFlags => " FLAGS (\\Seen) FLAGS ()",
                _ => " FLAGS (\\Flagged)",
            };
            let fetch =
                format!("* 1 FETCH (UID {uid}{flags}{header_section}{structure_section})\r\n");
            if !matches!(reply, HeaderReply::MissingFetch) {
                socket.write_all(fetch.as_bytes()).unwrap();
            }
            if matches!(reply, HeaderReply::Duplicate) {
                socket.write_all(fetch.as_bytes()).unwrap();
            }
            write!(socket, "{tag} OK FETCH completed\r\n").unwrap();
            let mut extra = String::new();
            assert_eq!(
                reader.read_line(&mut extra).unwrap(),
                0,
                "unexpected command: {extra}"
            );
        });
        let account = crate::models::Account {
            id: 1,
            name: "fixture".into(),
            email: "a@example.invalid".into(),
            imap_host: "example.invalid".into(),
            imap_port: 993,
            smtp_host: "example.invalid".into(),
            smtp_port: 465,
            username: "synthetic".into(),
            use_tls: true,
            imap_security: "tls".into(),
            smtp_security: "tls".into(),
            auth_method: "password".into(),
            oauth_provider: String::new(),
            default_signature_id: None,
            color: String::new(),
        };
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = runtime.block_on(async {
            let stream = tokio::net::TcpStream::connect(address).await.unwrap();
            let mut client = async_imap::Client::new(stream);
            client.read_response().await.unwrap().unwrap();
            let mut session = client.login("synthetic", "synthetic").await.unwrap();
            tokio::time::timeout(Duration::from_secs(5), async {
                if before {
                    sync_folder_before(&mut session, &account, "INBOX", 50, 10, false)
                        .await
                        .map(|(messages, oldest, validity)| {
                            assert_eq!(oldest, Some(42));
                            assert_eq!(validity, Some(71));
                            messages
                        })
                } else {
                    sync_folder_since(&mut session, &account, "INBOX", 0, 10, false)
                        .await
                        .map(|(messages, newest, validity)| {
                            assert_eq!(newest, 42);
                            assert_eq!(validity, Some(71));
                            messages
                        })
                }
            })
            .await
            .unwrap()
            .map_err(|e| e.to_string())
        });
        server.join().unwrap();
        result
    }

    #[test]
    fn sync_fetches_only_headers_and_rejects_incomplete_batches() {
        for before in [false, true] {
            let messages = header_sync_fixture(before, HeaderReply::Valid).unwrap();
            assert_eq!(messages.len(), 1);
            assert_eq!(messages[0].subject, "Teste");
            assert!(messages[0].starred && messages[0].unread && messages[0].has_attachments);
            assert!(messages[0].body_text.is_empty() && messages[0].attachments.is_empty());
            let empty = header_sync_fixture(before, HeaderReply::EmptyFlags).unwrap();
            assert!(empty[0].unread && !empty[0].starred);
            for reply in [
                HeaderReply::MissingHeader,
                HeaderReply::MissingStructure,
                HeaderReply::Duplicate,
                HeaderReply::WrongUid,
                HeaderReply::MissingFetch,
                HeaderReply::MissingFlags,
                HeaderReply::DuplicateFlags,
            ] {
                assert!(header_sync_fixture(before, reply).is_err());
            }
        }
    }

    fn flag_snapshot_fixture(
        flags: Option<&'static str>,
    ) -> Result<Vec<crate::mail::RemoteFlagState>, String> {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            socket.write_all(b"* OK fixture ready\r\n").unwrap();
            let tag = command(&mut reader, "LOGIN");
            write!(socket, "{tag} OK authenticated\r\n").unwrap();
            let tag = command(&mut reader, "EXAMINE");
            write!(
                socket,
                "* 1 EXISTS\r\n* OK [UIDVALIDITY 71] valid\r\n{tag} OK examined\r\n"
            )
            .unwrap();
            let tag = command(&mut reader, "UID FETCH 1:* (UID FLAGS)");
            let attribute = flags
                .map(|value| format!(" FLAGS ({value})"))
                .unwrap_or_default();
            write!(
                socket,
                "* 1 FETCH (UID 42{attribute})\r\n{tag} OK FETCH completed\r\n"
            )
            .unwrap();
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = runtime.block_on(async {
            let stream = tokio::net::TcpStream::connect(address).await.unwrap();
            let mut client = async_imap::Client::new(stream);
            client.read_response().await.unwrap().unwrap();
            let mut session = client.login("synthetic", "synthetic").await.unwrap();
            tokio::time::timeout(
                Duration::from_secs(5),
                fetch_folder_flag_state(&mut session, "INBOX"),
            )
            .await
            .unwrap()
            .map(|(rows, epoch)| {
                assert_eq!(epoch, Some(71));
                rows
            })
            .map_err(|e| e.to_string())
        });
        server.join().unwrap();
        result
    }

    #[test]
    fn flag_snapshot_distinguishes_missing_empty_and_populated_flags() {
        assert!(flag_snapshot_fixture(None).is_err());
        assert!(flag_snapshot_fixture(Some("\\Seen) FLAGS (")).is_err());
        let empty = flag_snapshot_fixture(Some("")).unwrap();
        assert!(empty[0].unread && !empty[0].starred);
        let flags = flag_snapshot_fixture(Some("\\Seen \\Flagged")).unwrap();
        assert!(!flags[0].unread && flags[0].starred);
    }

    #[derive(Clone, Copy)]
    enum Reply {
        Valid,
        UnsolicitedThenValid,
        Duplicate,
        MissingBody,
        MissingHeaders,
        WrongUid,
        WrongValidity,
        ServerFailure,
    }

    fn command(reader: &mut BufReader<std::net::TcpStream>, expected: &str) -> String {
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        assert!(line.contains(expected), "unexpected IMAP command: {line:?}");
        if expected == "BODY.PEEK[2.MIME]" {
            assert!(line.contains("BODY.PEEK[2.MIME]"));
            assert!(line.contains("BODY.PEEK[2]"));
            assert!(line.contains("UID FETCH 42"));
        }
        line.split_whitespace().next().unwrap().to_owned()
    }

    fn run_fixture(reply: Reply) -> Result<Vec<u8>, String> {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            socket.write_all(b"* OK fixture ready\r\n").unwrap();
            let tag = command(&mut reader, "LOGIN");
            write!(socket, "{tag} OK authenticated\r\n").unwrap();
            let tag = command(&mut reader, "EXAMINE");
            let validity = if matches!(reply, Reply::WrongValidity) {
                72
            } else {
                71
            };
            write!(socket, "* 1 EXISTS\r\n* OK [UIDVALIDITY {validity}] valid\r\n{tag} OK [READ-ONLY] examined\r\n").unwrap();
            if matches!(reply, Reply::WrongValidity) {
                return;
            }
            let tag = command(&mut reader, "BODY.PEEK[2.MIME]");
            if matches!(reply, Reply::ServerFailure) {
                write!(socket, "{tag} NO FETCH rejected\r\n").unwrap();
                return;
            }
            let mime = "Content-Type: application/octet-stream\r\nContent-Transfer-Encoding: base64\r\n\r\n";
            let body = "AAECA/8=";
            let uid = if matches!(reply, Reply::WrongUid) {
                99
            } else {
                42
            };
            let body_section = if matches!(reply, Reply::MissingBody) {
                String::new()
            } else {
                format!(" BODY[2] {{{}}}\r\n{body}", body.len())
            };
            let headers = if matches!(reply, Reply::MissingHeaders) {
                String::new()
            } else {
                format!(" BODY[2.MIME] {{{}}}\r\n{mime}", mime.len())
            };
            let fetch = format!("* 1 FETCH (UID {uid}{headers}{body_section})\r\n");
            if matches!(reply, Reply::UnsolicitedThenValid) {
                socket
                    .write_all(b"* 2 FETCH (UID 99 FLAGS (\\Seen))\r\n")
                    .unwrap();
            }
            if let Err(e) = socket.write_all(fetch.as_bytes()) {
                // In the negative fixtures, the IMAP client may legitimately
                // close the connection as soon as it rejects malformed data.
                if matches!(reply, Reply::Valid | Reply::UnsolicitedThenValid) {
                    panic!("valid fixture could not send FETCH: {e}");
                }
                return;
            }
            if matches!(reply, Reply::Duplicate) {
                // Rejection can occur after the first duplicate response.
                let _ = socket.write_all(fetch.as_bytes());
            }
            if let Err(e) = write!(socket, "{tag} OK FETCH completed\r\n") {
                if matches!(reply, Reply::Valid | Reply::UnsolicitedThenValid) {
                    panic!("valid fixture could not finish FETCH: {e}");
                }
            }
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = runtime.block_on(async {
            let stream = tokio::net::TcpStream::connect(address).await.unwrap();
            let mut client = async_imap::Client::new(stream);
            client.read_response().await.unwrap().unwrap();
            let mut session = client.login("synthetic", "synthetic").await.unwrap();
            tokio::time::timeout(
                Duration::from_secs(5),
                fetch_attachment_part(&mut session, "INBOX", 42, 71, "2"),
            )
            .await
            .unwrap()
            .map_err(|e| e.to_string())
        });
        server.join().unwrap();
        result
    }

    #[test]
    fn attachment_fetch_checks_uid_validity_and_complete_responses() {
        assert_eq!(run_fixture(Reply::Valid).unwrap(), vec![0, 1, 2, 3, 255]);
        assert_eq!(
            run_fixture(Reply::UnsolicitedThenValid).unwrap(),
            vec![0, 1, 2, 3, 255]
        );
        for reply in [
            Reply::Duplicate,
            Reply::MissingBody,
            Reply::MissingHeaders,
            Reply::WrongUid,
            Reply::WrongValidity,
            Reply::ServerFailure,
        ] {
            assert!(run_fixture(reply).is_err());
        }
    }

    #[test]
    fn lazy_hydration_fetches_text_but_not_attachment() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            socket.write_all(b"* OK fixture ready\r\n").unwrap();
            let tag = command(&mut reader, "LOGIN");
            write!(socket, "{tag} OK authenticated\r\n").unwrap();
            let tag = command(&mut reader, "EXAMINE");
            write!(
                socket,
                "* 1 EXISTS\r\n* OK [UIDVALIDITY 71] valid\r\n{tag} OK [READ-ONLY] examined\r\n"
            )
            .unwrap();
            let tag = command(&mut reader, "UID FETCH 42 (UID BODYSTRUCTURE)");
            let structure = r#"(("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 5 1 NIL NIL NIL NIL)("APPLICATION" "OCTET-STREAM" ("NAME" "a.bin") NIL NIL "BASE64" 8 NIL ("ATTACHMENT" ("FILENAME" "a.bin")) NIL NIL) "MIXED")"#;
            write!(
                socket,
                "* 1 FETCH (UID 42 BODYSTRUCTURE {structure})\r\n{tag} OK FETCH completed\r\n"
            )
            .unwrap();
            let tag = command(&mut reader, "BODY.PEEK[1.MIME]");
            let mime = "Content-Type: text/plain; charset=UTF-8\r\n\r\n";
            let body = "hello";
            write!(socket, "* 1 FETCH (UID 42 BODY[1.MIME] {{{}}}\r\n{mime} BODY[1] {{{}}}\r\n{body})\r\n{tag} OK FETCH completed\r\n", mime.len(), body.len()).unwrap();
            let mut extra = String::new();
            assert_eq!(
                reader.read_line(&mut extra).unwrap(),
                0,
                "unexpected attachment request: {extra}"
            );
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let content = runtime.block_on(async {
            let stream = tokio::net::TcpStream::connect(address).await.unwrap();
            let mut client = async_imap::Client::new(stream);
            client.read_response().await.unwrap().unwrap();
            let mut session = client.login("synthetic", "synthetic").await.unwrap();
            tokio::time::timeout(
                Duration::from_secs(5),
                fetch_lazy_message_content(&mut session, "INBOX", 42, 71),
            )
            .await
            .unwrap()
            .unwrap()
        });
        assert_eq!(content.body_text, "hello");
        assert_eq!(content.attachments.len(), 1);
        assert_eq!(content.attachments[0].part_id, "2");
        assert_eq!(content.attachments[0].filename, "a.bin");
        assert!(content.attachments[0].data_hex.is_empty());
        server.join().unwrap();
    }

    #[derive(Clone, Copy)]
    enum BadHydration {
        MissingStructure,
        DuplicateStructure,
        WrongUid,
        WrongValidity,
        MissingText,
    }

    fn run_bad_hydration(case: BadHydration) -> Result<crate::mail::LazyMessageContent, String> {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            socket.write_all(b"* OK fixture ready\r\n").unwrap();
            let tag = command(&mut reader, "LOGIN");
            write!(socket, "{tag} OK authenticated\r\n").unwrap();
            let tag = command(&mut reader, "EXAMINE");
            let validity = if matches!(case, BadHydration::WrongValidity) {
                72
            } else {
                71
            };
            write!(socket, "* 1 EXISTS\r\n* OK [UIDVALIDITY {validity}] valid\r\n{tag} OK [READ-ONLY] examined\r\n").unwrap();
            if matches!(case, BadHydration::WrongValidity) {
                return;
            }
            let tag = command(&mut reader, "UID FETCH 42 (UID BODYSTRUCTURE)");
            let uid = if matches!(case, BadHydration::WrongUid) {
                99
            } else {
                42
            };
            let structure = if matches!(case, BadHydration::MissingStructure) {
                String::new()
            } else {
                r#" BODYSTRUCTURE ("TEXT" "PLAIN" ("CHARSET" "UTF-8") NIL NIL "7BIT" 5 1 NIL NIL NIL NIL)"#.to_string()
            };
            let row = format!("* 1 FETCH (UID {uid}{structure})\r\n");
            socket.write_all(row.as_bytes()).unwrap();
            if matches!(case, BadHydration::DuplicateStructure) {
                socket.write_all(row.as_bytes()).unwrap();
            }
            write!(socket, "{tag} OK FETCH completed\r\n").unwrap();
            if matches!(case, BadHydration::MissingText) {
                let tag = command(&mut reader, "BODY.PEEK[1.MIME]");
                let mime = "Content-Type: text/plain\r\n\r\n";
                write!(socket, "* 1 FETCH (UID 42 BODY[1.MIME] {{{}}}\r\n{mime})\r\n{tag} OK FETCH completed\r\n", mime.len()).unwrap();
            }
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = runtime.block_on(async {
            let stream = tokio::net::TcpStream::connect(address).await.unwrap();
            let mut client = async_imap::Client::new(stream);
            client.read_response().await.unwrap().unwrap();
            let mut session = client.login("synthetic", "synthetic").await.unwrap();
            tokio::time::timeout(
                Duration::from_secs(5),
                fetch_lazy_message_content(&mut session, "INBOX", 42, 71),
            )
            .await
            .unwrap()
            .map_err(|e| e.to_string())
        });
        server.join().unwrap();
        result
    }

    #[test]
    fn lazy_hydration_rejects_incomplete_or_mismatched_responses() {
        for case in [
            BadHydration::MissingStructure,
            BadHydration::DuplicateStructure,
            BadHydration::WrongUid,
            BadHydration::WrongValidity,
            BadHydration::MissingText,
        ] {
            assert!(run_bad_hydration(case).is_err());
        }
    }
}

/// Local TCP fixtures verify that no UID FETCH is sent when a cached epoch
/// changes. They use in-memory synthetic mail; no personal accounts or keys.
#[cfg(test)]
mod cached_uid_epoch_tests {
    use super::{fetch_reply_to_if_epoch, read_raw_by_uid_if_epoch};
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::time::Duration;

    #[derive(Clone, Copy, Debug)]
    enum Case {
        Valid,
        DifferentEpoch,
        MissingEpoch,
        WrongUid,
        Duplicate,
        MissingBody,
        ServerFailure,
    }

    fn read_command(reader: &mut BufReader<std::net::TcpStream>, contains: &str) -> String {
        let mut text = String::new();
        reader.read_line(&mut text).unwrap();
        assert!(text.contains(contains), "IMAP command unexpected: {text:?}");
        text.split_whitespace().next().unwrap().to_owned()
    }

    fn raw_fixture(case: Case, expected: u32) -> Result<Option<Vec<u8>>, String> {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            socket.write_all(b"* OK fixture ready\r\n").unwrap();
            let tag = read_command(&mut reader, "LOGIN");
            write!(socket, "{tag} OK authenticated\r\n").unwrap();
            // Missing/zero local epoch fails before EXAMINE: client drops connection.
            if expected == 0 {
                return;
            }
            let tag = read_command(&mut reader, "EXAMINE");
            if matches!(case, Case::MissingEpoch) {
                write!(socket, "* 1 EXISTS\r\n{tag} OK [READ-ONLY] examined\r\n").unwrap();
            } else {
                let epoch = if matches!(case, Case::DifferentEpoch) {
                    72
                } else {
                    71
                };
                write!(socket, "* 1 EXISTS\r\n* OK [UIDVALIDITY {epoch}] valid\r\n{tag} OK [READ-ONLY] examined\r\n").unwrap();
            }
            if matches!(case, Case::DifferentEpoch | Case::MissingEpoch) {
                // A request here would violate fail-closed identity enforcement.
                let mut request = String::new();
                socket
                    .set_read_timeout(Some(Duration::from_millis(500)))
                    .unwrap();
                match reader.read_line(&mut request) {
                    Ok(0) | Err(_) => (),
                    Ok(_) => panic!("forbidden UID FETCH after epoch mismatch: {request}"),
                }
                return;
            }
            let tag = read_command(&mut reader, "UID FETCH 42");
            if matches!(case, Case::ServerFailure) {
                write!(socket, "{tag} NO FETCH refused\r\n").unwrap();
                return;
            }
            // RFC822 content deliberately small and synthetic.
            let raw = "From: sender@example.invalid\r\nSubject: Sample\r\n\r\nhello";
            let uid = if matches!(case, Case::WrongUid) {
                99
            } else {
                42
            };
            let row = if matches!(case, Case::MissingBody) {
                format!("* 1 FETCH (UID {uid} FLAGS (\\Seen))\r\n")
            } else {
                format!(
                    "* 1 FETCH (UID {uid} BODY[] {{{}}}\r\n{raw})\r\n",
                    raw.len()
                )
            };
            socket.write_all(row.as_bytes()).unwrap();
            if matches!(case, Case::Duplicate) {
                socket.write_all(row.as_bytes()).unwrap();
            }
            write!(socket, "{tag} OK FETCH completed\r\n").unwrap();
        });
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let outcome = rt.block_on(async {
            let stream = tokio::net::TcpStream::connect(address).await.unwrap();
            let mut client = async_imap::Client::new(stream);
            client.read_response().await.unwrap().unwrap();
            let mut session = client.login("test", "test").await.unwrap();
            tokio::time::timeout(
                Duration::from_secs(5),
                read_raw_by_uid_if_epoch(&mut session, "INBOX", 42, expected),
            )
            .await
            .unwrap()
            .map_err(|e| e.to_string())
        });
        server.join().unwrap();
        outcome
    }

    #[test]
    fn raw_export_only_accepts_matching_uid_and_epoch() {
        assert!(raw_fixture(Case::Valid, 71)
            .unwrap()
            .unwrap()
            .ends_with(b"hello"));
        for case in [
            Case::DifferentEpoch,
            Case::MissingEpoch,
            Case::WrongUid,
            Case::Duplicate,
            Case::MissingBody,
            Case::ServerFailure,
        ] {
            // An unrelated FETCH response might legitimately produce None, which
            // is also a fail-closed result and must not export another message.
            assert!(
                !matches!(raw_fixture(case, 71), Ok(Some(_))),
                "unexpected acceptance: {case:?}"
            );
        }
        assert!(raw_fixture(Case::Valid, 0).is_err());
    }

    #[test]
    fn reply_to_rejects_uid_without_matching_epoch() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            socket.write_all(b"* OK fixture ready\r\n").unwrap();
            let tag = read_command(&mut reader, "LOGIN");
            write!(socket, "{tag} OK authenticated\r\n").unwrap();
            let tag = read_command(&mut reader, "EXAMINE");
            write!(
                socket,
                "* OK [UIDVALIDITY 72] valid\r\n{tag} OK [READ-ONLY] examined\r\n"
            )
            .unwrap();
            socket
                .set_read_timeout(Some(Duration::from_millis(500)))
                .unwrap();
            let mut more = String::new();
            match reader.read_line(&mut more) {
                Ok(0) | Err(_) => (),
                Ok(_) => panic!("forbidden Reply-To UID FETCH: {more}"),
            }
        });
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let result = rt.block_on(async {
            let stream = tokio::net::TcpStream::connect(address).await.unwrap();
            let mut client = async_imap::Client::new(stream);
            client.read_response().await.unwrap().unwrap();
            let mut session = client.login("test", "test").await.unwrap();
            tokio::time::timeout(
                Duration::from_secs(5),
                fetch_reply_to_if_epoch(&mut session, "INBOX", 42, 71),
            )
            .await
            .unwrap()
        });
        assert!(result.is_err());
        server.join().unwrap();
    }
}

#[cfg(test)]
mod tcs_special_folder_refresh_tests {
    use super::special_folders_from_tree;
    use crate::mail::FolderInfo;
    fn folder(name: &str, special: Option<&str>) -> FolderInfo {
        FolderInfo {
            name: name.into(),
            display_name: name.into(),
            parent: None,
            delimiter: Some("/".into()),
            selectable: true,
            subscribed: true,
            special_use: special.map(str::to_owned),
        }
    }
    #[test]
    fn gmail_sent_special_use_beats_generic_sent_folder() {
        let fs = vec![
            folder("Sent", None),
            folder("[Gmail]/Sent Mail", Some("sent")),
            folder("[Gmail]/All Mail", Some("all")),
            folder("[Gmail]/Drafts", Some("drafts")),
        ];
        let roles = special_folders_from_tree(&fs);
        assert_eq!(roles.sent.as_deref(), Some("[Gmail]/Sent Mail"));
        assert_eq!(roles.archive.as_deref(), Some("[Gmail]/All Mail"));
        assert_eq!(roles.drafts.as_deref(), Some("[Gmail]/Drafts"));
    }
    #[test]
    fn unrecognized_role_is_not_guessed_and_noselect_is_ignored() {
        let mut fs = vec![folder("Old Sent", None), folder("Sent", Some("sent"))];
        fs[1].selectable = false;
        assert!(special_folders_from_tree(&fs).sent.is_none());
        assert_eq!(
            special_folders_from_tree(&[folder("Sent", None)])
                .sent
                .as_deref(),
            Some("Sent")
        );
    }
}
