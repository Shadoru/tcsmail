use crate::dto::SyncProgress;
use crate::store::SyncBatchCheckpoint;
use crate::{mail, CoreStore};

fn reconcile_epoch_changed(stored: Option<u32>, remote: Option<u32>) -> Result<bool, String> {
    match (stored, remote) {
        (Some(local), Some(server)) if local != 0 && server != 0 => Ok(local != server),
        _ => Err("UIDVALIDITY local ou remota ausente; sincronize antes de reconciliar".into()),
    }
}

fn require_remote_sync_epoch(remote: Option<u32>) -> Result<u32, String> {
    remote
        .filter(|value| *value != 0)
        .ok_or_else(|| "UIDVALIDITY remota ausente ou inválida; sincronização cancelada".into())
}

/// Synchronous compatibility boundary for callers that are already on a
/// blocking worker. The account permit is returned and held through the local
/// cache transaction, so a concurrent coordinated sync cannot change the epoch.
fn fetch_attachment_async(
    store: &CoreStore,
    account: &crate::models::Account,
    credential: &str,
    folder: &str,
    uid: u32,
    part_id: &str,
) -> Result<(Vec<u8>, tokio::sync::OwnedSemaphorePermit, u32), String> {
    std::thread::scope(|scope| {
        scope
            .spawn(|| {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| e.to_string())?;
                runtime.block_on(async {
                    let permit =
                        crate::async_mail::coordination::acquire_account_operation(account.id)
                            .await
                            .map_err(|e| e.to_string())?;
                    let db_store = store.clone();
                    let db_folder = folder.to_owned();
                    let account_id = account.id;
                    let validity = tokio::task::spawn_blocking(move || {
                        db_store.sync_state(account_id, &db_folder)
                    })
                    .await
                    .map_err(|e| e.to_string())??
                    .0
                    .filter(|v| *v != 0)
                    .ok_or(
                        "UIDVALIDITY local ausente; sincronize a pasta antes de baixar o anexo",
                    )?;
                    let mut session = tokio::time::timeout(
                        std::time::Duration::from_secs(45),
                        crate::async_mail::login_secure(account, credential),
                    )
                    .await
                    .map_err(|_| "Tempo limite de autenticação IMAP".to_string())?
                    .map_err(|e| e.to_string())?;
                    let result = tokio::time::timeout(
                        std::time::Duration::from_secs(120),
                        crate::async_mail::fetch_attachment_part(
                            &mut session,
                            folder,
                            uid,
                            validity,
                            part_id,
                        ),
                    )
                    .await
                    .map_err(|_| "Tempo limite ao baixar anexo IMAP".to_string());
                    let _ =
                        tokio::time::timeout(std::time::Duration::from_secs(8), session.logout())
                            .await;
                    let bytes = result?.map_err(|e| e.to_string())?;
                    Ok((bytes, permit, validity))
                })
            })
            .join()
            .map_err(|_| "Worker IMAP de anexo interrompido".to_string())?
    })
}

fn hydrate_message_async(
    store: &CoreStore,
    account: &crate::models::Account,
    credential: &str,
    folder: &str,
    uid: u32,
) -> Result<
    (
        mail::LazyMessageContent,
        tokio::sync::OwnedSemaphorePermit,
        u32,
    ),
    String,
