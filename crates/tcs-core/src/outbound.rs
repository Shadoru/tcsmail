use crate::{models::MailDraft, CoreStore};
use chrono::Local;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueuedInlineAttachment {
    pub path: String,
    pub content_id: String,
    pub mime_type: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueuedDraft {
    pub from_name: String,
    pub from_email: String,
    #[serde(default)]
    pub reply_to: Option<String>,
    pub to: String,
    pub cc: String,
    pub bcc: String,
    pub subject: String,
    pub text_body: String,
    pub html_body: String,
    pub in_reply_to: Option<String>,
    pub references: Option<String>,
    pub attachment_paths: Vec<String>,
    #[serde(default)]
    pub inline_attachments: Vec<QueuedInlineAttachment>,
    #[serde(default)]
    pub draft_key: Option<String>,
    pub request_read_receipt: bool,
}
impl From<&MailDraft> for QueuedDraft {
    fn from(d: &MailDraft) -> Self {
        Self {
            from_name: d.from_name.clone(),
            from_email: d.from_email.clone(),
            reply_to: d.reply_to.clone(),
            to: d.to.clone(),
            cc: d.cc.clone(),
            bcc: d.bcc.clone(),
            subject: d.subject.clone(),
            text_body: d.text_body.clone(),
            html_body: d.html_body.clone(),
            in_reply_to: d.in_reply_to.clone(),
            references: d.references.clone(),
            attachment_paths: d
                .attachments
                .iter()
                .map(|p| p.display().to_string())
                .collect(),
            inline_attachments: d
                .inline_attachments
                .iter()
                .map(|a| QueuedInlineAttachment {
                    path: a.path.display().to_string(),
                    content_id: a.content_id.clone(),
                    mime_type: a.mime_type.clone(),
                })
                .collect(),
            draft_key: d.draft_key.clone(),
            request_read_receipt: d.request_read_receipt,
        }
    }
}
#[derive(Clone)]
pub struct OutboundQueue {
    pub store: CoreStore,
}

fn should_append_sent(setting: Option<&str>, smtp_host: &str) -> bool {
    let host = smtp_host.to_ascii_lowercase();
    let provider_auto_saves = host.contains("gmail")
        || host.contains("outlook")
        || host.contains("office365")
        || host.contains("microsoft");
    match setting
        .map(str::trim)
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("1" | "true" | "yes" | "on") => true,
        Some("0" | "false" | "no" | "off") => false,
        _ => !provider_auto_saves,
    }
}
impl OutboundQueue {
    pub fn queue(
        &self,
        account_id: i64,
        draft: &MailDraft,
        send_at: i64,
        undo_seconds: i64,
    ) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        let message_id = format!("<{}.tcs-mail@local>", Uuid::new_v4());
        let now = Local::now().timestamp();
        let undo_until = if send_at <= now {
            now + undo_seconds.max(0)
        } else {
            0
        };
        let state = if undo_until > now {
            "waiting_undo"
        } else {
            "queued"
        };
        let json = serde_json::to_string(&QueuedDraft::from(draft)).map_err(|e| e.to_string())?;
        self.store.conn()?.execute("INSERT INTO outbound_queue_v2(id,account_id,message_id_header,draft_json,send_at_ts,undo_until_ts,state,created_ts,updated_ts) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8)",params![id,account_id,message_id,json,send_at,undo_until,state,now]).map_err(|e|e.to_string())?;
        Ok(id)
    }
    pub fn cancel(&self, id: &str) -> Result<(), String> {
        self.store.conn()?.execute("UPDATE outbound_queue_v2 SET state='cancelled',updated_ts=?2 WHERE id=?1 AND state IN ('queued','waiting_undo','retry_wait')",params![id,Local::now().timestamp()]).map_err(|e|e.to_string())?;
        Ok(())
    }
}

/// Store a sent RFC822 copy through the shared asynchronous IMAP backend.
/// SMTP delivery is deliberately left independent from this operation.
fn append_sent_copy(
    account: &crate::models::Account,
    credential: &str,
    folder: &str,
    raw: &[u8],
) -> Result<(), String> {
    if folder.trim().is_empty() || raw.is_empty() {
        return Err("Pasta Enviados ou mensagem RFC822 vazia".into());
    }
    // process_due_once is synchronous and may be called from an async context;
    // isolate the Tokio runtime rather than nesting block_on on its caller.
    std::thread::scope(|scope| {
        scope
            .spawn(|| {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| e.to_string())?;
                runtime.block_on(async {
                    let _permit =
                        crate::async_mail::coordination::acquire_account_operation(account.id)
                            .await
                            .map_err(|e| e.to_string())?;
                    let mut session = tokio::time::timeout(
                        std::time::Duration::from_secs(45),
                        crate::async_mail::login_secure(account, credential),
                    )
                    .await
                    .map_err(|_| "Tempo limite ao autenticar IMAP para Enviados".to_string())?
                    .map_err(|e| e.to_string())?;
                    let result = tokio::time::timeout(
                        std::time::Duration::from_secs(90),
                        crate::async_mail::append_raw(&mut session, folder, raw),
                    )
                    .await
                    .map_err(|_| "Tempo limite ao salvar cópia em Enviados".to_string())?
                    .map_err(|e| e.to_string());
                    let _ =
                        tokio::time::timeout(std::time::Duration::from_secs(8), session.logout())
                            .await;
                    result
                })
            })
            .join()
            .map_err(|_| "Worker IMAP de Enviados terminou inesperadamente".to_string())?
    })
}

