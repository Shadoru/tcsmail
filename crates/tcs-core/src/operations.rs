use chrono::Local;
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

use crate::CoreStore;

#[derive(Clone)]
pub struct OperationQueue {
    pub store: CoreStore,
}

const IDENTITY_KEY: &str = "_tcs_imap_identity_v1";
const IDENTITY_ERROR: &str = "Identidade IMAP da operação ausente ou alterada";
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
struct QueuedIdentity {
    folder: String,
    uid: u32,
    uid_validity: u32,
}

fn current_identity(
    conn: &rusqlite::Connection,
    account_id: i64,
    message_id: i64,
) -> Result<Option<QueuedIdentity>, String> {
    let row: Option<(String, i64, Option<i64>)> = conn.query_row(
        "SELECT m.folder,m.uid,s.uid_validity FROM messages m LEFT JOIN mailbox_sync_v2 s ON s.account_id=m.account_id AND s.folder=m.folder WHERE m.id=?1 AND m.account_id=?2",
        params![message_id, account_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).optional().map_err(|e| e.to_string())?;
    Ok(row.and_then(|(folder, uid, validity)| {
        let uid = u32::try_from(uid).ok().filter(|v| *v != 0)?;
        let uid_validity = u32::try_from(validity?).ok().filter(|v| *v != 0)?;
        if folder.trim().is_empty() {
            return None;
        }
        Some(QueuedIdentity {
            folder,
            uid,
            uid_validity,
        })
    }))
}

fn needs_remote_identity(kind: &str, payload: &serde_json::Value) -> bool {
    kind == "move"
        || kind == "delete"
        || (kind == "flags"
            && (payload.get("unread").and_then(|v| v.as_bool()).is_some()
                || payload.get("starred").and_then(|v| v.as_bool()).is_some()))
}

/// Remote UID mutations in the queue use the async IMAP transport. A scoped
/// dedicated thread avoids entering a nested Tokio runtime when this synchronous
/// legacy queue API is invoked from a Tauri async command.
struct RemoteMutation<'a> {
    seen: Option<bool>,
    starred: Option<bool>,
    destination: Option<&'a str>,
}

fn remote_async_mutation(
    account: &crate::models::Account,
    credential: &str,
    store: &CoreStore,
    message_id: i64,
    identity: &QueuedIdentity,
    mutation: RemoteMutation<'_>,
) -> Result<tokio::sync::OwnedSemaphorePermit, String> {
    std::thread::scope(|scope| {
        scope
            .spawn(|| {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| e.to_string())?;
                runtime.block_on(async {
                    let account_permit =
                        crate::async_mail::coordination::acquire_account_operation(account.id)
                            .await
                            .map_err(|e| e.to_string())?;
                    if current_identity(&store.conn()?, account.id, message_id)?.as_ref()
                        != Some(identity)
                    {
                        return Err(IDENTITY_ERROR.into());
                    }
                    let mut session = crate::async_mail::login_secure(account, credential)
                        .await
                        .map_err(|e| e.to_string())?;
                    let result = tokio::time::timeout(std::time::Duration::from_secs(90), async {
                        if let Some(target) = mutation.destination {
                            crate::async_mail::move_uid_if_epoch(
                                &mut session,
                                &identity.folder,
                                identity.uid,
                                target,
                                identity.uid_validity,
                            )
                            .await
                            .map_err(|e| e.to_string())
                        } else {
                            crate::async_mail::set_message_flags_uid_if_epoch(
                                &mut session,
                                &identity.folder,
                                identity.uid,
                                mutation.seen,
                                mutation.starred,
                                identity.uid_validity,
                            )
                            .await
                            .map_err(|e| e.to_string())
                        }
                    })
                    .await
                    .map_err(|_| "Tempo limite na operação IMAP assíncrona".to_string());
                    // Always attempt LOGOUT, even after a remote error or timeout.
                    // Preserve the original IMAP result instead of treating LOGOUT as success.
                    let _ =
                        tokio::time::timeout(std::time::Duration::from_secs(5), session.logout())
                            .await;
                    result??;
                    Ok(account_permit)
                })
            })
            .join()
            .map_err(|_| "Worker IMAP assíncrono terminou inesperadamente".to_string())?
    })
}

