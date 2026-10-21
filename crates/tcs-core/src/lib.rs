pub mod async_mail;
pub mod carddav;
pub mod db;
pub mod dto;
pub mod mail;
pub mod models;
pub mod oauth;
pub mod operations;
pub mod outbound;
pub mod productivity;
pub mod secrets;
pub mod store;
pub mod sync_engine;

pub use store::{CoreStore, MessagePageScope};

/// Maximum total size of outgoing attachments accepted by the local composer.
pub const MAX_ATTACHMENT_BYTES: i64 = 25 * 1024 * 1024;

#[cfg(test)]
mod attachment_limit_tests {
    use super::MAX_ATTACHMENT_BYTES;

    #[test]
    fn outgoing_attachment_limit_is_25_mib() {
        assert_eq!(MAX_ATTACHMENT_BYTES, 26_214_400);
    }
}