impl OutboundQueue {
    pub fn process_due_once(&self) -> Result<Option<String>, String> {
        // Serialize GUI, scheduler and background-tick processing in this process.
        static SEND_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _send_guard = SEND_LOCK
            .lock()
            .map_err(|_| "Fila SMTP bloqueada após panic".to_string())?;
        use crate::{mail, models::MailDraft};
        use std::path::PathBuf;
        let now = Local::now().timestamp();
        let c = self.store.conn()?;
        // Earlier versions retried sent_copy_pending automatically. The remote APPEND may
        // already have succeeded before its acknowledgement was lost; quarantine first.
        c.execute("UPDATE outbound_queue_v2 SET state='sent_copy_needs_review',updated_ts=?1,last_error='Resultado anterior de APPEND incerto: confira a pasta Enviados antes de repetir' WHERE state='sent_copy_pending'",params![now]).map_err(|e|e.to_string())?;
        let row=c.query_row("SELECT id,account_id,draft_json,state,sent_copy_folder,sent_raw FROM outbound_queue_v2 WHERE state IN ('queued','waiting_undo','retry_wait') AND send_at_ts<=?1 AND (undo_until_ts=0 OR undo_until_ts<=?1) ORDER BY created_ts LIMIT 1",params![now],|r|Ok((r.get::<_,String>(0)?,r.get::<_,i64>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,Option<String>>(4)?,r.get::<_,Option<Vec<u8>>>(5)?))).optional().map_err(|e|e.to_string())?;
        let Some((id, account_id, json, _state, _pending_folder, _pending_raw)) = row else {
            return Ok(None);
        };
        let q: QueuedDraft = serde_json::from_str(&json).map_err(|e| e.to_string())?;
        let db = self.store.legacy()?;
        let account = db
            .get_account(account_id)
            .map_err(|e| e.to_string())?
            .ok_or("Conta não encontrada")?;
        let password = crate::oauth::mail_auth_secret(&account)?;
        let draft = MailDraft {
            from_name: q.from_name,
            from_email: q.from_email,
            reply_to: q.reply_to,
            to: q.to,
            cc: q.cc,
            bcc: q.bcc,
            subject: q.subject,
            text_body: q.text_body,
            html_body: q.html_body,
            in_reply_to: q.in_reply_to,
            references: q.references,
            attachments: q.attachment_paths.into_iter().map(PathBuf::from).collect(),
            inline_attachments: q
                .inline_attachments
                .into_iter()
                .map(|a| crate::models::InlineAttachment {
                    path: PathBuf::from(a.path),
                    content_id: a.content_id,
                    mime_type: a.mime_type,
                })
                .collect(),
            draft_key: q.draft_key,
            request_read_receipt: q.request_read_receipt,
        };
        mail::validate_address_list(&draft.to).map_err(|e| e.to_string())?;
        mail::validate_address_list(&draft.cc).map_err(|e| e.to_string())?;
        mail::validate_address_list(&draft.bcc).map_err(|e| e.to_string())?;
        c.execute("UPDATE outbound_queue_v2 SET state='sending',attempts=attempts+1,updated_ts=?2 WHERE id=?1",params![id,now]).map_err(|e|e.to_string())?;
        match mail::send_message_capture(&account, &password, &draft) {
            Ok(raw) => {
                if let Ok(parsed) = mailparse::parse_mail(&raw) {
                    use mailparse::MailHeaderMap;
                    if let Some(mid) = parsed.headers.get_first_value("Message-ID") {
                        let _ = c.execute(
                            "UPDATE outbound_queue_v2 SET message_id_header=?2 WHERE id=?1",
                            params![id, mid],
                        );
                    }
                }
                let sent = db.folder_role(account.id, "sent");
                let append_setting = db.get_setting("mail.append_sent");
                let append = should_append_sent(append_setting.as_deref(), &account.smtp_host);
                if append {
                    if let Some(folder) = sent.filter(|f| !f.trim().is_empty()) {
                        if let Err(e) = append_sent_copy(&account, &password, &folder, &raw) {
                            c.execute("UPDATE outbound_queue_v2 SET state='sent_copy_needs_review',sent_copy_folder=?2,sent_raw=?3,last_error=?4,updated_ts=?5 WHERE id=?1",params![id,folder,raw,e.to_string(),now]).map_err(|x|x.to_string())?;
                            return Ok(Some(id));
                        }
                    }
                }
                c.execute("UPDATE outbound_queue_v2 SET state='done',sent_raw=NULL,last_error='',updated_ts=?2 WHERE id=?1",params![id,now]).map_err(|e|e.to_string())?;
                Ok(Some(id))
            }
            Err(e) => {
                // Once SMTP DATA/termination has started, a transport error cannot prove that the
                // server rejected the message. Retrying automatically can therefore duplicate mail.
                // Keep the item failed for explicit user review/retry instead of guessing.
                c.execute("UPDATE outbound_queue_v2 SET state='failed',last_error=?2,updated_ts=?3 WHERE id=?1",params![id,e.to_string(),now]).map_err(|x|x.to_string())?;
                Err(e.to_string())
            }
        }
    }
}

#[cfg(test)]
mod sent_copy_tests {
    use super::should_append_sent;
    #[test]
    fn automatic_skips_known_auto_save_providers() {
        assert!(!should_append_sent(Some("auto"), "smtp.gmail.com"));
        assert!(!should_append_sent(None, "smtp.office365.com"));
    }
    #[test]
    fn automatic_appends_for_unknown_provider() {
        assert!(should_append_sent(Some("auto"), "smtp.example.net"));
    }
    #[test]
    fn explicit_setting_wins() {
        assert!(should_append_sent(Some("true"), "smtp.gmail.com"));
        assert!(!should_append_sent(Some("false"), "smtp.example.net"));
    }
}
