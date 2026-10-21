use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};

fn default_auth_method() -> String {
    "password".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: i64,
    pub name: String,
    pub email: String,
    pub imap_host: String,
    pub imap_port: u16,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub username: String,
    pub use_tls: bool,
    pub imap_security: String,
    pub smtp_security: String,
    #[serde(default = "default_auth_method")]
    pub auth_method: String,
    #[serde(default)]
    pub oauth_provider: String,
    pub default_signature_id: Option<i64>,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AttachmentInfo {
    pub filename: String,
    pub mime_type: String,
    pub data_hex: String,
    pub content_id: String,
    #[serde(default)]
    pub part_id: String,
    #[serde(default)]
    pub size_hint: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct MessageSummary {
    pub id: i64,
    pub account_id: i64,
    pub folder: String,
    pub uid: u32,
    pub subject: String,
    pub from_name: String,
    pub from_email: String,
    pub to_text: String,
    pub cc_text: String,
    pub date: DateTime<Local>,
    pub snippet: String,
    pub body_text: String,
    pub body_html: String,
    pub attachments: Vec<AttachmentInfo>,
    pub calendar_ics: String,
    pub unread: bool,
    pub starred: bool,
    pub spam: bool,
    pub message_id: String,
    pub in_reply_to: String,
    pub references_text: String,
    pub has_attachments: bool,
    pub pinned: bool,
    pub priority: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Signature {
    pub id: i64,
    pub account_id: Option<i64>,
    pub name: String,
    pub language: Option<String>,
    pub context: Option<String>,
    pub body: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub id: i64,
    pub name: String,
    pub subject: String,
    pub body: String,
}

#[derive(Debug, Clone, Default)]
pub struct SpecialFolders {
    pub sent: Option<String>,
    pub drafts: Option<String>,
    pub archive: Option<String>,
    pub trash: Option<String>,
    pub junk: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSettings {
    pub enabled: bool,
    pub endpoint: String,
    pub fast_model: String,
    pub advanced_model: String,
    pub embeddings_model: String,
    pub rag_enabled: bool,
}
impl Default for AiSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            endpoint: "http://127.0.0.1:9292".into(),
            fast_model: String::new(),
            advanced_model: String::new(),
            embeddings_model: String::new(),
            rag_enabled: false,
        }
    }
}

#[derive(Debug, Clone)]
pub struct InlineAttachment {
    pub path: std::path::PathBuf,
    pub content_id: String,
    pub mime_type: String,
}
#[derive(Debug, Clone)]
pub struct MailDraft {
    pub from_name: String,
    pub from_email: String,
    pub reply_to: Option<String>,
    pub to: String,
    pub cc: String,
    pub bcc: String,
    pub subject: String,
    pub text_body: String,
    pub html_body: String,
    pub in_reply_to: Option<String>,
    pub references: Option<String>,
    pub attachments: Vec<std::path::PathBuf>,
    pub inline_attachments: Vec<InlineAttachment>,
    pub draft_key: Option<String>,
    pub request_read_receipt: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DiagnosticReport {
    pub imap_connect: bool,
    pub imap_login: bool,
    pub select_inbox: bool,
    pub search: bool,
    pub fetch: bool,
    pub smtp_tcp: bool,
    pub smtp: bool,
    pub smtp_recommended_port: Option<u16>,
    pub detail: String,
}