/// Safe async permanent deletion via UIDPLUS. The separate Tokio thread
/// preserves the synchronous queue API while keeping IMAP transport async.
fn remote_async_permanent_delete(
    account: &crate::models::Account,
    credential: &str,
    store: &CoreStore,
    message_id: i64,
    identity: &QueuedIdentity,
) -> Result<tokio::sync::OwnedSemaphorePermit, String> {
    std::thread::scope(|scope| {
        scope
            .spawn(|| {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| e.to_string())?;
                runtime.block_on(async {
                    let account_permit =
                        crate::async_mail::coordination::acquire_account_operation(account.id)
                            .await
                            .map_err(|e| e.to_string())?;
                    if current_identity(&store.conn()?, account.id, message_id)?.as_ref()
                        != Some(identity)
                    {
                        return Err(IDENTITY_ERROR.into());
                    }
                    let mut session = crate::async_mail::login_secure(account, credential)
                        .await
                        .map_err(|e| e.to_string())?;
                    let result = tokio::time::timeout(
                        std::time::Duration::from_secs(90),
                        crate::async_mail::delete_uid_permanently_if_epoch(
                            &mut session,
                            &identity.folder,
                            identity.uid,
                            identity.uid_validity,
                        ),
                    )
                    .await
                    .map_err(|_| "Timeout during permanent UID deletion".to_string());
                    let _ =
                        tokio::time::timeout(std::time::Duration::from_secs(5), session.logout())
                            .await;
                    result?.map_err(|e| e.to_string())?;
                    Ok(account_permit)
                })
            })
            .join()
            .map_err(|_| "Async IMAP deletion worker panicked".to_string())?
    })
}

