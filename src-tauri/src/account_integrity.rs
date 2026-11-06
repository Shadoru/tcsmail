//! Compensating transaction: the OS vault cannot join a SQLite transaction.
use tcs_core::secrets::SecretStore;

pub trait Vault {
    fn get(&self, key: &str) -> Result<Option<String>, String>;
    fn set(&self, key: &str, value: &str) -> Result<(), String>;
    fn remove(&self, key: &str) -> Result<(), String>;
}
pub struct OsVault;
impl Vault for OsVault {
    fn get(&self, key: &str) -> Result<Option<String>, String> {
        SecretStore::optional_password(key).map_err(|_| {
            "Não foi possível ler o cofre do sistema. Desbloqueie-o e tente novamente.".into()
        })
    }
    fn set(&self, key: &str, value: &str) -> Result<(), String> {
        SecretStore::store_password(key, value)
            .map_err(|_| "Não foi possível salvar a credencial no cofre do sistema.".into())
    }
    fn remove(&self, key: &str) -> Result<(), String> {
        SecretStore::clear_password(key)
            .map_err(|_| "Não foi possível remover a credencial do cofre do sistema.".into())
    }
}

pub fn save_with_secret<T>(
    vault: &impl Vault,
    key: &str,
    secret: Option<&str>,
    persist: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    let Some(secret) = secret else {
        return persist();
    };
    // Fail before changing anything when the vault is locked or inaccessible.
    let before = vault.get(key)?;
    vault.set(key, secret)?;
    match persist() {
        Ok(result) => Ok(result),
        Err(error) => {
            let rollback = match before {
                Some(value) => vault.set(key, &value),
                None => vault.remove(key),
            };
            match rollback {
                Ok(()) => Err(error),
                Err(_) => Err("A conta não foi salva e o cofre não pôde ser revertido. Reconecte a conta antes de continuar.".into()),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    struct MemoryVault {
        value: RefCell<Option<String>>,
        fail_set: bool,
        fail_get: bool,
    }
    impl Vault for MemoryVault {
        fn get(&self, _: &str) -> Result<Option<String>, String> {
            if self.fail_get {
                Err("locked".into())
            } else {
                Ok(self.value.borrow().clone())
            }
        }
        fn set(&self, _: &str, value: &str) -> Result<(), String> {
            if self.fail_set {
                Err("write failed".into())
            } else {
                *self.value.borrow_mut() = Some(value.into());
                Ok(())
            }
        }
        fn remove(&self, _: &str) -> Result<(), String> {
            *self.value.borrow_mut() = None;
            Ok(())
        }
    }
    fn vault(value: Option<&str>) -> MemoryVault {
        MemoryVault {
            value: RefCell::new(value.map(str::to_string)),
            fail_set: false,
            fail_get: false,
        }
    }
    #[test]
    fn database_sees_stored_secret() {
        let v = vault(None);
        assert_eq!(
            save_with_secret(&v, "synthetic", Some(" ç "), || {
                assert_eq!(v.value.borrow().as_deref(), Some(" ç "));
                Ok(7)
            }),
            Ok(7)
        );
    }
    #[test]
    fn failed_insert_removes_new_secret() {
        let v = vault(None);
        assert!(
            save_with_secret::<()>(&v, "synthetic", Some("new"), || Err("db failed".into()))
                .is_err()
        );
        assert!(v.value.borrow().is_none());
    }
    #[test]
    fn failed_update_restores_previous_secret() {
        let v = vault(Some("old"));
        assert!(
            save_with_secret::<()>(&v, "synthetic", Some("new"), || Err("db failed".into()))
                .is_err()
        );
        assert_eq!(v.value.borrow().as_deref(), Some("old"));
    }
    #[test]
    fn vault_write_failure_does_not_persist_account() {
        let mut v = vault(None);
        v.fail_set = true;
        assert!(
            save_with_secret::<()>(&v, "synthetic", Some("new"), || panic!("must not persist"))
                .is_err()
        );
    }
    #[test]
    fn vault_read_failure_does_not_persist_account() {
        let mut v = vault(None);
        v.fail_get = true;
        assert!(
            save_with_secret::<()>(&v, "synthetic", Some("new"), || panic!("must not persist"))
                .is_err()
        );
    }
}
