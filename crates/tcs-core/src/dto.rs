use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountView {
    pub id: i64,
    pub name: String,
    pub email: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageListItem {
    pub id: i64,
    pub account_id: i64,
    pub folder: String,
    pub uid: u32,
    pub subject: String,
    pub from_name: String,
    pub from_email: String,
    pub to_text: String,
    pub date_ts: i64,
    pub snippet: String,
    pub unread: bool,
    pub starred: bool,
    pub pinned: bool,
    pub priority: bool,
    pub spam: bool,
    pub has_attachments: bool,
    pub smart_category: String,
    pub message_id: String,
    pub in_reply_to: String,
    pub references_text: String,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagePage {
    pub items: Vec<MessageListItem>,
    pub next_cursor: Option<String>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageDetail {
    pub id: i64,
    pub account_id: i64,
    pub folder: String,
    pub uid: u32,
    pub subject: String,
    pub from_name: String,
    pub from_email: String,
    pub to_text: String,
    pub cc_text: String,
    pub date_ts: i64,
    pub body_text: String,
    pub body_html: String,
    pub unread: bool,
    pub starred: bool,
    pub pinned: bool,
    pub priority: bool,
    pub spam: bool,
    pub message_id: String,
    pub in_reply_to: String,
    pub references_text: String,
    pub attachments: Vec<AttachmentMeta>,
    pub calendar_ics: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentMeta {
    pub index: usize,
    pub filename: String,
    pub mime_type: String,
    pub size_hint: Option<u64>,
    pub content_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncProgress {
    pub phase: String,
    pub fetched: usize,
    pub stored: usize,
    pub backfill_complete: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentHandleView {
    pub id: String,
    pub filename: String,
    pub mime_type: String,
    pub size: u64,
    pub content_id: String,
}