impl OperationQueue {
    pub fn enqueue(
        &self,
        account_id: i64,
        message_id: Option<i64>,
        kind: &str,
        payload: &serde_json::Value,
    ) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        let now = Local::now().timestamp();
        let mut conn = self.store.conn()?;
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let mut payload = payload.clone();
        if needs_remote_identity(kind, &payload) {
            let message_id = message_id.ok_or(IDENTITY_ERROR)?;
            let identity = current_identity(&tx, account_id, message_id)?.ok_or(IDENTITY_ERROR)?;
            let object = payload
                .as_object_mut()
                .ok_or("Payload de operação inválido")?;
            object.insert(
                IDENTITY_KEY.into(),
                serde_json::to_value(identity).map_err(|e| e.to_string())?,
            );
        }
        tx.execute(
                "INSERT INTO pending_operations(op_id,account_id,message_id,kind,payload_json,state,created_ts,updated_ts) VALUES(?1,?2,?3,?4,?5,'queued',?6,?6)",
                params![id, account_id, message_id, kind, payload.to_string(), now],
            )
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(id)
    }

    /// Quarantine operations whose worker died or became unresponsive.
    /// Never requeue automatically: the IMAP server may have committed a MOVE
    /// or DELETE before the client lost the acknowledgement.
    /// This is safe to invoke during startup, before launching queue workers.
    pub fn quarantine_stale_running(&self, stale_after_seconds: i64) -> Result<usize, String> {
        if stale_after_seconds < 60 {
            return Err("Tempo de recuperação deve ser >= 60 segundos".into());
        }
        let now = Local::now().timestamp();
        let cutoff = now.saturating_sub(stale_after_seconds);
        let count = self.store.conn()?.execute(
            "UPDATE pending_operations SET state='needs_review',next_attempt_ts=0,last_error='Execução interrompida; verificar estado remoto antes de qualquer nova tentativa',updated_ts=?1 WHERE state='running' AND updated_ts<=?2",
            params![now, cutoff],
        ).map_err(|e| e.to_string())?;
        Ok(count)
    }

    pub fn process_one(&self) -> Result<Option<String>, String> {
        self.process_selected(None)
    }

    /// Execute precisely the newly enqueued operation, without stealing an
    /// older job belonging to another account. Background workers retain FIFO.
    pub fn process_one_for(&self, operation_id: &str) -> Result<Option<String>, String> {
        if operation_id.is_empty() {
            return Err("Identificador de operação vazio".into());
        }
        self.process_selected(Some(operation_id))
    }

    fn process_selected(&self, requested_id: Option<&str>) -> Result<Option<String>, String> {
        let now = Local::now().timestamp();
        let c = self.store.conn()?;
        let row = c
            .query_row(
                "SELECT op_id,account_id,message_id,kind,payload_json FROM pending_operations WHERE state IN ('queued','retry_wait') AND next_attempt_ts<=?1 AND (?2 IS NULL OR op_id=?2) ORDER BY created_ts LIMIT 1",
                params![now, requested_id],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, i64>(1)?,
                        r.get::<_, Option<i64>>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, String>(4)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;

        let Some((id, account_id, message_id, kind, payload)) = row else {
            return Ok(None);
        };

        // Claim atomically: two workers must never execute the same remote mutation.
        let claimed = c.execute(
            "UPDATE pending_operations SET state='running',attempts=attempts+1,updated_ts=?2 WHERE op_id=?1 AND state IN ('queued','retry_wait') AND next_attempt_ts<=?2",
            params![id, now],
        ).map_err(|e| e.to_string())?;
        if claimed == 0 {
            return Ok(None);
        }

        let result = (|| -> Result<(), String> {
            let db = self.store.legacy()?;
            let account = db
                .get_account(account_id)
                .map_err(|e| e.to_string())?
                .ok_or("Conta não encontrada")?;
            let value: serde_json::Value =
                serde_json::from_str(&payload).map_err(|e| e.to_string())?;
            let mid = message_id.ok_or("Operação sem mensagem")?;
            let message = db
                .get_message(mid)
                .map_err(|e| e.to_string())?
                .ok_or("Mensagem não encontrada")?;
            // Do not ever apply a queued operation to a different account.
            // Local IDs are not substitutes for account-level authorization.
            if message.account_id != account_id {
                return Err("Operação rejeitada: mensagem pertence a outra conta".into());
            }
            if message.uid == 0 || message.folder.trim().is_empty() {
                return Err("Operação rejeitada: UID ou pasta IMAP inválidos".into());
            }
            let captured = if needs_remote_identity(&kind, &value) {
                let captured: QueuedIdentity =
                    serde_json::from_value(value.get(IDENTITY_KEY).cloned().ok_or(IDENTITY_ERROR)?)
                        .map_err(|_| IDENTITY_ERROR)?;
                if current_identity(&self.store.conn()?, account_id, mid)?.as_ref()
                    != Some(&captured)
                {
                    return Err(IDENTITY_ERROR.into());
                }
                Some(captured)
            } else {
                None
            };
            match kind.as_str() {
                "flags" => {
                    let seen = value
                        .get("unread")
                        .and_then(|v| v.as_bool())
                        .map(|unread| !unread);
                    let starred = value.get("starred").and_then(|v| v.as_bool());
                    let mut account_permit = None;
                    // Pinned and priority are local metadata; avoid network/OAuth for local-only changes.
                    if seen.is_some() || starred.is_some() {
                        let password = crate::oauth::mail_auth_secret(&account)?;
                        {
                            account_permit = Some(remote_async_mutation(
                                &account,
                                &password,
                                &self.store,
                                mid,
                                captured.as_ref().ok_or(IDENTITY_ERROR)?,
                                RemoteMutation {
                                    seen,
                                    starred,
                                    destination: None,
                                },
                            )?);
                        }
                    }
                    if let Some(identity) = captured.as_ref() {
                        self.store.set_flags_if_current(
                            crate::store::HydrationIdentity {
                                message_id: mid,
                                account_id,
                                folder: &identity.folder,
                                uid: identity.uid,
                                uid_validity: identity.uid_validity,
                            },
                            value.get("starred").and_then(|v| v.as_bool()),
                            value.get("pinned").and_then(|v| v.as_bool()),
                            value.get("priority").and_then(|v| v.as_bool()),
                            value.get("unread").and_then(|v| v.as_bool()),
                        )?;
                    } else {
                        db.set_message_flags(
                            mid,
                            starred,
                            value.get("pinned").and_then(|v| v.as_bool()),
                            value.get("priority").and_then(|v| v.as_bool()),
                            value.get("unread").and_then(|v| v.as_bool()),
                        )
                        .map_err(|e| e.to_string())?;
                    }
                    drop(account_permit);
                }
                "delete" => {
                    let permanent = value
                        .get("permanent")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    let trash = db
                        .folder_role(account.id, "trash")
                        .unwrap_or_else(|| "Trash".into());
                    if !permanent && (trash.trim().is_empty() || trash == message.folder) {
                        return Err(
                            "Lixeira IMAP inválida ou mensagem já localizada na lixeira".into()
                        );
                    }
                    let password = crate::oauth::mail_auth_secret(&account)?;
                    let account_permit;
                    if permanent {
                        {
                            account_permit = remote_async_permanent_delete(
                                &account,
                                &password,
                                &self.store,
                                mid,
                                captured.as_ref().ok_or(IDENTITY_ERROR)?,
                            )?;
                        }
                    } else {
                        {
                            account_permit = remote_async_mutation(
                                &account,
                                &password,
                                &self.store,
                                mid,
                                captured.as_ref().ok_or(IDENTITY_ERROR)?,
                                RemoteMutation {
                                    seen: None,
                                    starred: None,
                                    destination: Some(&trash),
                                },
                            )?;
                        }
                    }
                    {
                        let identity = captured.as_ref().ok_or(IDENTITY_ERROR)?;
                        self.store
                            .remove_message_if_current(crate::store::HydrationIdentity {
                                message_id: mid,
                                account_id,
                                folder: &identity.folder,
                                uid: identity.uid,
                                uid_validity: identity.uid_validity,
                            })?;
                        drop(account_permit);
                    }
                }
                "move" => {
                    let target = value
                        .get("target")
                        .and_then(|v| v.as_str())
                        .ok_or("Destino ausente")?;
                    if target.trim().is_empty() || target == message.folder {
                        return Err("Destino IMAP vazio ou igual à pasta de origem".into());
                    }
                    let password = crate::oauth::mail_auth_secret(&account)?;
                    let account_permit = remote_async_mutation(
                        &account,
                        &password,
                        &self.store,
                        mid,
                        captured.as_ref().ok_or(IDENTITY_ERROR)?,
                        RemoteMutation {
                            seen: None,
                            starred: None,
                            destination: Some(target),
                        },
                    )?;
                    {
                        let identity = captured.as_ref().ok_or(IDENTITY_ERROR)?;
                        self.store
                            .remove_message_if_current(crate::store::HydrationIdentity {
                                message_id: mid,
                                account_id,
                                folder: &identity.folder,
                                uid: identity.uid,
                                uid_validity: identity.uid_validity,
                            })?;
                        drop(account_permit);
                    }
                }
                _ => return Err("Operação desconhecida".into()),
            }
            Ok(())
        })();

        match result {
            Ok(()) => {
                let completed = c.execute(
                    "UPDATE pending_operations SET state='done',last_error='',updated_ts=?2 WHERE op_id=?1 AND state='running'",
                    params![id, now],
                ).map_err(|e| e.to_string())?;
                if completed != 1 {
                    return Err("Operação perdeu a posse da fila durante execução; preservar revisão manual".into());
                }
                Ok(Some(id))
            }
            Err(e) => {
                let attempts: i64 = c
                    .query_row(
                        "SELECT attempts FROM pending_operations WHERE op_id=?1",
                        params![id],
                        |r| r.get(0),
                    )
                    .unwrap_or(1);
                // MOVE and DELETE have uncertain outcomes after lost acknowledgements.
                // Automatically replaying them may act on a different mailbox state.
                // Require reconciliation/manual intervention instead of blind retries.
                let review_required = e == IDENTITY_ERROR;
                let retryable = kind == "flags" && attempts < 5 && !review_required;
                let delay = (30_i64.saturating_mul(1_i64 << attempts.min(6) as u32)).min(3600);
                let finalized = c.execute(
                    "UPDATE pending_operations SET state=?2,next_attempt_ts=?3,last_error=?4,updated_ts=?5 WHERE op_id=?1 AND state='running'",
                    params![id, if retryable{"retry_wait"}else if review_required || kind == "move" || kind == "delete" {"needs_review"}else{"failed"}, if retryable{now+delay}else{0}, e, now],
                ).map_err(|x| x.to_string())?;
                if finalized != 1 {
                    return Err("Operação perdeu a posse da fila durante execução; preservar revisão manual".into());
                }
                if retryable {
                    Ok(Some(id))
                } else {
                    Err(e)
                }
            }
        }
    }
}