> {
    std::thread::scope(|scope| {
        scope
            .spawn(|| {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| e.to_string())?;
                runtime.block_on(async {
                    let permit =
                        crate::async_mail::coordination::acquire_account_operation(account.id)
                            .await
                            .map_err(|e| e.to_string())?;
                    let db_store = store.clone();
                    let db_folder = folder.to_owned();
                    let account_id = account.id;
                    let validity = tokio::task::spawn_blocking(move || {
                        db_store.sync_state(account_id, &db_folder)
                    })
                    .await
                    .map_err(|e| e.to_string())??
                    .0
                    .filter(|v| *v != 0)
                    .ok_or(
                        "UIDVALIDITY local ausente; sincronize a pasta antes de abrir a mensagem",
                    )?;
                    let mut session = tokio::time::timeout(
                        std::time::Duration::from_secs(45),
                        crate::async_mail::login_secure(account, credential),
                    )
                    .await
                    .map_err(|_| "Tempo limite de autenticação IMAP".to_string())?
                    .map_err(|e| e.to_string())?;
                    let result = tokio::time::timeout(
                        std::time::Duration::from_secs(120),
                        crate::async_mail::fetch_lazy_message_content(
                            &mut session,
                            folder,
                            uid,
                            validity,
                        ),
                    )
                    .await
                    .map_err(|_| "Tempo limite ao abrir mensagem IMAP".to_string());
                    let _ =
                        tokio::time::timeout(std::time::Duration::from_secs(8), session.logout())
                            .await;
                    let content = result?.map_err(|e| e.to_string())?;
                    Ok((content, permit, validity))
                })
            })
            .join()
            .map_err(|_| "Worker IMAP de hidratação interrompido".to_string())?
    })
}

