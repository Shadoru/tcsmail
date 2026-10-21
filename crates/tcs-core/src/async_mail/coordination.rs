//! Per-account async operation admission, phase 2 of the IMAP migration.
//!
//! This is intentionally NOT a connection pool: callers retain ownership of
//! their authenticated sessions and must logout/drop them. The coordinator
//! serializes the selected async Tauri operations of the same account without
//! blocking Tokio worker threads. Legacy synchronous calls are not coordinated.
use crate::mail::MailError;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

#[derive(Default)]
pub struct AccountOperationCoordinator {
    slots: Mutex<HashMap<i64, Arc<Semaphore>>>,
}

impl AccountOperationCoordinator {
    pub fn new() -> Self {
        Self::default()
    }

    /// The returned owned permit must be held until the IMAP operation and
    /// best-effort logout finish. Cancellation releases the permit automatically.
    pub async fn acquire(&self, account_id: i64) -> Result<OwnedSemaphorePermit, MailError> {
        if account_id <= 0 {
            return Err(MailError::Protocol(
                "Invalid account identifier for IMAP operation".into(),
            ));
        }
        let semaphore = {
            let mut slots = self
                .slots
                .lock()
                .map_err(|_| MailError::Protocol("IMAP coordinator lock poisoned".into()))?;
            Arc::clone(
                slots
                    .entry(account_id)
                    .or_insert_with(|| Arc::new(Semaphore::new(1))),
            )
        };
        semaphore
            .acquire_owned()
            .await
            .map_err(|_| MailError::Protocol("IMAP account operation coordinator closed".into()))
    }
}

static COORDINATOR: OnceLock<AccountOperationCoordinator> = OnceLock::new();

pub async fn acquire_account_operation(account_id: i64) -> Result<OwnedSemaphorePermit, MailError> {
    COORDINATOR
        .get_or_init(AccountOperationCoordinator::new)
        .acquire(account_id)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn operations_are_serial_per_account_but_independent_across_accounts() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(async {
            let coordinator = AccountOperationCoordinator::new();
            assert!(coordinator.acquire(0).await.is_err());
            let first = coordinator.acquire(11).await.unwrap();
            let independent = tokio::time::timeout(
                std::time::Duration::from_millis(100),
                coordinator.acquire(12),
            )
            .await
            .unwrap()
            .unwrap();
            assert!(tokio::time::timeout(
                std::time::Duration::from_millis(20),
                coordinator.acquire(11)
            )
            .await
            .is_err());
            drop(first);
            assert!(tokio::time::timeout(
                std::time::Duration::from_millis(100),
                coordinator.acquire(11)
            )
            .await
            .is_ok());
            drop(independent);
        });
    }
}