#[cfg(test)]
mod queue_identity_tests {
    use super::*;

    fn fixture() -> OperationQueue {
        let path = std::env::temp_dir().join(format!("tcs-queue-identity-{}.db", Uuid::new_v4()));
        let store = CoreStore::open(&path).unwrap();
        let conn = store.conn().unwrap();
        conn.execute("INSERT INTO accounts(id,name,email,imap_host,smtp_host,username) VALUES(1,'fixture','test@example.invalid','imap.example.invalid','smtp.example.invalid','fixture')", []).unwrap();
        conn.execute(
            "INSERT INTO messages(id,account_id,folder,uid,date_ts) VALUES(10,1,'INBOX',42,0)",
            [],
        )
        .unwrap();
        drop(conn);
        OperationQueue { store }
    }

    fn state(queue: &OperationQueue, id: &str) -> String {
        queue
            .store
            .conn()
            .unwrap()
            .query_row(
                "SELECT state FROM pending_operations WHERE op_id=?1",
                [id],
                |r| r.get(0),
            )
            .unwrap()
    }

    #[test]
    fn queued_identity_is_captured_and_stale_or_old_operations_are_quarantined() {
        let queue = fixture();
        let payload = serde_json::json!({"target":"Archive", IDENTITY_KEY:{"folder":"fake","uid":999,"uid_validity":999}});
        assert!(queue.enqueue(1, Some(10), "move", &payload).is_err());
        queue
            .store
            .save_sync_state(1, "INBOX", Some(71), 42, Some(42), false)
            .unwrap();
        let op = queue.enqueue(1, Some(10), "move", &payload).unwrap();
        let json: String = queue
            .store
            .conn()
            .unwrap()
            .query_row(
                "SELECT payload_json FROM pending_operations WHERE op_id=?1",
                [&op],
                |r| r.get(0),
            )
            .unwrap();
        let stored: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(stored[IDENTITY_KEY]["uid"], 42);
        assert_eq!(stored[IDENTITY_KEY]["uid_validity"], 71);
        assert_eq!(stored[IDENTITY_KEY]["folder"], "INBOX");
        queue
            .store
            .save_sync_state(1, "INBOX", Some(72), 42, Some(42), false)
            .unwrap();
        assert!(queue.process_one_for(&op).is_err());
        assert_eq!(state(&queue, &op), "needs_review");
        let old = queue
            .enqueue(1, Some(10), "flags", &serde_json::json!({"unread":false}))
            .unwrap();
        queue
            .store
            .conn()
            .unwrap()
            .execute(
                "UPDATE pending_operations SET payload_json=?2 WHERE op_id=?1",
                params![old, r#"{"unread":false}"#],
            )
            .unwrap();
        assert!(queue.process_one_for(&old).is_err());
        assert_eq!(state(&queue, &old), "needs_review");
        assert!(queue.enqueue(2, Some(10), "move", &payload).is_err());
    }

    #[test]
    fn local_only_flags_do_not_require_a_mailbox_epoch() {
        let queue = fixture();
        let op = queue
            .enqueue(1, Some(10), "flags", &serde_json::json!({"pinned":true}))
            .unwrap();
        assert_eq!(queue.process_one_for(&op).unwrap(), Some(op.clone()));
        assert_eq!(state(&queue, &op), "done");
        let pinned: i64 = queue
            .store
            .conn()
            .unwrap()
            .query_row("SELECT pinned FROM messages WHERE id=10", [], |r| r.get(0))
            .unwrap();
        assert_eq!(pinned, 1);
    }

    #[test]
    fn queued_uid_replacement_is_quarantined_without_connecting() {
        let queue = fixture();
        queue
            .store
            .save_sync_state(1, "INBOX", Some(71), 42, Some(42), false)
            .unwrap();
        let op = queue
            .enqueue(
                1,
                Some(10),
                "delete",
                &serde_json::json!({"permanent":true}),
            )
            .unwrap();
        queue
            .store
            .conn()
            .unwrap()
            .execute("UPDATE messages SET uid=43 WHERE id=10", [])
            .unwrap();
        assert!(queue.process_one_for(&op).is_err());
        assert_eq!(state(&queue, &op), "needs_review");
    }
}