#[derive(Clone)]
pub struct SyncEngine {
    pub store: CoreStore,
}
impl SyncEngine {
    /// Compatibility boundary for synchronous callers. This executes the async
    /// implementation on a dedicated worker thread, never
    /// block_on on an existing Tokio worker (including current-thread runtimes).
    pub fn sync_recent(
        &self,
        account_id: i64,
        folder: &str,
        limit: usize,
    ) -> Result<SyncProgress, String> {
        let engine = self.clone();
        let folder = folder.to_owned();
        std::thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| e.to_string())?;
            runtime.block_on(engine.sync_recent_async(account_id, &folder, limit))
        })
        .join()
        .map_err(|_| "Worker assíncrono IMAP interrompido".to_string())?
    }
    /// Production command path for incremental synchronization over async-imap.
    /// Keep SQLite and secret retrieval off Tokio worker threads. Remote headers
    /// are committed only after all FETCH responses were checked successfully.
    pub async fn sync_recent_async(
        &self,
        account_id: i64,
        folder: &str,
        limit: usize,
    ) -> Result<SyncProgress, String> {
        if folder.trim().is_empty() {
            return Err("Pasta IMAP vazia".into());
        }
        // Hold the same-account permit BEFORE loading the checkpoint. Otherwise a
        // concurrent sync may advance the cursor after this snapshot and before the
        // network fetch, allowing a stale checkpoint to overwrite newer progress.
        let _permit = crate::async_mail::coordination::acquire_account_operation(account_id)
            .await
            .map_err(|e| e.to_string())?;
        let name = folder.to_owned();
        let prep_store = self.store.clone();
        let prep_name = name.clone();
        let (account, password, stored_validity, highest, oldest, complete, orphaned_uids) =
            tokio::task::spawn_blocking(move || {
                let db = prep_store.legacy()?;
                let account = db
                    .get_account(account_id)
                    .map_err(|e| e.to_string())?
                    .ok_or("Conta não encontrada")?;
                let password = crate::oauth::mail_auth_secret(&account)?;
                let (validity, highest, oldest, complete) =
                    prep_store.sync_state(account_id, &prep_name)?;
                let orphaned_uids: bool = if validity.is_none() {
                    prep_store.conn()?.query_row(
                        "SELECT EXISTS(SELECT 1 FROM messages WHERE account_id=?1 AND folder=?2 AND uid>0)",
                        rusqlite::params![account_id, prep_name],
                        |row| row.get(0),
                    ).map_err(|e| e.to_string())?
                } else { false };
                Ok::<_, String>((account, password, validity, highest, oldest, complete, orphaned_uids))
            })
            .await
            .map_err(|e| e.to_string())??;
        if stored_validity == Some(0)
            || (stored_validity.is_none() && highest != 0 && !orphaned_uids)
        {
            return Err(
                "Checkpoint IMAP sem UIDVALIDITY válido; recuperação segura necessária".into(),
            );
        }
        let mut session = tokio::time::timeout(
            std::time::Duration::from_secs(45),
            crate::async_mail::login_secure(&account, &password),
        )
        .await
        .map_err(|_| "Tempo limite de autenticação IMAP".to_string())?
        .map_err(|e| e.to_string())?;
        let spam = name.to_ascii_lowercase().contains("spam")
            || name.to_ascii_lowercase().contains("junk");
        let fetch = async {
            let (messages, newest, validity) = crate::async_mail::sync_folder_since(
                &mut session,
                &account,
                &name,
                if orphaned_uids { 0 } else { highest },
                limit.clamp(20, 1000),
                spam,
            )
            .await
            .map_err(|e| e.to_string())?;
            require_remote_sync_epoch(validity)?;
            if orphaned_uids
                || (stored_validity.is_some() && validity.is_some() && stored_validity != validity)
            {
                let (reset_messages, reset_highest, reset_validity) =
                    crate::async_mail::sync_folder_since(
                        &mut session,
                        &account,
                        &name,
                        0,
                        limit.clamp(20, 1000),
                        spam,
                    )
                    .await
                    .map_err(|e| e.to_string())?;
                if reset_validity != validity {
                    return Err(
                        "UIDVALIDITY mudou durante a sincronização; atualização abortada".into(),
                    );
                }
                let low = reset_messages.iter().map(|m| m.uid).min();
                Ok::<_, String>((
                    reset_messages,
                    SyncBatchCheckpoint {
                        uid_validity: reset_validity,
                        highest: reset_highest,
                        oldest: low,
                        complete: false,
                    },
                    true,
                ))
            } else {
                let low = oldest.or_else(|| messages.iter().map(|m| m.uid).min());
                Ok::<_, String>((
                    messages,
                    SyncBatchCheckpoint {
                        uid_validity: validity,
                        highest: newest.max(highest),
                        oldest: low,
                        complete,
                    },
                    false,
                ))
            }
        };
        let outcome = tokio::time::timeout(std::time::Duration::from_secs(120), fetch)
            .await
            .map_err(|_| "Tempo limite de sincronização IMAP".to_string());
        let _ = tokio::time::timeout(std::time::Duration::from_secs(8), session.logout()).await;
        let (messages, checkpoint, reset) = outcome??;
        let write_store = self.store.clone();
        let write_name = name.clone();
        tokio::task::spawn_blocking(move || {
            let count = messages.len();
            write_store.commit_guarded_sync_batch(
                account_id,
                &write_name,
                &messages,
                checkpoint,
                reset,
                SyncBatchCheckpoint {
                    uid_validity: stored_validity,
                    highest,
                    oldest,
                    complete,
                },
            )?;
            Ok::<_, String>(SyncProgress {
                phase: "recent".into(),
                fetched: count,
                stored: count,
                backfill_complete: checkpoint.complete,
            })
        })
        .await
        .map_err(|e| e.to_string())?
    }

    /// Compatibility boundary for synchronous callers. This executes the async
    /// implementation on a dedicated worker thread, never
    /// block_on on an existing Tokio worker (including current-thread runtimes).
    pub fn backfill(
        &self,
        account_id: i64,
        folder: &str,
        limit: usize,
    ) -> Result<SyncProgress, String> {
        let engine = self.clone();
        let folder = folder.to_owned();
        std::thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| e.to_string())?;
            runtime.block_on(engine.backfill_async(account_id, &folder, limit))
        })
        .join()
        .map_err(|_| "Worker assíncrono IMAP interrompido".to_string())?
    }
    /// Historical page fetch using the account-scoped asynchronous IMAP backend.
    pub async fn backfill_async(
        &self,
        account_id: i64,
        folder: &str,
        limit: usize,
    ) -> Result<SyncProgress, String> {
        if folder.trim().is_empty() {
            return Err("Pasta IMAP vazia".into());
        }
        let _permit = crate::async_mail::coordination::acquire_account_operation(account_id)
            .await
            .map_err(|e| e.to_string())?;
        let name = folder.to_owned();
        let prep_store = self.store.clone();
        let prep_name = name.clone();
        let (account, password, validity, highest, oldest, complete) =
            tokio::task::spawn_blocking(move || {
                let db = prep_store.legacy()?;
                let account = db
                    .get_account(account_id)
                    .map_err(|e| e.to_string())?
                    .ok_or("Conta não encontrada")?;
                let password = crate::oauth::mail_auth_secret(&account)?;
                let (validity, highest, oldest, complete) =
                    prep_store.sync_state(account_id, &prep_name)?;
                Ok::<_, String>((account, password, validity, highest, oldest, complete))
            })
            .await
            .map_err(|e| e.to_string())??;
        if validity.is_none() || validity == Some(0) {
            return Err(
                "UIDVALIDITY local ausente ou inválida; sincronize antes do backfill".into(),
            );
        }
        if complete {
            return Ok(SyncProgress {
                phase: "backfill".into(),
                fetched: 0,
                stored: 0,
                backfill_complete: true,
            });
        }
        let before = oldest.unwrap_or(highest.saturating_add(1));
        if before <= 1 {
            let store = self.store.clone();
            tokio::task::spawn_blocking(move || {
                store.commit_guarded_sync_batch(
                    account_id,
                    &name,
                    &[],
                    SyncBatchCheckpoint {
                        uid_validity: validity,
                        highest,
                        oldest,
                        complete: true,
                    },
                    false,
                    SyncBatchCheckpoint {
                        uid_validity: validity,
                        highest,
                        oldest,
                        complete,
                    },
                )
            })
            .await
            .map_err(|e| e.to_string())??;
            return Ok(SyncProgress {
                phase: "backfill".into(),
                fetched: 0,
                stored: 0,
                backfill_complete: true,
            });
        }
        let mut session = tokio::time::timeout(
            std::time::Duration::from_secs(45),
            crate::async_mail::login_secure(&account, &password),
        )
        .await
        .map_err(|_| "Tempo limite de autenticação IMAP".to_string())?
        .map_err(|e| e.to_string())?;
        let spam = name.to_ascii_lowercase().contains("spam")
            || name.to_ascii_lowercase().contains("junk");
        let fetched = tokio::time::timeout(
            std::time::Duration::from_secs(120),
            crate::async_mail::sync_folder_before(
                &mut session,
                &account,
                &name,
                before,
                limit.clamp(20, 1000),
                spam,
            ),
        )
        .await
        .map_err(|_| "Tempo limite de backfill IMAP".to_string());
        let _ = tokio::time::timeout(std::time::Duration::from_secs(8), session.logout()).await;
        let (messages, new_oldest, current_validity) = fetched?.map_err(|e| e.to_string())?;
        if validity.is_some() && validity != current_validity {
            return Err("UIDVALIDITY mudou durante o backfill; executar sincronização recente antes de continuar".into());
        }
        let done = new_oldest.is_none() || new_oldest == Some(1);
        let count = messages.len();
        let checkpoint = SyncBatchCheckpoint {
            uid_validity: current_validity.or(validity),
            highest,
            oldest: new_oldest.or(oldest),
            complete: done,
        };
        let store = self.store.clone();
        tokio::task::spawn_blocking(move || {
            store.commit_guarded_sync_batch(
                account_id,
                &name,
                &messages,
                checkpoint,
                false,
                SyncBatchCheckpoint {
                    uid_validity: validity,
                    highest,
                    oldest,
                    complete,
                },
            )?;
            Ok::<_, String>(SyncProgress {
                phase: "backfill".into(),
                fetched: count,
                stored: count,
                backfill_complete: done,
            })
        })
        .await
        .map_err(|e| e.to_string())?
    }
    /// Compatibility boundary for synchronous callers. This executes the async
    /// implementation on a dedicated worker thread, never
    /// block_on on an existing Tokio worker (including current-thread runtimes).
    pub fn reconcile_folder(&self, account_id: i64, folder: &str) -> Result<usize, String> {
        let engine = self.clone();
        let folder = folder.to_owned();
        std::thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| e.to_string())?;
            runtime.block_on(engine.reconcile_folder_async(account_id, &folder))
        })
        .join()
        .map_err(|_| "Worker assíncrono IMAP interrompido".to_string())?
    }
    /// Async IMAP flag reconciliation. Blocking SQLite/credential operations are
    /// confined to spawn_blocking; the IMAP session is driven by Tokio/Futures.
    pub async fn reconcile_folder_async(
        &self,
        account_id: i64,
        folder: &str,
    ) -> Result<usize, String> {
        use std::collections::HashMap;
        let prep_store = self.store.clone();
        let name = folder.to_owned();
        let (account, credential) = tokio::task::spawn_blocking(move || {
            let db = prep_store.legacy()?;
            let account = db
                .get_account(account_id)
                .map_err(|e| e.to_string())?
                .ok_or("Conta não encontrada")?;
            let credential = crate::oauth::mail_auth_secret(&account)?;
            Ok::<_, String>((account, credential))
        })
        .await
        .map_err(|e| e.to_string())??;
        if name.trim().is_empty() {
            return Err("Pasta IMAP vazia".into());
        }
        // Reconciliation must not race a UID MOVE, deletion, or a concurrent sync
        // targeting the same account. The permit spans remote fetch and SQLite write.
        let _permit = crate::async_mail::coordination::acquire_account_operation(account_id)
            .await
            .map_err(|e| e.to_string())?;
        let mut session = tokio::time::timeout(
            std::time::Duration::from_secs(45),
            crate::async_mail::login_secure(&account, &credential),
        )
        .await
        .map_err(|_| "Tempo limite de autenticação IMAP na reconciliação".to_string())?
        .map_err(|e| e.to_string())?;
        let fetched = tokio::time::timeout(
            std::time::Duration::from_secs(120),
            crate::async_mail::fetch_folder_flag_state(&mut session, &name),
        )
        .await
        .map_err(|_| "Tempo limite de reconciliação IMAP".to_string());
        let _ = tokio::time::timeout(std::time::Duration::from_secs(8), session.logout()).await;
        let (remote, validity) = fetched?.map_err(|e| e.to_string())?;
        let write_store = self.store.clone();
        tokio::task::spawn_blocking(move||{
   let (stored_validity,highest,oldest,complete)=write_store.sync_state(account_id,&name)?;
   if reconcile_epoch_changed(stored_validity, validity)? {
    write_store.reset_uid_mapping_preserve_messages(account_id,&name)?;
    write_store.save_sync_state(account_id,&name,validity,0,None,false)?;
    return Err("UIDVALIDITY mudou durante a reconciliação; o próximo sync reconstruirá a pasta".into());
   }
   if remote.iter().any(|v| v.uid == 0) {
    return Err("Resposta IMAP inválida: UID 0 na reconciliação".into());
   }
   let remote_map:HashMap<u32,(bool,bool)>=remote.into_iter().map(|v|(v.uid,(v.unread,v.starred))).collect();
   let local=write_store.local_folder_uid_rows(account_id,&name)?;
   let mut updates=Vec::new();let mut removed=Vec::new();
   for (id,uid,unread,starred) in local {
    match remote_map.get(&uid) {
     Some((ru,rs)) if *ru!=unread || *rs!=starred=>updates.push((id,uid,*ru,*rs)),
     Some(_)=>{},
     None=>removed.push((id,uid)),
    }
   }
   let changed=updates.len()+removed.len();
   write_store.commit_guarded_reconcile(account_id,&name,SyncBatchCheckpoint{uid_validity:stored_validity,highest,oldest,complete},&updates,&removed,chrono::Local::now().timestamp())?;
   Ok(changed)
  }).await.map_err(|e|e.to_string())?
    }

    pub fn hydrate_message(&self, id: i64) -> Result<(), String> {
        let db = self.store.legacy()?;
        let current = db
            .get_message(id)
            .map_err(|e| e.to_string())?
            .ok_or("Mensagem não encontrada")?;
        if !current.body_text.is_empty() || !current.body_html.is_empty() {
            return Ok(());
        }
        if current.uid == 0 || current.folder.trim().is_empty() {
            return Err("UID ou pasta IMAP inválidos".into());
        }
        let account = db
            .get_account(current.account_id)
            .map_err(|e| e.to_string())?
            .ok_or("Conta não encontrada")?;
        let password = crate::oauth::mail_auth_secret(&account)?;
        {
            let (content, _account_permit, validity) = hydrate_message_async(
                &self.store,
                &account,
                &password,
                &current.folder,
                current.uid,
            )?;
            self.store.commit_hydration_if_current(
                crate::store::HydrationIdentity {
                    message_id: id,
                    account_id: current.account_id,
                    folder: &current.folder,
                    uid: current.uid,
                    uid_validity: validity,
                },
                content,
            )
        }
    }

    pub fn ensure_attachment_cached(&self, id: i64, index: usize) -> Result<(), String> {
        if self.store.attachment_path(id, index)?.is_some() {
            return Ok(());
        }
        let db = self.store.legacy()?;
        let current = db
            .get_message(id)
            .map_err(|e| e.to_string())?
            .ok_or("Mensagem não encontrada")?;
        if current.uid == 0 || current.folder.trim().is_empty() {
            return Err("UID ou pasta IMAP inválidos".into());
        }
        let info = current
            .attachments
            .get(index)
            .cloned()
            .ok_or("Anexo não encontrado")?;
        if info.part_id.trim().is_empty() {
            return Err("Este anexo não possui identificador MIME remoto".into());
        }
        let account = db
            .get_account(current.account_id)
            .map_err(|e| e.to_string())?
            .ok_or("Conta não encontrada")?;
        let password = crate::oauth::mail_auth_secret(&account)?;
        let (bytes, _account_permit, validity) = fetch_attachment_async(
            &self.store,
            &account,
            &password,
            &current.folder,
            current.uid,
            &info.part_id,
        )?;
        let fresh = db
            .get_message(id)
            .map_err(|e| e.to_string())?
            .ok_or("Mensagem removida durante o download")?;
        let same_part = fresh
            .attachments
            .get(index)
            .is_some_and(|part| part.part_id == info.part_id && part.filename == info.filename);
        if fresh.account_id != current.account_id
            || fresh.folder != current.folder
            || fresh.uid != current.uid
            || !same_part
        {
            return Err(
                "Anexo ou mensagem alterados durante o download; conteúdo remoto descartado".into(),
            );
        }
        self.store.cache_attachment_bytes_if_current(
            crate::store::AttachmentCacheIdentity {
                message_id: id,
                index,
                account_id: current.account_id,
                folder: &current.folder,
                uid: current.uid,
                uid_validity: Some(validity),
            },
            &info,
            &bytes,
        )
    }
}

#[cfg(test)]
mod reconcile_epoch_tests {
    use super::{reconcile_epoch_changed, require_remote_sync_epoch};

    #[test]
    fn reconciliation_requires_two_nonzero_epochs_and_detects_change() {
        for (local, remote) in [
            (None, None),
            (None, Some(7)),
            (Some(7), None),
            (Some(0), Some(7)),
            (Some(7), Some(0)),
            (Some(0), Some(0)),
        ] {
            assert!(reconcile_epoch_changed(local, remote).is_err());
        }
        assert!(!reconcile_epoch_changed(Some(7), Some(7)).unwrap());
        assert!(reconcile_epoch_changed(Some(7), Some(8)).unwrap());
    }

    #[test]
    fn recent_sync_rejects_missing_or_zero_remote_epoch() {
        assert!(require_remote_sync_epoch(None).is_err());
        assert!(require_remote_sync_epoch(Some(0)).is_err());
        assert_eq!(require_remote_sync_epoch(Some(71)).unwrap(), 71);
    }
}
