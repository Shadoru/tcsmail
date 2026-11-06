use crate::{
    db::Database,
    mail,
    models::{Account, MailDraft},
    CoreStore,
};
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

struct DueItem {
    id: String,
    account_id: i64,
    json: String,
    state: String,
}

struct PreparedSend {
    db: Database,
    account: Account,
    credential: String,
    draft: MailDraft,
}

struct PreparationFailure {
    state: &'static str,
    diagnostic: &'static str,
}

impl PreparationFailure {
    fn failed(diagnostic: &'static str) -> Self {
        Self {
            state: "failed",
            diagnostic,
        }
    }
}

fn next_due_item(c: &rusqlite::Connection, now: i64) -> Result<Option<DueItem>, String> {
    // `sending` stays quarantined across restarts. An expired process/lease cannot
    // prove that SMTP did not accept DATA, so it must never trigger an auto-retry.
    c.query_row("SELECT id,account_id,draft_json,state FROM outbound_queue_v2 WHERE state IN ('queued','waiting_undo','retry_wait') AND send_at_ts<=?1 AND (undo_until_ts=0 OR undo_until_ts<=?1) ORDER BY created_ts,id LIMIT 1", [now], |r| Ok(DueItem {
        id: r.get(0)?, account_id: r.get(1)?, json: r.get(2)?, state: r.get(3)?,
    })).optional().map_err(|e| e.to_string())
}

fn claim_due(c: &rusqlite::Connection, item: &DueItem, now: i64) -> Result<bool, String> {
    // SQLite is the cross-process arbiter. No writer transaction spans preparation
    // or network I/O, and only the single successful claimant may invoke SMTP.
    c.execute("UPDATE outbound_queue_v2 SET state='sending',attempts=attempts+1,last_error='',updated_ts=?5 WHERE id=?1 AND account_id=?2 AND draft_json=?3 AND state=?4 AND state IN ('queued','waiting_undo','retry_wait') AND send_at_ts<=?5 AND (undo_until_ts=0 OR undo_until_ts<=?5)", params![item.id,item.account_id,item.json,item.state,now])
        .map(|changed| changed == 1).map_err(|e| e.to_string())
}

fn record_preparation_failure(
    c: &rusqlite::Connection,
    item: &DueItem,
    failure: &PreparationFailure,
) -> Result<(), String> {
    // A late preparation error must not overwrite cancellation, another process's
    // claim, or an edited/rescheduled item. Diagnostics are static, never error payloads.
    c.execute("UPDATE outbound_queue_v2 SET state=?5,last_error=?6,updated_ts=?7 WHERE id=?1 AND account_id=?2 AND draft_json=?3 AND state=?4 AND state IN ('queued','waiting_undo','retry_wait') AND send_at_ts<=?7 AND (undo_until_ts=0 OR undo_until_ts<=?7)", params![item.id,item.account_id,item.json,item.state,failure.state,failure.diagnostic,Local::now().timestamp()])
        .map(|_| ()).map_err(|e| e.to_string())
}

fn prepare_send(
    store: &CoreStore,
    item: &DueItem,
    credential: impl FnOnce(&Account) -> Result<String, String>,
) -> Result<PreparedSend, PreparationFailure> {
    let q: QueuedDraft = serde_json::from_str(&item.json).map_err(|_| {
        PreparationFailure::failed(
            "Rascunho da fila inválido; revise a mensagem antes de reenviar.",
        )
    })?;
    let db = store.legacy().map_err(|_| {
        PreparationFailure::failed("Não foi possível abrir a conta do envio; revise a conta.")
    })?;
    let account = db
        .get_account(item.account_id)
        .map_err(|_| {
            PreparationFailure::failed("Dados da conta do envio inválidos; revise a conta.")
        })?
        .ok_or_else(|| {
            PreparationFailure::failed("Conta do envio não encontrada; selecione uma conta válida.")
        })?;
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
        attachments: q
            .attachment_paths
            .into_iter()
            .map(std::path::PathBuf::from)
            .collect(),
        inline_attachments: q
            .inline_attachments
            .into_iter()
            .map(|a| crate::models::InlineAttachment {
                path: std::path::PathBuf::from(a.path),
                content_id: a.content_id,
                mime_type: a.mime_type,
            })
            .collect(),
        draft_key: q.draft_key,
        request_read_receipt: q.request_read_receipt,
    };
    let invalid_address = || {
        PreparationFailure::failed("Endereço de envio inválido ou destinatários ausentes; revise remetente, Reply-To, Para, Cc e Cco.")
    };
    let sender = if draft.from_email.trim().is_empty() {
        &account.email
    } else {
        &draft.from_email
    };
    sender
        .trim()
        .parse::<lettre::Address>()
        .map_err(|_| invalid_address())?;
    if let Some(reply) = draft
        .reply_to
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        reply
            .parse::<lettre::message::Mailbox>()
            .map_err(|_| invalid_address())?;
    }
    if draft.to.trim().is_empty() && draft.cc.trim().is_empty() && draft.bcc.trim().is_empty() {
        return Err(invalid_address());
    }
    for addresses in [&draft.to, &draft.cc, &draft.bcc] {
        mail::validate_address_list(addresses).map_err(|_| invalid_address())?;
    }
    let needs_auth = || PreparationFailure {
        state: "needs_auth",
        diagnostic: "Credencial indisponível; reconecte a conta antes de reenviar.",
    };
    let credential = credential(&account).map_err(|_| needs_auth())?;
    if credential.is_empty() {
        return Err(needs_auth());
    }
    Ok(PreparedSend {
        db,
        account,
        credential,
        draft,
    })
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
        let c = self.store.conn()?;
        let changed = c.execute("UPDATE outbound_queue_v2 SET state='cancelled',updated_ts=?2 WHERE id=?1 AND state IN ('queued','waiting_undo','retry_wait')",params![id,Local::now().timestamp()]).map_err(|e|e.to_string())?;
        if changed == 1 {
            return Ok(());
        }
        match c
            .query_row(
                "SELECT state FROM outbound_queue_v2 WHERE id=?1",
                [id],
                |r| r.get::<_, String>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .as_deref()
        {
            Some("cancelled") => Ok(()),
            None => Err("Envio não encontrado.".into()),
            Some(_) => Err("Envio já iniciado ou finalizado; não foi cancelado.".into()),
        }
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
        self.process_due_once_with(crate::oauth::mail_auth_secret, mail::send_message_capture)
    }

    fn process_due_once_with(
        &self,
        credential: impl FnOnce(&Account) -> Result<String, String>,
        send: impl FnOnce(&Account, &str, &MailDraft) -> Result<Vec<u8>, mail::MailError>,
    ) -> Result<Option<String>, String> {
        // Serialize GUI, scheduler and background-tick processing in this process.
        static SEND_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _send_guard = SEND_LOCK
            .lock()
            .map_err(|_| "Fila SMTP bloqueada após panic".to_string())?;
        let now = Local::now().timestamp();
        let c = self.store.conn()?;
        // Earlier versions retried sent_copy_pending automatically. The remote APPEND may
        // already have succeeded before its acknowledgement was lost; quarantine first.
        c.execute("UPDATE outbound_queue_v2 SET state='sent_copy_needs_review',updated_ts=?1,last_error='Resultado anterior de APPEND incerto: confira a pasta Enviados antes de repetir' WHERE state='sent_copy_pending'",params![now]).map_err(|e|e.to_string())?;
        let Some(item) = next_due_item(&c, now)? else {
            return Ok(None);
        };
        let prepared = match prepare_send(&self.store, &item, credential) {
            Ok(prepared) => prepared,
            Err(failure) => {
                record_preparation_failure(&c, &item, &failure)?;
                // The item is now terminal/non-eligible (or another actor won).
                // Returning progress lets background_tick continue to other accounts.
                return Ok(Some(item.id));
            }
        };
        let now = Local::now().timestamp();
        if !claim_due(&c, &item, now)? {
            return Ok(Some(item.id));
        }
        let id = item.id;
        let PreparedSend {
            db,
            account,
            credential: password,
            draft,
        } = prepared;
        match send(&account, &password, &draft) {
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
                        if append_sent_copy(&account, &password, &folder, &raw).is_err() {
                            c.execute("UPDATE outbound_queue_v2 SET state='sent_copy_needs_review',sent_copy_folder=?2,sent_raw=?3,last_error=?4,updated_ts=?5 WHERE id=?1",params![id,folder,raw,"SMTP concluído; resultado da cópia em Enviados não confirmado. Confira a pasta antes de repetir.",now]).map_err(|x|x.to_string())?;
                            return Ok(Some(id));
                        }
                    }
                }
                c.execute("UPDATE outbound_queue_v2 SET state='done',sent_raw=NULL,last_error='',updated_ts=?2 WHERE id=?1",params![id,now]).map_err(|e|e.to_string())?;
                Ok(Some(id))
            }
            Err(_) => {
                // Once SMTP DATA/termination has started, a transport error cannot prove that the
                // server rejected the message. Retrying automatically can therefore duplicate mail.
                // Keep the item failed for explicit user review/retry instead of guessing.
                let diagnostic = "Envio SMTP não confirmado; pode ter sido aceito. Confira os envios antes de reenviar manualmente.";
                c.execute("UPDATE outbound_queue_v2 SET state='failed',last_error=?2,updated_ts=?3 WHERE id=?1",params![id,diagnostic,now]).map_err(|x|x.to_string())?;
                Err(diagnostic.into())
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

#[cfg(test)]
mod queue_regression_tests {
    use super::*;
    use crate::models::Account;

    struct Fixture {
        queue: OutboundQueue,
        directory: std::path::PathBuf,
        account_id: i64,
    }

    impl Fixture {
        fn new() -> Self {
            let directory = std::env::temp_dir().join(format!("tcs-outbound-{}", Uuid::new_v4()));
            let store = CoreStore::open(directory.join("synthetic.db")).unwrap();
            let account_id = store
                .legacy()
                .unwrap()
                .save_account(&Account {
                    id: 0,
                    name: "Synthetic".into(),
                    email: "queue@example.invalid".into(),
                    imap_host: "imap.example.invalid".into(),
                    imap_port: 993,
                    smtp_host: "smtp.gmail.com".into(),
                    smtp_port: 465,
                    username: "queue@example.invalid".into(),
                    use_tls: true,
                    imap_security: "tls".into(),
                    smtp_security: "tls".into(),
                    auth_method: "password".into(),
                    oauth_provider: String::new(),
                    default_signature_id: None,
                    color: "#3584e4".into(),
                })
                .unwrap();
            Self {
                queue: OutboundQueue { store },
                directory,
                account_id,
            }
        }

        fn insert(&self, id: &str, state: &str, json: &str) {
            self.queue.store.conn().unwrap().execute(
                "INSERT INTO outbound_queue_v2(id,account_id,message_id_header,draft_json,send_at_ts,state,created_ts,updated_ts) VALUES(?1,?2,'synthetic',?3,0,?4,0,0)",
                params![id,self.account_id,json,state],
            ).unwrap();
        }

        fn status(&self, id: &str) -> (String, i64, String) {
            self.queue
                .store
                .conn()
                .unwrap()
                .query_row(
                    "SELECT state,attempts,last_error FROM outbound_queue_v2 WHERE id=?1",
                    [id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap()
        }

        fn draft_json() -> String {
            serde_json::to_string(&QueuedDraft {
                from_name: "Synthetic".into(),
                from_email: "sender@example.invalid".into(),
                reply_to: None,
                to: "recipient@example.invalid".into(),
                cc: String::new(),
                bcc: String::new(),
                subject: "Synthetic queue test".into(),
                text_body: "Synthetic body".into(),
                html_body: String::new(),
                in_reply_to: None,
                references: None,
                attachment_paths: vec![],
                inline_attachments: vec![],
                draft_key: None,
                request_read_receipt: false,
            })
            .unwrap()
        }
    }

    fn smtp_ok(_: &Account, _: &str, _: &MailDraft) -> Result<Vec<u8>, mail::MailError> {
        Ok(b"Message-ID: <synthetic@example.invalid>\r\n\r\nSynthetic".to_vec())
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            std::fs::remove_dir_all(&self.directory).unwrap();
        }
    }

    #[test]
    fn cancel_missing_and_already_sending_must_not_report_success() {
        let f = Fixture::new();
        assert!(f.queue.cancel("missing").is_err());
        f.insert("claimed", "sending", "{}");
        assert!(f.queue.cancel("claimed").is_err());
        assert_eq!(f.status("claimed").0, "sending");
    }

    #[test]
    fn malformed_draft_becomes_visible_failed_and_is_not_selected_again() {
        let f = Fixture::new();
        f.insert("broken", "queued", "{synthetic invalid json");
        assert_eq!(f.queue.process_due_once().unwrap(), Some("broken".into()));
        let (state, attempts, error) = f.status("broken");
        assert_eq!(state, "failed");
        assert_eq!(attempts, 0);
        assert!(!error.is_empty());
        assert_eq!(f.queue.process_due_once().unwrap(), None);
    }

    #[test]
    fn cancel_before_claim_wins_and_cancel_is_idempotent_only_for_cancelled() {
        let f = Fixture::new();
        for state in ["queued", "waiting_undo", "retry_wait"] {
            f.insert(state, state, &Fixture::draft_json());
            let c = f.queue.store.conn().unwrap();
            let item = next_due_item(&c, Local::now().timestamp())
                .unwrap()
                .unwrap();
            assert_eq!(item.id, state);
            f.queue.cancel(state).unwrap();
            assert!(!claim_due(&c, &item, Local::now().timestamp()).unwrap());
            f.queue.cancel(state).unwrap();
            assert_eq!(f.status(state), ("cancelled".into(), 0, String::new()));
        }
        for state in ["done", "failed", "needs_auth", "sent_copy_needs_review"] {
            f.insert(state, state, "{}");
            assert!(f.queue.cancel(state).is_err());
            assert_eq!(f.status(state).0, state);
        }
    }

    #[test]
    fn claim_before_cancel_rejects_cancel_and_never_automatically_reclaims_sending() {
        let f = Fixture::new();
        f.insert("claimed", "queued", &Fixture::draft_json());
        let c = f.queue.store.conn().unwrap();
        let item = next_due_item(&c, Local::now().timestamp())
            .unwrap()
            .unwrap();
        assert!(claim_due(&c, &item, Local::now().timestamp()).unwrap());
        assert!(f.queue.cancel("claimed").is_err());
        assert!(!claim_due(&c, &item, Local::now().timestamp()).unwrap());
        let reopened = OutboundQueue {
            store: CoreStore::open(f.queue.store.path()).unwrap(),
        };
        assert_eq!(reopened.process_due_once().unwrap(), None);
        assert_eq!(f.status("claimed").0, "sending");
        assert_eq!(f.status("claimed").1, 1);
    }

    #[test]
    fn independent_sqlite_connections_compete_for_one_claim() {
        let f = Fixture::new();
        f.insert("one", "queued", &Fixture::draft_json());
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let winners = std::thread::scope(|scope| {
            let workers = (0..2)
                .map(|_| {
                    let barrier = barrier.clone();
                    let store = f.queue.store.clone();
                    scope.spawn(move || {
                        let c = store.conn().unwrap();
                        let item = next_due_item(&c, Local::now().timestamp())
                            .unwrap()
                            .unwrap();
                        barrier.wait();
                        claim_due(&c, &item, Local::now().timestamp()).unwrap()
                    })
                })
                .collect::<Vec<_>>();
            workers
                .into_iter()
                .map(|w| w.join().unwrap())
                .filter(|won| *won)
                .count()
        });
        assert_eq!(winners, 1);
        assert_eq!(f.status("one").1, 1);
    }

    // Launched only by the cross-process regression; ordinary runs do nothing.
    #[test]
    fn cross_process_claim_worker() {
        let Some(path) = std::env::var_os("TCS_TEST_OUTBOUND_DB") else {
            return;
        };
        let slot = std::env::var("TCS_TEST_CLAIM_SLOT").unwrap();
        let path = std::path::PathBuf::from(path);
        let directory = path.parent().unwrap();
        let c = rusqlite::Connection::open(&path).unwrap();
        c.busy_timeout(std::time::Duration::from_secs(5)).unwrap();
        let item = next_due_item(&c, Local::now().timestamp())
            .unwrap()
            .unwrap();
        std::fs::write(directory.join(format!("ready-{slot}")), []).unwrap();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while !directory.join("ready-1").exists() || !directory.join("ready-2").exists() {
            assert!(
                std::time::Instant::now() < deadline,
                "claim worker rendezvous timed out"
            );
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        let won = claim_due(&c, &item, Local::now().timestamp()).unwrap();
        std::fs::write(
            directory.join(format!("result-{slot}")),
            if won { "claimed" } else { "lost" },
        )
        .unwrap();
    }

    #[test]
    fn independent_processes_compete_for_one_claim_without_the_process_mutex() {
        let f = Fixture::new();
        f.insert("one", "queued", &Fixture::draft_json());
        let mut children = (1..=2)
            .map(|slot| {
                std::process::Command::new(std::env::current_exe().unwrap())
                    .args([
                        "--exact",
                        "outbound::queue_regression_tests::cross_process_claim_worker",
                    ])
                    .env("TCS_TEST_OUTBOUND_DB", f.queue.store.path())
                    .env("TCS_TEST_CLAIM_SLOT", slot.to_string())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::piped())
                    .spawn()
                    .unwrap()
            })
            .collect::<Vec<_>>();
        for child in &mut children {
            assert!(child.wait().unwrap().success());
        }
        let winners = (1..=2)
            .filter(|slot| {
                std::fs::read_to_string(f.directory.join(format!("result-{slot}"))).unwrap()
                    == "claimed"
            })
            .count();
        assert_eq!(winners, 1);
        assert_eq!(f.status("one").1, 1);
    }

    #[test]
    fn cancellation_during_preparation_survives_both_late_success_and_late_failure() {
        for credentials_succeed in [false, true] {
            let f = Fixture::new();
            f.insert("cancelled", "queued", &Fixture::draft_json());
            let calls = std::sync::atomic::AtomicUsize::new(0);
            let result = f
                .queue
                .process_due_once_with(
                    |_| {
                        f.queue.cancel("cancelled")?;
                        if credentials_succeed {
                            Ok("synthetic".into())
                        } else {
                            Err("sensitive credential failure".into())
                        }
                    },
                    |a, p, d| {
                        calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                        smtp_ok(a, p, d)
                    },
                )
                .unwrap();
            assert_eq!(result, Some("cancelled".into()));
            assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 0);
            assert_eq!(
                f.status("cancelled"),
                ("cancelled".into(), 0, String::new())
            );
        }
    }

    #[test]
    fn late_preparation_failure_cannot_overwrite_another_connection_claim() {
        let f = Fixture::new();
        f.insert("claimed", "queued", &Fixture::draft_json());
        f.queue
            .process_due_once_with(
                |_| {
                    let c = f.queue.store.conn()?;
                    let item = next_due_item(&c, Local::now().timestamp())?.unwrap();
                    if !claim_due(&c, &item, Local::now().timestamp())? {
                        return Err("synthetic lost claim".into());
                    }
                    Err("sensitive diagnostic must not escape".into())
                },
                smtp_ok,
            )
            .unwrap();
        assert_eq!(f.status("claimed"), ("sending".into(), 1, String::new()));
    }

    #[test]
    fn rescheduling_during_preparation_prevents_the_old_send() {
        let f = Fixture::new();
        f.insert("future", "queued", &Fixture::draft_json());
        let calls = std::sync::atomic::AtomicUsize::new(0);
        f.queue
            .process_due_once_with(
                |_| {
                    f.queue
                        .store
                        .conn()?
                        .execute(
                            "UPDATE outbound_queue_v2 SET send_at_ts=?1 WHERE id='future'",
                            [Local::now().timestamp() + 3600],
                        )
                        .unwrap();
                    Ok("synthetic".into())
                },
                |a, p, d| {
                    calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    smtp_ok(a, p, d)
                },
            )
            .unwrap();
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 0);
        assert_eq!(f.status("future").0, "queued");
        assert_eq!(f.status("future").1, 0);
    }

    #[test]
    fn invalid_addresses_fail_before_credential_lookup_or_smtp() {
        for field in ["from_email", "reply_to", "to", "cc", "bcc", "no_recipients"] {
            let f = Fixture::new();
            let mut draft: serde_json::Value =
                serde_json::from_str(&Fixture::draft_json()).unwrap();
            if field == "no_recipients" {
                draft["to"] = "".into();
            } else {
                draft[field] = "sensitive-invalid-address".into();
            }
            f.insert("invalid", "queued", &draft.to_string());
            let lookups = std::sync::atomic::AtomicUsize::new(0);
            f.queue
                .process_due_once_with(
                    |_| {
                        lookups.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                        Ok("synthetic".into())
                    },
                    smtp_ok,
                )
                .unwrap();
            let (state, attempts, error) = f.status("invalid");
            assert_eq!(state, "failed", "{field}");
            assert_eq!(attempts, 0);
            assert_eq!(lookups.load(std::sync::atomic::Ordering::SeqCst), 0);
            assert!(!error.contains("sensitive"));
        }
    }

    #[test]
    fn missing_or_unreadable_account_is_visible_failed_without_smtp() {
        for missing in [false, true] {
            let f = Fixture::new();
            f.insert("account", "queued", &Fixture::draft_json());
            let c = f.queue.store.conn().unwrap();
            if missing {
                c.pragma_update(None, "foreign_keys", "OFF").unwrap();
                c.execute(
                    "UPDATE outbound_queue_v2 SET account_id=99999 WHERE id='account'",
                    [],
                )
                .unwrap();
            } else {
                c.execute("UPDATE accounts SET smtp_port='sensitive-invalid-port'", [])
                    .unwrap();
            }
            f.queue
                .process_due_once_with(|_| Err("unexpected credential lookup".into()), smtp_ok)
                .unwrap();
            let (state, attempts, error) = f.status("account");
            assert_eq!(state, "failed");
            assert_eq!(attempts, 0);
            assert!(!error.contains("sensitive"));
        }
    }

    #[test]
    fn production_credential_failure_becomes_needs_auth_without_network() {
        let f = Fixture::new();
        f.insert("auth", "queued", &Fixture::draft_json());
        f.queue
            .store
            .conn()
            .unwrap()
            .execute(
                "UPDATE accounts SET auth_method='oauth2',oauth_provider='synthetic-unsupported'",
                [],
            )
            .unwrap();
        assert_eq!(f.queue.process_due_once().unwrap(), Some("auth".into()));
        let (state, attempts, error) = f.status("auth");
        assert_eq!(state, "needs_auth");
        assert_eq!(attempts, 0);
        assert!(!error.contains("synthetic-unsupported"));
        assert_eq!(f.queue.process_due_once().unwrap(), None);
    }

    #[test]
    fn credential_failure_does_not_block_a_second_account() {
        let f = Fixture::new();
        let db = f.queue.store.legacy().unwrap();
        let mut other = db.get_account(f.account_id).unwrap().unwrap();
        other.id = 0;
        other.email = "other@example.invalid".into();
        let other_id = db.save_account(&other).unwrap();
        f.insert("a-bad", "queued", &Fixture::draft_json());
        f.insert("b-good", "queued", &Fixture::draft_json());
        f.queue
            .store
            .conn()
            .unwrap()
            .execute(
                "UPDATE outbound_queue_v2 SET account_id=?1 WHERE id='b-good'",
                [other_id],
            )
            .unwrap();
        let credential = |a: &Account| {
            if a.id == f.account_id {
                Err("sensitive secret and address".into())
            } else {
                Ok("synthetic".into())
            }
        };
        assert_eq!(
            f.queue.process_due_once_with(credential, smtp_ok).unwrap(),
            Some("a-bad".into())
        );
        assert_eq!(
            f.queue.process_due_once_with(credential, smtp_ok).unwrap(),
            Some("b-good".into())
        );
        assert_eq!(f.status("a-bad").0, "needs_auth");
        assert_eq!(f.status("a-bad").1, 0);
        assert!(!f.status("a-bad").2.contains("sensitive"));
        assert_eq!(f.status("b-good").0, "done");
        assert_eq!(f.status("b-good").1, 1);
    }

    #[test]
    fn uncertain_smtp_failure_is_visible_sanitized_and_never_auto_retried() {
        let f = Fixture::new();
        f.insert("uncertain", "queued", &Fixture::draft_json());
        let error = f
            .queue
            .process_due_once_with(
                |_| Ok("synthetic".into()),
                |_, _, _| Err(mail::MailError::Protocol("sensitive SMTP payload".into())),
            )
            .unwrap_err();
        assert!(!error.contains("sensitive"));
        let (state, attempts, diagnostic) = f.status("uncertain");
        assert_eq!(state, "failed");
        assert_eq!(attempts, 1);
        assert!(diagnostic.contains("pode ter sido aceito"));
        assert!(!diagnostic.contains("sensitive"));
        assert_eq!(f.queue.process_due_once().unwrap(), None);
    }
}
