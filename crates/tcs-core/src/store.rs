use crate::{
    db::Database,
    dto::{AttachmentMeta, MessageDetail, MessageListItem, MessagePage},
    models::AttachmentInfo,
};
use chrono::Local;
use rusqlite::{params, Connection, OptionalExtension};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

#[derive(Clone)]
pub struct CoreStore {
    path: PathBuf,
}

pub struct MessagePageScope<'a> {
    pub account_id: Option<i64>,
    pub account_ids: Option<&'a [i64]>,
    pub folder: Option<&'a str>,
    pub search: Option<&'a str>,
    pub cursor: Option<&'a str>,
    pub limit: usize,
    pub starred_only: bool,
}

fn search_tokens(raw: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    for ch in raw.chars() {
        match ch {
            '"' => quoted = !quoted,
            ' ' | '\t' if !quoted => {
                if !current.is_empty() {
                    out.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(ch),
        }
    }
    if !current.is_empty() {
        out.push(current)
    }
    out
}

/// Cursor committed atomically with an IMAP message batch.
#[derive(Clone, Copy, Debug)]
pub struct SyncBatchCheckpoint {
    pub uid_validity: Option<u32>,
    pub highest: u32,
    pub oldest: Option<u32>,
    pub complete: bool,
}

/// Immutable remote identity captured before an attachment download begins.
/// Keeping these fields together makes the cache write's compare-and-commit
/// contract explicit: a remote body may only be persisted for this exact IMAP
/// message identity.
pub struct AttachmentCacheIdentity<'a> {
    pub message_id: i64,
    pub index: usize,
    pub account_id: i64,
    pub folder: &'a str,
    pub uid: u32,
    /// When known, the mailbox epoch must still match inside the transaction.
    pub uid_validity: Option<u32>,
}

pub struct HydrationIdentity<'a> {
    pub message_id: i64,
    pub account_id: i64,
    pub folder: &'a str,
    pub uid: u32,
    pub uid_validity: u32,
}

impl CoreStore {
    /// Update queued flags only for the identity that was sent to the server.
    pub fn set_flags_if_current(
        &self,
        identity: HydrationIdentity<'_>,
        starred: Option<bool>,
        pinned: Option<bool>,
        priority: Option<bool>,
        unread: Option<bool>,
    ) -> Result<(), String> {
        if identity.uid == 0 || identity.uid_validity == 0 || identity.folder.trim().is_empty() {
            return Err("Identidade IMAP inválida".into());
        }
        let changed = self.conn()?.execute(
            "UPDATE messages SET starred=COALESCE(?6,starred),pinned=COALESCE(?7,pinned),priority=COALESCE(?8,priority),unread=COALESCE(?9,unread) WHERE id=?1 AND account_id=?2 AND folder=?3 AND uid=?4 AND EXISTS (SELECT 1 FROM mailbox_sync_v2 WHERE account_id=?2 AND folder=?3 AND uid_validity=?5)",
            params![identity.message_id, identity.account_id, identity.folder, identity.uid, identity.uid_validity, starred, pinned, priority, unread],
        ).map_err(|e| e.to_string())?;
        if changed != 1 {
            return Err(
                "Identidade local ou UIDVALIDITY mudou durante atualização de flags".into(),
            );
        }
        Ok(())
    }

    /// Remove a remotely deleted message and its search index only if the
    /// cached identity and mailbox epoch still agree in one write transaction.
    pub fn remove_message_if_current(&self, identity: HydrationIdentity<'_>) -> Result<(), String> {
        if identity.uid == 0 || identity.uid_validity == 0 || identity.folder.trim().is_empty() {
            return Err("Identidade IMAP inválida".into());
        }
        let mut conn = self.conn()?;
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let indexed = tx.execute(
            "INSERT INTO messages_fts(messages_fts,rowid,subject,from_name,from_email,to_text,cc_text,snippet,body_text) SELECT 'delete',id,subject,from_name,from_email,to_text,cc_text,snippet,body_text FROM messages WHERE id=?1 AND account_id=?2 AND folder=?3 AND uid=?4 AND EXISTS (SELECT 1 FROM mailbox_sync_v2 WHERE account_id=?2 AND folder=?3 AND uid_validity=?5)",
            params![identity.message_id, identity.account_id, identity.folder, identity.uid, identity.uid_validity],
        ).map_err(|e| e.to_string())?;
        if indexed != 1 {
            return Err("Identidade local ou UIDVALIDITY mudou durante a exclusão".into());
        }
        let removed = tx
            .execute(
                "DELETE FROM messages WHERE id=?1 AND account_id=?2 AND folder=?3 AND uid=?4",
                params![
                    identity.message_id,
                    identity.account_id,
                    identity.folder,
                    identity.uid
                ],
            )
            .map_err(|e| e.to_string())?;
        if removed != 1 {
            return Err("Identidade local mudou durante a exclusão".into());
        }
        tx.commit().map_err(|e| e.to_string())
    }

    /// Commit a hydrated body only for the same message and mailbox epoch.
    /// Reloading inside the write transaction preserves intervening flag changes.
    pub fn commit_hydration_if_current(
        &self,
        identity: HydrationIdentity<'_>,
        content: crate::mail::LazyMessageContent,
    ) -> Result<(), String> {
        if identity.uid == 0 || identity.uid_validity == 0 || identity.folder.trim().is_empty() {
            return Err("Identidade IMAP inválida para hidratação".into());
        }
        let mut conn = self.conn()?;
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let validity = tx
            .query_row(
                "SELECT uid_validity FROM mailbox_sync_v2 WHERE account_id=?1 AND folder=?2",
                params![identity.account_id, identity.folder],
                |r| r.get::<_, Option<i64>>(0),
            )
            .optional()
            .map_err(|e| e.to_string())?
            .flatten();
        if validity != Some(i64::from(identity.uid_validity)) {
            return Err("UIDVALIDITY alterado durante a hidratação".into());
        }
        let existing_json: Option<String> = tx
            .query_row(
                "SELECT attachments_json FROM message_extras WHERE message_id=?1",
                params![identity.message_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some(json) = existing_json {
            serde_json::from_str::<Vec<crate::models::AttachmentInfo>>(&json)
                .map_err(|_| "Metadados de anexos inválidos; hidratação cancelada")?;
        }
        let mut message = Database::get_message_from_connection(&tx, identity.message_id)
            .map_err(|e| e.to_string())?
            .ok_or("Mensagem removida durante a hidratação")?;
        if message.account_id != identity.account_id
            || message.folder != identity.folder
            || message.uid != identity.uid
        {
            return Err("Mensagem alterada durante a hidratação".into());
        }
        if !message.body_text.is_empty() || !message.body_html.is_empty() {
            return Ok(());
        }
        message.body_text = content.body_text;
        message.body_html = content.body_html;
        message.calendar_ics = content.calendar_ics;
        let mut attachments = content.attachments;
        for existing in &message.attachments {
            let matches: Vec<_> = attachments
                .iter_mut()
                .filter(|part| {
                    !existing.part_id.is_empty()
                        && part.part_id == existing.part_id
                        && part.filename == existing.filename
                        && part.mime_type == existing.mime_type
                        && part.content_id == existing.content_id
                })
                .collect();
            if matches.len() != 1 {
                return Err("Metadados de anexos divergentes; hidratação cancelada".into());
            }
            matches.into_iter().next().unwrap().data_hex = existing.data_hex.clone();
        }
        message.attachments = attachments;
        message.has_attachments = !message.attachments.is_empty() || message.has_attachments;
        if message.snippet.is_empty() {
            message.snippet = message
                .body_text
                .chars()
                .take(180)
                .collect::<String>()
                .replace('\n', " ");
        }
        Database::upsert_message_in_tx(&tx, &message).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        Database::open(&path).map_err(|e| e.to_string())?;
        let store = Self { path };
        store.migrate_v10()?;
        Ok(store)
    }
    pub fn path(&self) -> &Path {
        &self.path
    }
    pub fn legacy(&self) -> Result<Database, String> {
        Ok(Database::attach(&self.path))
    }
    pub fn conn(&self) -> Result<Connection, String> {
        let c = Connection::open(&self.path).map_err(|e| e.to_string())?;
        c.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| e.to_string())?;
        c.busy_timeout(Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        Ok(c)
    }
    fn migrate_v10(&self) -> Result<(), String> {
        let c = self.conn()?;
        let old: i64 = c
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if old < 10 && self.path.exists() {
            let _ = c.execute_batch("PRAGMA wal_checkpoint(FULL);");
            let stamp = Local::now().format("%Y%m%d-%H%M%S");
            let b = self
                .path
                .with_file_name(format!("mail.db.backup-0.8.0-{stamp}"));
            fs::copy(&self.path, &b).map_err(|e| e.to_string())?;
        }
        c.execute_batch(include_str!("../data/schema_v10.sql"))
            .map_err(|e| e.to_string())?;
        if !column_exists(&c, "outbound_queue_v2", "sent_raw").map_err(|e| e.to_string())? {
            c.execute("ALTER TABLE outbound_queue_v2 ADD COLUMN sent_raw BLOB", [])
                .map_err(|e| e.to_string())?;
        }
        if !column_exists(&c, "tasks", "priority").map_err(|e| e.to_string())? {
            c.execute(
                "ALTER TABLE tasks ADD COLUMN priority INTEGER NOT NULL DEFAULT 0",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        if !column_exists(&c, "tasks", "rrule").map_err(|e| e.to_string())? {
            c.execute(
                "ALTER TABLE tasks ADD COLUMN rrule TEXT NOT NULL DEFAULT ''",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        if !column_exists(&c, "tasks", "reminder_ts").map_err(|e| e.to_string())? {
            c.execute("ALTER TABLE tasks ADD COLUMN reminder_ts INTEGER", [])
                .map_err(|e| e.to_string())?;
        }
        if !column_exists(&c, "accounts", "imap_security").map_err(|e| e.to_string())? {
            c.execute(
                "ALTER TABLE accounts ADD COLUMN imap_security TEXT NOT NULL DEFAULT ''",
                [],
            )
            .map_err(|e| e.to_string())?;
            c.execute("UPDATE accounts SET imap_security=CASE WHEN imap_port=143 THEN 'starttls' ELSE 'tls' END WHERE imap_security=''",[]).map_err(|e|e.to_string())?;
        }
        if !column_exists(&c, "accounts", "smtp_security").map_err(|e| e.to_string())? {
            c.execute(
                "ALTER TABLE accounts ADD COLUMN smtp_security TEXT NOT NULL DEFAULT ''",
                [],
            )
            .map_err(|e| e.to_string())?;
            c.execute("UPDATE accounts SET smtp_security=CASE WHEN smtp_port=465 THEN 'tls' ELSE 'starttls' END WHERE smtp_security=''",[]).map_err(|e|e.to_string())?;
        }
        if !column_exists(&c, "contacts", "carddav_source_id").map_err(|e| e.to_string())? {
            c.execute(
                "ALTER TABLE contacts ADD COLUMN carddav_source_id INTEGER",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        if !column_exists(&c, "contacts", "remote_href").map_err(|e| e.to_string())? {
            c.execute(
                "ALTER TABLE contacts ADD COLUMN remote_href TEXT NOT NULL DEFAULT ''",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        if !column_exists(&c, "contacts", "remote_etag").map_err(|e| e.to_string())? {
            c.execute(
                "ALTER TABLE contacts ADD COLUMN remote_etag TEXT NOT NULL DEFAULT ''",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        if !column_exists(&c, "contacts", "dirty").map_err(|e| e.to_string())? {
            c.execute(
                "ALTER TABLE contacts ADD COLUMN dirty INTEGER NOT NULL DEFAULT 0",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        if !column_exists(&c, "attachment_handles", "inline_cid").map_err(|e| e.to_string())? {
            c.execute(
                "ALTER TABLE attachment_handles ADD COLUMN inline_cid TEXT NOT NULL DEFAULT ''",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        if old < 10 {
            c.pragma_update(None, "user_version", 10)
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    pub fn list_page(
        &self,
        account_id: Option<i64>,
        folder: Option<&str>,
        search: Option<&str>,
        cursor: Option<&str>,
        limit: usize,
        starred_only: bool,
    ) -> Result<MessagePage, String> {
        self.list_page_scoped(MessagePageScope {
            account_id,
            account_ids: None,
            folder,
            search,
            cursor,
            limit,
            starred_only,
        })
    }
    pub fn list_page_scoped(&self, scope: MessagePageScope<'_>) -> Result<MessagePage, String> {
        let MessagePageScope {
            account_id,
            account_ids,
            folder,
            search,
            cursor,
            limit,
            starred_only,
        } = scope;
        let c = self.conn()?;
        let lim = limit.clamp(1, 200) as i64;
        let ordering = search
            .unwrap_or("")
            .split_whitespace()
            .find_map(|token| token.strip_prefix("tcs-sort:"));
        let (sort_key, sort_dir) = ordering
            .and_then(|v| v.split_once(':'))
            .unwrap_or(("date", "desc"));
        let sort_column = match sort_key {
            "sender" => "lower(m.from_name || ' ' || m.from_email)",
            "recipient" => "lower(COALESCE(m.to_text,''))",
            "subject" => "lower(m.subject)",
            "size" => "length(m.body_text)",
            _ => "m.date_ts",
        };
        let sort_direction = if sort_dir == "asc" { "ASC" } else { "DESC" };
        let custom_sort = ordering.is_some();
        let page_offset = if custom_sort {
            cursor
                .and_then(|v| v.strip_prefix("o:"))
                .and_then(|v| v.parse::<i64>().ok())
                .unwrap_or(0)
                .max(0)
        } else {
            0
        };
        let (before_ts, before_id) = parse_cursor(cursor);
        let mut where_parts = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        let mut joins = String::new();
        if let Some(ids) = account_ids.filter(|ids| !ids.is_empty()) {
            let mut slots = Vec::with_capacity(ids.len());
            for id in ids {
                slots.push(format!("?{}", values.len() + 1));
                values.push(Box::new(*id));
            }
            where_parts.push(format!("m.account_id IN ({})", slots.join(",")));
        } else if let Some(a) = account_id {
            where_parts.push(format!("m.account_id=?{}", values.len() + 1));
            values.push(Box::new(a));
        }
        match folder {
            Some("__SNOOZED") => {
                joins.push_str(" JOIN snoozes sz ON sz.message_id=m.id ");
                where_parts.push(format!("sz.until_ts>?{}", values.len() + 1));
                values.push(Box::new(Local::now().timestamp()));
            }
            Some("__SET_ASIDE") => {
                joins.push_str(" JOIN set_aside sa ON sa.message_id=m.id ");
            }
            Some("__SMART") => {
                where_parts.push("(m.unread=1 OR m.priority=1 OR m.pinned=1)".into());
            }
            Some("__SENT") => {
                where_parts.push("lower(m.folder)=lower(COALESCE((SELECT fr.folder FROM folder_roles fr WHERE fr.account_id=m.account_id AND fr.role='sent'),'Sent'))".into());
            }
            Some("__DRAFTS") => {
                where_parts.push("lower(m.folder)=lower(COALESCE((SELECT fr.folder FROM folder_roles fr WHERE fr.account_id=m.account_id AND fr.role='drafts'),'Drafts'))".into());
            }
            Some("__ARCHIVE") => {
                where_parts.push("lower(m.folder)=lower(COALESCE((SELECT fr.folder FROM folder_roles fr WHERE fr.account_id=m.account_id AND fr.role='archive'),'Archive'))".into());
            }
            Some("__JUNK") => {
                where_parts.push("lower(m.folder)=lower(COALESCE((SELECT fr.folder FROM folder_roles fr WHERE fr.account_id=m.account_id AND fr.role='junk'),'Junk'))".into());
            }
            Some("__TRASH") => {
                where_parts.push("lower(m.folder)=lower(COALESCE((SELECT fr.folder FROM folder_roles fr WHERE fr.account_id=m.account_id AND fr.role='trash'),'Trash'))".into());
            }
            Some(f) => {
                where_parts.push(format!("m.folder=?{}", values.len() + 1));
                values.push(Box::new(f.to_string()));
            }
            None => {}
        }
        if starred_only {
            where_parts.push("m.starred=1".into());
        }
        if !custom_sort && before_ts < i64::MAX {
            let n = values.len() + 1;
            where_parts.push(format!(
                "(m.date_ts<?{n} OR (m.date_ts=?{n} AND m.id<?{}))",
                n + 1
            ));
            values.push(Box::new(before_ts));
            values.push(Box::new(before_id));
        }
        if let Some(raw) = search.filter(|s| !s.trim().is_empty()) {
            let mut terms = Vec::new();
            for token in search_tokens(raw) {
                if token.starts_with("tcs-sort:") {
                    continue;
                }
                if let Some(v) = token.strip_prefix("from:") {
                    let n = values.len() + 1;
                    where_parts.push(format!(
                        "lower(m.from_email||' '||m.from_name) LIKE '%'||lower(?{n})||'%'"
                    ));
                    values.push(Box::new(v.to_string()));
                } else if let Some(v) = token.strip_prefix("to:") {
                    let n = values.len() + 1;
                    where_parts.push(format!(
                        "lower(m.to_text||' '||m.cc_text) LIKE '%'||lower(?{n})||'%'"
                    ));
                    values.push(Box::new(v.to_string()));
                } else if let Some(v) = token.strip_prefix("cc:") {
                    let n = values.len() + 1;
                    where_parts.push(format!("lower(m.cc_text) LIKE '%'||lower(?{n})||'%'"));
                    values.push(Box::new(v.to_string()));
                } else if let Some(v) = token.strip_prefix("subject:") {
                    let n = values.len() + 1;
                    where_parts.push(format!("lower(m.subject) LIKE '%'||lower(?{n})||'%'"));
                    values.push(Box::new(v.to_string()));
                } else if let Some(v) = token.strip_prefix("folder:") {
                    let n = values.len() + 1;
                    where_parts.push(format!("lower(m.folder)=lower(?{n})"));
                    values.push(Box::new(v.to_string()));
                } else if token == "is:unread" {
                    where_parts.push("m.unread=1".into());
                } else if token == "is:read" {
                    where_parts.push("m.unread=0".into());
                } else if token == "is:starred" {
                    where_parts.push("m.starred=1".into());
                } else if token == "is:pinned" {
                    where_parts.push("m.pinned=1".into());
                } else if token == "is:priority" {
                    where_parts.push("m.priority=1".into());
                } else if token == "is:spam" {
                    where_parts.push("m.spam=1".into());
                } else if token == "is:notspam" {
                    where_parts.push("m.spam=0".into());
                } else if token == "has:attachment" {
                    where_parts.push("m.has_attachments=1".into());
                } else if token == "has:noattachment" {
                    where_parts.push("m.has_attachments=0".into());
                } else if let Some(v) = token.strip_prefix("after:") {
                    if let Ok(d) = chrono::NaiveDate::parse_from_str(v, "%Y-%m-%d") {
                        if let Some(dt) = d.and_hms_opt(0, 0, 0) {
                            let n = values.len() + 1;
                            where_parts.push(format!("m.date_ts>=?{n}"));
                            values.push(Box::new(dt.and_utc().timestamp()));
                        }
                    }
                } else if let Some(v) = token.strip_prefix("before:") {
                    if let Ok(d) = chrono::NaiveDate::parse_from_str(v, "%Y-%m-%d") {
                        if let Some(dt) = d.and_hms_opt(0, 0, 0) {
                            let n = values.len() + 1;
                            where_parts.push(format!("m.date_ts<?{n}"));
                            values.push(Box::new(dt.and_utc().timestamp()));
                        }
                    }
                } else {
                    terms.push(token.to_string());
                }
            }
            if !terms.is_empty() {
                let n = values.len() + 1;
                where_parts.push(format!("lower(m.subject||' '||m.from_name||' '||m.from_email||' '||m.to_text||' '||m.cc_text||' '||m.snippet||' '||m.body_text) LIKE '%'||lower(?{n})||'%'") );
                values.push(Box::new(terms.join(" ")));
            }
        }
        let where_sql = if where_parts.is_empty() {
            String::new()
        } else {
            format!(" WHERE {}", where_parts.join(" AND "))
        };
        let sql = if custom_sort {
            format!("SELECT m.id,m.account_id,m.folder,m.uid,m.subject,m.from_name,m.from_email,m.date_ts,m.snippet,m.unread,m.starred,m.pinned,m.priority,m.spam,m.has_attachments,m.message_id,m.in_reply_to,m.references_text,length(m.body_text),m.to_text FROM messages m {joins}{where_sql} ORDER BY {sort_column} {sort_direction},m.id {sort_direction} LIMIT {} OFFSET {page_offset}",lim+1)
        } else {
            format!("SELECT m.id,m.account_id,m.folder,m.uid,m.subject,m.from_name,m.from_email,m.date_ts,m.snippet,m.unread,m.starred,m.pinned,m.priority,m.spam,m.has_attachments,m.message_id,m.in_reply_to,m.references_text,length(m.body_text),m.to_text FROM messages m {joins}{where_sql} ORDER BY m.pinned DESC,m.date_ts DESC,m.id DESC LIMIT {}",lim+1)
        };
        let refs: Vec<&dyn rusqlite::ToSql> = values.iter().map(|v| v.as_ref()).collect();
        let mut st = c.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = st
            .query_map(refs.as_slice(), |r| {
                Ok(MessageListItem {
                    id: r.get(0)?,
                    account_id: r.get(1)?,
                    folder: r.get(2)?,
                    uid: r.get::<_, i64>(3)? as u32,
                    subject: r.get(4)?,
                    from_name: r.get(5)?,
                    from_email: r.get(6)?,
                    to_text: r.get(19)?,
                    date_ts: r.get(7)?,
                    snippet: r.get(8)?,
                    unread: r.get::<_, i64>(9)? != 0,
                    starred: r.get::<_, i64>(10)? != 0,
                    pinned: r.get::<_, i64>(11)? != 0,
                    priority: r.get::<_, i64>(12)? != 0,
                    spam: r.get::<_, i64>(13)? != 0,
                    has_attachments: r.get::<_, i64>(14)? != 0,
                    smart_category: String::new(),
                    message_id: r.get(15)?,
                    in_reply_to: r.get(16)?,
                    references_text: r.get(17)?,
                    size_bytes: r.get(18)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut items: Vec<_> = rows.filter_map(Result::ok).collect();
        for item in &mut items {
            item.smart_category = smart_category_for(item);
        }
        let has_more = items.len() > lim as usize;
        if has_more {
            items.pop();
        }
        let next_cursor = if has_more {
            if custom_sort {
                Some(format!("o:{}", page_offset + lim))
            } else {
                items.last().map(|m| format!("{}:{}", m.date_ts, m.id))
            }
        } else {
            None
        };
        let total_sql = format!("SELECT COUNT(*) FROM messages m {joins}{where_sql}");
        let total: i64 = c
            .query_row(&total_sql, refs.as_slice(), |r| r.get(0))
            .unwrap_or(items.len() as i64);
        Ok(MessagePage {
            items,
            next_cursor,
            total,
        })
    }
    pub fn detail(&self, id: i64) -> Result<Option<MessageDetail>, String> {
        let _ = self.externalize_attachments(id);
        let c = self.conn()?;
        let mut row=c.query_row("SELECT m.id,m.account_id,m.folder,m.uid,m.subject,m.from_name,m.from_email,m.to_text,m.cc_text,m.date_ts,m.body_text,m.unread,m.starred,m.pinned,m.priority,m.spam,m.message_id,m.in_reply_to,m.references_text,COALESCE(x.body_html,''),COALESCE(x.attachments_json,'[]'),COALESCE(x.calendar_ics,'') FROM messages m LEFT JOIN message_extras x ON x.message_id=m.id WHERE m.id=?1",params![id],|r|{
            let raw:String=r.get(20)?; let infos:Vec<AttachmentInfo>=serde_json::from_str(&raw).unwrap_or_default(); let attachments=infos.into_iter().enumerate().map(|(index,a)|AttachmentMeta{index,filename:a.filename,mime_type:a.mime_type,size_hint:a.size_hint.or_else(||(!a.data_hex.is_empty()).then_some((a.data_hex.len()/2) as u64)),content_id:a.content_id}).collect();
            Ok(MessageDetail{id:r.get(0)?,account_id:r.get(1)?,folder:r.get(2)?,uid:r.get::<_,i64>(3)? as u32,subject:r.get(4)?,from_name:r.get(5)?,from_email:r.get(6)?,to_text:r.get(7)?,cc_text:r.get(8)?,date_ts:r.get(9)?,body_text:r.get(10)?,unread:r.get::<_,i64>(11)?!=0,starred:r.get::<_,i64>(12)?!=0,pinned:r.get::<_,i64>(13)?!=0,priority:r.get::<_,i64>(14)?!=0,spam:r.get::<_,i64>(15)?!=0,message_id:r.get(16)?,in_reply_to:r.get(17)?,references_text:r.get(18)?,body_html:r.get(19)?,attachments,calendar_ics:r.get(21)?})
        }).optional().map_err(|e|e.to_string())?;
        if let Some(detail) = row.as_mut() {
            let mut stmt=c.prepare("SELECT attachment_index,filename,mime_type,size,content_id FROM attachment_cache_v2 WHERE message_id=?1 ORDER BY attachment_index").map_err(|e|e.to_string())?;
            let cached = stmt
                .query_map(params![id], |r| {
                    Ok(AttachmentMeta {
                        index: r.get::<_, i64>(0)? as usize,
                        filename: r.get(1)?,
                        mime_type: r.get(2)?,
                        size_hint: Some(r.get::<_, i64>(3)? as u64),
                        content_id: r.get(4)?,
                    })
                })
                .map_err(|e| e.to_string())?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| e.to_string())?;
            if !cached.is_empty() {
                detail.attachments = cached;
            }
        }
        Ok(row)
    }
    pub fn externalize_attachments(&self, message_id: i64) -> Result<(), String> {
        let conn = self.conn()?;
        let raw: Option<String> = conn
            .query_row(
                "SELECT attachments_json FROM message_extras WHERE message_id=?1",
                params![message_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some(raw) = raw else {
            return Ok(());
        };
        let mut infos: Vec<AttachmentInfo> = serde_json::from_str(&raw).unwrap_or_default();
        if infos.is_empty() || infos.iter().all(|item| item.data_hex.is_empty()) {
            return Ok(());
        }
        let cache_dir = self
            .path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("cache")
            .join("attachments")
            .join(message_id.to_string());
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        for (index, info) in infos.iter_mut().enumerate() {
            if info.data_hex.is_empty() {
                continue;
            }
            if info.data_hex.len() % 2 != 0 {
                return Err("Anexo recebido corrompido".into());
            }
            let mut bytes = Vec::with_capacity(info.data_hex.len() / 2);
            for pair in info.data_hex.as_bytes().chunks_exact(2) {
                let value = std::str::from_utf8(pair).map_err(|e| e.to_string())?;
                bytes.push(u8::from_str_radix(value, 16).map_err(|e| e.to_string())?);
            }
            let safe_name = format!("{:04}.bin", index);
            let path = cache_dir.join(safe_name);
            fs::write(&path, &bytes).map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO attachment_cache_v2(message_id,attachment_index,filename,mime_type,content_id,size,cache_path,last_access_ts) VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(message_id,attachment_index) DO UPDATE SET filename=excluded.filename,mime_type=excluded.mime_type,content_id=excluded.content_id,size=excluded.size,cache_path=excluded.cache_path,last_access_ts=excluded.last_access_ts",
                params![message_id,index as i64,info.filename,info.mime_type,info.content_id,bytes.len() as i64,path.display().to_string(),Local::now().timestamp()],
            ).map_err(|e| e.to_string())?;
            info.data_hex.clear();
        }
        tx.execute(
            "UPDATE message_extras SET attachments_json=?2 WHERE message_id=?1",
            params![
                message_id,
                serde_json::to_string(&infos).map_err(|e| e.to_string())?
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn cache_attachment_bytes(
        &self,
        message_id: i64,
        index: usize,
        info: &AttachmentInfo,
        bytes: &[u8],
    ) -> Result<(), String> {
        let cache_dir = self
            .path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("cache")
            .join("attachments")
            .join(message_id.to_string());
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
        let path = cache_dir.join(format!("{:04}.bin", index));
        fs::write(&path, bytes).map_err(|e| e.to_string())?;
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO attachment_cache_v2(message_id,attachment_index,filename,mime_type,content_id,size,cache_path,last_access_ts) VALUES(?1,?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(message_id,attachment_index) DO UPDATE SET filename=excluded.filename,mime_type=excluded.mime_type,content_id=excluded.content_id,size=excluded.size,cache_path=excluded.cache_path,last_access_ts=excluded.last_access_ts",
            params![message_id,index as i64,info.filename,info.mime_type,info.content_id,bytes.len() as i64,path.display().to_string(),Local::now().timestamp()],
        ).map_err(|e|e.to_string())?;
        Ok(())
    }

    /// Persist a remotely fetched attachment only if the message identity and
    /// MIME part still match. The SQLite IMMEDIATE transaction prevents a move,
    /// deletion or MIME rewrite from slipping between verification and commit.
    /// A unique cache filename keeps preexisting cached bytes intact if a
    /// transaction fails or concurrent downloads target the same index.
    pub fn cache_attachment_bytes_if_current(
        &self,
        identity: AttachmentCacheIdentity<'_>,
        info: &AttachmentInfo,
        bytes: &[u8],
    ) -> Result<(), String> {
        if identity.uid == 0 || identity.folder.trim().is_empty() {
            return Err("Identidade IMAP inválida para cache de anexo".into());
        }
        let mut conn = self.conn()?;
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        if let Some(expected) = identity.uid_validity {
            let current = tx
                .query_row(
                    "SELECT uid_validity FROM mailbox_sync_v2 WHERE account_id=?1 AND folder=?2",
                    params![identity.account_id, identity.folder],
                    |row| row.get::<_, Option<i64>>(0),
                )
                .optional()
                .map_err(|e| e.to_string())?
                .flatten();
            if expected == 0 || current != Some(i64::from(expected)) {
                return Err("UIDVALIDITY alterado durante o download; cache descartado".into());
            }
        }
        let actual: Option<(i64, String, i64, String)> = tx
            .query_row(
                "SELECT m.account_id,m.folder,m.uid,COALESCE(x.attachments_json,'[]') \
             FROM messages m LEFT JOIN message_extras x ON x.message_id=m.id WHERE m.id=?1",
                params![identity.message_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some((account, folder, uid, raw_parts)) = actual else {
            return Err("Mensagem removida antes de armazenar anexo".into());
        };
        let parts: Vec<AttachmentInfo> = serde_json::from_str(&raw_parts)
            .map_err(|e| format!("Metadados MIME inválidos: {e}"))?;
        let matching = parts.get(identity.index).is_some_and(|part| {
            !part.part_id.trim().is_empty()
                && part.part_id == info.part_id
                && part.filename == info.filename
                && part.mime_type == info.mime_type
                && part.content_id == info.content_id
        });
        if account != identity.account_id
            || folder != identity.folder
            || uid != i64::from(identity.uid)
            || !matching
        {
            return Err("Mensagem ou parte MIME alterada; cache descartado".into());
        }
        let cache_dir = self
            .path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("cache")
            .join("attachments")
            .join(identity.message_id.to_string());
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
        let path = cache_dir.join(format!(
            "{:04}-{}.bin",
            identity.index,
            uuid::Uuid::new_v4()
        ));
        fs::write(&path, bytes).map_err(|e| e.to_string())?;
        let result = tx.execute(
            "INSERT INTO attachment_cache_v2(message_id,attachment_index,filename,mime_type,content_id,size,cache_path,last_access_ts) \
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8) \
             ON CONFLICT(message_id,attachment_index) DO UPDATE SET \
             filename=excluded.filename,mime_type=excluded.mime_type,content_id=excluded.content_id, \
             size=excluded.size,cache_path=excluded.cache_path,last_access_ts=excluded.last_access_ts",
            params![identity.message_id,identity.index as i64,info.filename,info.mime_type,info.content_id,
                bytes.len() as i64,path.display().to_string(),Local::now().timestamp()],
        ).map_err(|e|e.to_string()).and_then(|_|tx.commit().map_err(|e|e.to_string()));
        if result.is_err() {
            let _ = fs::remove_file(&path);
        }
        result
    }

    pub fn attachment_path(
        &self,
        message_id: i64,
        index: usize,
    ) -> Result<Option<(String, String, u64, PathBuf)>, String> {
        self.externalize_attachments(message_id)?;
        let conn = self.conn()?;
        let row = conn.query_row(
            "SELECT filename,mime_type,size,cache_path FROM attachment_cache_v2 WHERE message_id=?1 AND attachment_index=?2",
            params![message_id,index as i64],
            |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,i64>(2)? as u64,PathBuf::from(r.get::<_,String>(3)?))),
        ).optional().map_err(|e| e.to_string())?;
        if row.is_some() {
            let _ = conn.execute("UPDATE attachment_cache_v2 SET last_access_ts=?3 WHERE message_id=?1 AND attachment_index=?2", params![message_id,index as i64,Local::now().timestamp()]);
        }
        Ok(row)
    }

    pub fn prune_attachment_cache(&self, max_bytes: u64) -> Result<u64, String> {
        let conn = self.conn()?;
        let total: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(size),0) FROM attachment_cache_v2",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if total as u64 <= max_bytes {
            return Ok(total as u64);
        }
        let mut current = total as u64;
        let mut stmt = conn.prepare("SELECT message_id,attachment_index,size,cache_path FROM attachment_cache_v2 ORDER BY last_access_ts ASC").map_err(|e|e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, i64>(2)? as u64,
                    r.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let entries: Vec<_> = rows.filter_map(Result::ok).collect();
        drop(stmt);
        for (message_id, index, size, path) in entries {
            if current <= max_bytes {
                break;
            }
            let _ = fs::remove_file(path);
            conn.execute(
                "DELETE FROM attachment_cache_v2 WHERE message_id=?1 AND attachment_index=?2",
                params![message_id, index],
            )
            .map_err(|e| e.to_string())?;
            current = current.saturating_sub(size);
        }
        Ok(current)
    }

    pub fn local_folder_uid_rows(
        &self,
        account_id: i64,
        folder: &str,
    ) -> Result<Vec<(i64, u32, bool, bool)>, String> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare("SELECT id,uid,unread,starred FROM messages WHERE account_id=?1 AND folder=?2 AND uid>0")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![account_id, folder], |r| {
                Ok((
                    r.get(0)?,
                    r.get::<_, i64>(1)? as u32,
                    r.get::<_, i64>(2)? != 0,
                    r.get::<_, i64>(3)? != 0,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())
    }

    pub fn apply_remote_flag_state(
        &self,
        updates: &[(i64, bool, bool)],
        removed_ids: &[i64],
    ) -> Result<(), String> {
        let mut conn = self.conn()?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for (id, unread, starred) in updates {
            tx.execute(
                "UPDATE messages SET unread=?2,starred=?3 WHERE id=?1 AND uid>0",
                params![id, *unread as i64, *starred as i64],
            )
            .map_err(|e| e.to_string())?;
        }
        for id in removed_ids {
            tx.execute("INSERT INTO messages_fts(messages_fts,rowid,subject,from_name,from_email,to_text,cc_text,snippet,body_text) SELECT 'delete',id,subject,from_name,from_email,to_text,cc_text,snippet,body_text FROM messages WHERE id=?1 AND uid>0", params![id])
                .map_err(|e| e.to_string())?;
            tx.execute("DELETE FROM messages WHERE id=?1 AND uid>0", params![id])
                .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Apply a reconciled snapshot only if its mailbox checkpoint and every
    /// local identity still match, in the same transaction as the writes.
    pub fn commit_guarded_reconcile(
        &self,
        account_id: i64,
        folder: &str,
        expected: SyncBatchCheckpoint,
        updates: &[(i64, u32, bool, bool)],
        removed: &[(i64, u32)],
        timestamp: i64,
    ) -> Result<(), String> {
        if expected.uid_validity.is_none() || expected.uid_validity == Some(0) {
            return Err("UIDVALIDITY inválido na reconciliação".into());
        }
        let mut conn = self.conn()?;
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let actual = tx.query_row(
            "SELECT uid_validity, highest_seen_uid, oldest_synced_uid, backfill_complete FROM mailbox_sync_v2 WHERE account_id=?1 AND folder=?2",
            params![account_id, folder], |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, i64>(1)?, row.get::<_, Option<i64>>(2)?, row.get::<_, i64>(3)? != 0)),
        ).optional().map_err(|e| e.to_string())?;
        let expected_tuple = (
            expected.uid_validity.map(i64::from),
            i64::from(expected.highest),
            expected.oldest.map(i64::from),
            expected.complete,
        );
        if actual != Some(expected_tuple) {
            return Err("Checkpoint local mudou durante a reconciliação".into());
        }
        for (id, uid, unread, starred) in updates {
            let changed = tx.execute("UPDATE messages SET unread=?5,starred=?6 WHERE id=?1 AND account_id=?2 AND folder=?3 AND uid=?4 AND uid>0",
                params![id, account_id, folder, uid, *unread as i64, *starred as i64]).map_err(|e| e.to_string())?;
            if changed != 1 {
                return Err("Identidade local mudou durante a reconciliação".into());
            }
        }
        for (id, uid) in removed {
            let indexed = tx.execute("INSERT INTO messages_fts(messages_fts,rowid,subject,from_name,from_email,to_text,cc_text,snippet,body_text) SELECT 'delete',id,subject,from_name,from_email,to_text,cc_text,snippet,body_text FROM messages WHERE id=?1 AND account_id=?2 AND folder=?3 AND uid=?4 AND uid>0",
                params![id, account_id, folder, uid]).map_err(|e| e.to_string())?;
            if indexed != 1 {
                return Err("Identidade local mudou durante a reconciliação".into());
            }
            let changed = tx.execute("DELETE FROM messages WHERE id=?1 AND account_id=?2 AND folder=?3 AND uid=?4 AND uid>0",
                params![id, account_id, folder, uid]).map_err(|e| e.to_string())?;
            if changed != 1 {
                return Err("Identidade local mudou durante a reconciliação".into());
            }
        }
        tx.execute(
            "UPDATE mailbox_sync_v2 SET last_reconcile_ts=?3 WHERE account_id=?1 AND folder=?2",
            params![account_id, folder, timestamp],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn last_reconcile_ts(&self, account_id: i64, folder: &str) -> Result<i64, String> {
        let conn = self.conn()?;
        conn.query_row(
            "SELECT last_reconcile_ts FROM mailbox_sync_v2 WHERE account_id=?1 AND folder=?2",
            params![account_id, folder],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())
        .map(|v| v.unwrap_or(0))
    }

    pub fn mark_reconciled(&self, account_id: i64, folder: &str, ts: i64) -> Result<(), String> {
        self.conn()?
            .execute(
                "UPDATE mailbox_sync_v2 SET last_reconcile_ts=?3 WHERE account_id=?1 AND folder=?2",
                params![account_id, folder, ts],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn sync_state(
        &self,
        account_id: i64,
        folder: &str,
    ) -> Result<(Option<u32>, u32, Option<u32>, bool), String> {
        let c = self.conn()?;
        Ok(c.query_row("SELECT uid_validity,highest_seen_uid,oldest_synced_uid,backfill_complete FROM mailbox_sync_v2 WHERE account_id=?1 AND folder=?2",params![account_id,folder],|r|Ok((r.get::<_,Option<i64>>(0)?.map(|v|v as u32),r.get::<_,i64>(1)? as u32,r.get::<_,Option<i64>>(2)?.map(|v|v as u32),r.get::<_,i64>(3)?!=0))).optional().map_err(|e|e.to_string())?.unwrap_or((None,0,None,false)))
    }
    /// Atomic unit of persistence for a completed IMAP header batch.
    /// Message rows, FTS rows, extras, contacts and cursor commit together.
    /// An error rolls back the entire batch and the cursor remains unchanged.
    pub fn commit_sync_batch(
        &self,
        account_id: i64,
        folder: &str,
        messages: &[crate::models::MessageSummary],
        checkpoint: SyncBatchCheckpoint,
    ) -> Result<(), String> {
        self.commit_sync_batch_with_uid_reset(account_id, folder, messages, checkpoint, false)
    }

    /// Atomically invalidate stale UIDs and persist the replacement batch and
    /// checkpoint. A SQLite failure restores the original UIDs and cursor.
    pub fn commit_sync_batch_with_uid_reset(
        &self,
        account_id: i64,
        folder: &str,
        messages: &[crate::models::MessageSummary],
        checkpoint: SyncBatchCheckpoint,
        reset_uid_mapping: bool,
    ) -> Result<(), String> {
        self.commit_sync_batch_internal(
            account_id,
            folder,
            messages,
            checkpoint,
            reset_uid_mapping,
            None,
        )
    }

    /// Commit only if the mailbox checkpoint still matches the network request's snapshot.
    pub fn commit_guarded_sync_batch(
        &self,
        account_id: i64,
        folder: &str,
        messages: &[crate::models::MessageSummary],
        checkpoint: SyncBatchCheckpoint,
        reset_uid_mapping: bool,
        expected_checkpoint: SyncBatchCheckpoint,
    ) -> Result<(), String> {
        self.commit_sync_batch_internal(
            account_id,
            folder,
            messages,
            checkpoint,
            reset_uid_mapping,
            Some(expected_checkpoint),
        )
    }

    fn commit_sync_batch_internal(
        &self,
        account_id: i64,
        folder: &str,
        messages: &[crate::models::MessageSummary],
        checkpoint: SyncBatchCheckpoint,
        reset_uid_mapping: bool,
        expected_checkpoint: Option<SyncBatchCheckpoint>,
    ) -> Result<(), String> {
        let SyncBatchCheckpoint {
            uid_validity,
            highest,
            oldest,
            complete,
        } = checkpoint;
        if account_id <= 0 || folder.trim().is_empty() {
            return Err("Identificador de conta ou pasta inválido".into());
        }
        if messages
            .iter()
            .any(|m| m.account_id != account_id || m.folder != folder || m.uid == 0)
        {
            return Err("Lote IMAP contém mensagem de outra conta/pasta ou UID zero".into());
        }
        if messages.iter().any(|m| m.uid > highest) {
            return Err("Cursor inferior a UID persistido".into());
        }
        let mut conn = self.conn()?;
        let tx = conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        if let Some(expected) = expected_checkpoint {
            if uid_validity.is_none() || uid_validity == Some(0) {
                return Err("UIDVALIDITY remota inválida no lote IMAP".into());
            }
            let has_orphaned_uids: bool = if expected.uid_validity.is_none() {
                tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM messages WHERE account_id=?1 AND folder=?2 AND uid>0)",
                    params![account_id, folder],
                    |row| row.get(0),
                ).map_err(|e| e.to_string())?
            } else {
                false
            };
            let reset_required = expected
                .uid_validity
                .is_some_and(|v| Some(v) != uid_validity)
                || has_orphaned_uids;
            if expected.uid_validity == Some(0) || reset_uid_mapping != reset_required {
                return Err("Troca de UIDVALIDITY incompatível com o reset solicitado".into());
            }
            let actual = tx
                .query_row(
                    "SELECT uid_validity, highest_seen_uid, oldest_synced_uid, backfill_complete FROM mailbox_sync_v2 WHERE account_id=?1 AND folder=?2",
                    params![account_id, folder],
                    |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, i64>(1)?, row.get::<_, Option<i64>>(2)?, row.get::<_, i64>(3)? != 0)),
                )
                .optional()
                .map_err(|e| e.to_string())?.unwrap_or((None, 0, None, false));
            if actual
                != (
                    expected.uid_validity.map(i64::from),
                    i64::from(expected.highest),
                    expected.oldest.map(i64::from),
                    expected.complete,
                )
            {
                return Err("Checkpoint local mudou durante a sincronização".into());
            }
            if expected.uid_validity.is_none() && !reset_uid_mapping {
                let has_live_uids: bool = tx.query_row(
                    "SELECT EXISTS(SELECT 1 FROM messages WHERE account_id=?1 AND folder=?2 AND uid>0)",
                    params![account_id, folder], |row| row.get(0),
                ).map_err(|e| e.to_string())?;
                if has_live_uids {
                    return Err(
                        "Mensagens locais sem UIDVALIDITY; recuperação segura necessária".into(),
                    );
                }
            }
        }
        if reset_uid_mapping {
            // Preserve local IDs and content; do not expose an intermediate
            // reset state outside this transaction.
            tx.execute(
                "UPDATE messages SET uid=-id WHERE account_id=?1 AND folder=?2",
                params![account_id, folder],
            )
            .map_err(|e| e.to_string())?;
        }
        for message in messages {
            Database::upsert_message_in_tx(&tx, message).map_err(|e| e.to_string())?;
        }
        tx.execute(
            "INSERT INTO mailbox_sync_v2(account_id,folder,uid_validity,highest_seen_uid,oldest_synced_uid,backfill_complete,last_reconcile_ts) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(account_id,folder) DO UPDATE SET uid_validity=excluded.uid_validity,highest_seen_uid=excluded.highest_seen_uid,oldest_synced_uid=excluded.oldest_synced_uid,backfill_complete=excluded.backfill_complete,last_reconcile_ts=excluded.last_reconcile_ts",
            params![account_id,folder,uid_validity.map(i64::from),i64::from(highest),oldest.map(i64::from),complete as i64,Local::now().timestamp()],
        ).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())
    }

    pub fn save_sync_state(
        &self,
        account_id: i64,
        folder: &str,
        uid_validity: Option<u32>,
        highest: u32,
        oldest: Option<u32>,
        complete: bool,
    ) -> Result<(), String> {
        self.conn()?.execute("INSERT INTO mailbox_sync_v2(account_id,folder,uid_validity,highest_seen_uid,oldest_synced_uid,backfill_complete,last_reconcile_ts) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(account_id,folder) DO UPDATE SET uid_validity=excluded.uid_validity,highest_seen_uid=excluded.highest_seen_uid,oldest_synced_uid=excluded.oldest_synced_uid,backfill_complete=excluded.backfill_complete,last_reconcile_ts=excluded.last_reconcile_ts",params![account_id,folder,uid_validity.map(|v|v as i64),highest as i64,oldest.map(|v|v as i64),complete as i64,Local::now().timestamp()]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn reset_uid_mapping_preserve_messages(
        &self,
        account_id: i64,
        folder: &str,
    ) -> Result<(), String> {
        let mut conn = self.conn()?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        // UID values are scoped to UIDVALIDITY. Keep the local row identity and
        // productivity metadata, but mark every old UID as stale using a unique
        // negative value. The next metadata sync can remap the same Message-ID
        // onto its existing local row instead of deleting/recreating it.
        tx.execute(
            "UPDATE messages SET uid=-id WHERE account_id=?1 AND folder=?2",
            params![account_id, folder],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO mailbox_sync_v2(account_id,folder,highest_seen_uid,backfill_complete,last_reconcile_ts) VALUES(?1,?2,0,0,0) ON CONFLICT(account_id,folder) DO UPDATE SET uid_validity=NULL,highest_seen_uid=0,oldest_synced_uid=NULL,backfill_complete=0,highest_modseq=NULL,last_reconcile_ts=0",
            params![account_id, folder],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }
}
fn smart_category_for(item: &MessageListItem) -> String {
    if item.priority || item.pinned {
        return "Prioridade".into();
    }
    let hay = format!(
        "{} {} {} {}",
        item.from_email, item.from_name, item.subject, item.snippet
    )
    .to_ascii_lowercase();
    if [
        "invoice",
        "fatura",
        "boleto",
        "receipt",
        "recibo",
        "payment",
        "pagamento",
        "pix",
        "pedido",
        "order #",
        "compra aprovada",
        "nota fiscal",
        "nf-e",
    ]
    .iter()
    .any(|needle| hay.contains(needle))
    {
        return "Transações".into();
    }
    if [
        "newsletter",
        "digest",
        "boletim",
        "unsubscribe",
        "mailchimp",
        "substack",
        "promoção",
        "promocao",
        "oferta",
        "sale",
        "marketing",
    ]
    .iter()
    .any(|needle| hay.contains(needle))
    {
        return "Newsletters".into();
    }
    if [
        "linkedin",
        "facebook",
        "instagram",
        "threads",
        "tiktok",
        "social",
        "seguindo você",
        "following you",
    ]
    .iter()
    .any(|needle| hay.contains(needle))
    {
        return "Social".into();
    }
    if [
        "no-reply",
        "noreply",
        "notification",
        "notify",
        "alert",
        "aviso",
        "status",
        "security alert",
        "login",
        "acesso",
        "verification",
        "verificação",
        "update",
        "atualização",
    ]
    .iter()
    .any(|needle| hay.contains(needle))
    {
        return "Atualizações".into();
    }
    if item.unread {
        return "Precisa de você".into();
    }
    "Pessoas".into()
}
fn parse_cursor(cursor: Option<&str>) -> (i64, i64) {
    cursor
        .and_then(|v| {
            let mut p = v.split(':');
            Some((p.next()?.parse().ok()?, p.next()?.parse().ok()?))
        })
        .unwrap_or((i64::MAX, i64::MAX))
}

fn column_exists(c: &Connection, table: &str, col: &str) -> rusqlite::Result<bool> {
    let mut st = c.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = st.query_map([], |r| r.get::<_, String>(1))?;
    for r in rows {
        if r? == col {
            return Ok(true);
        }
    }
    Ok(false)
}

#[cfg(test)]
mod regression_tests {
    use super::*;
    use crate::models::{Account, AttachmentInfo, MessageSummary};
    use chrono::Local;

    fn temp_store(name: &str) -> (CoreStore, PathBuf) {
        let path =
            std::env::temp_dir().join(format!("tcs-mail-{name}-{}.db", uuid::Uuid::new_v4()));
        let store = CoreStore::open(&path).expect("open temporary store");
        (store, path)
    }

    fn account(db: &Database) -> i64 {
        db.save_account(&Account {
            id: 0,
            name: "Teste".into(),
            email: "test@example.invalid".into(),
            imap_host: "imap.example.invalid".into(),
            imap_port: 993,
            smtp_host: "smtp.example.invalid".into(),
            smtp_port: 465,
            username: "test@example.invalid".into(),
            use_tls: true,
            imap_security: "tls".into(),
            smtp_security: "tls".into(),
            auth_method: "password".into(),
            oauth_provider: String::new(),
            default_signature_id: None,
            color: "#3584e4".into(),
        })
        .expect("save account")
    }

    fn message(account_id: i64, uid: u32, hydrated: bool) -> MessageSummary {
        MessageSummary {
            id: 0,
            account_id,
            folder: "INBOX".into(),
            uid,
            subject: "Contrato UIDVALIDITY".into(),
            from_name: "Alice".into(),
            from_email: "alice@example.invalid".into(),
            to_text: "test@example.invalid".into(),
            cc_text: String::new(),
            date: Local::now(),
            snippet: if hydrated {
                "Trecho preservado".into()
            } else {
                String::new()
            },
            body_text: if hydrated {
                "Corpo texto preservado".into()
            } else {
                String::new()
            },
            body_html: if hydrated {
                "<p>Corpo HTML preservado</p>".into()
            } else {
                String::new()
            },
            attachments: if hydrated {
                vec![AttachmentInfo {
                    filename: "arquivo.txt".into(),
                    mime_type: "text/plain".into(),
                    data_hex: "6f6b".into(),
                    content_id: String::new(),
                    part_id: "1".into(),
                    size_hint: Some(2),
                }]
            } else {
                Vec::new()
            },
            calendar_ics: String::new(),
            unread: true,
            starred: false,
            spam: false,
            message_id: "<stable@example.invalid>".into(),
            in_reply_to: String::new(),
            references_text: String::new(),
            has_attachments: hydrated,
            pinned: true,
            priority: true,
        }
    }

    fn cleanup(path: &Path) {
        let _ = fs::remove_file(path);
        let _ = fs::remove_file(format!("{}-wal", path.display()));
        let _ = fs::remove_file(format!("{}-shm", path.display()));
        if let Some(parent) = path.parent() {
            let cache = parent.join("cache").join("attachments");
            // Tests use globally shared temp directories; only remove a concrete
            // message subtree through DB cleanup rather than the whole cache root.
            let _ = cache;
        }
    }

    #[test]
    fn guarded_flags_preserve_other_fields_and_reject_stale_epoch() {
        let directory =
            std::env::temp_dir().join(format!("tcs-flags-epoch-{}", uuid::Uuid::new_v4()));
        let path = directory.join("test.db");
        let store = CoreStore::open(&path).unwrap();
        let db = store.legacy().unwrap();
        let account_id = account(&db);
        db.upsert_message(&message(account_id, 42, true)).unwrap();
        let item = db
            .list_messages(Some(account_id), "INBOX", None, 10)
            .unwrap()
            .pop()
            .unwrap();
        let identity = || HydrationIdentity {
            message_id: item.id,
            account_id,
            folder: "INBOX",
            uid: 42,
            uid_validity: 71,
        };
        store
            .save_sync_state(account_id, "INBOX", Some(72), 42, Some(42), false)
            .unwrap();
        assert!(store
            .set_flags_if_current(identity(), Some(true), None, None, Some(false))
            .is_err());
        assert!(db.get_message(item.id).unwrap().unwrap().unread);
        store
            .save_sync_state(account_id, "INBOX", Some(71), 42, Some(42), false)
            .unwrap();
        store
            .set_flags_if_current(identity(), Some(true), None, None, Some(false))
            .unwrap();
        let updated = db.get_message(item.id).unwrap().unwrap();
        assert!(updated.starred && !updated.unread && updated.pinned && updated.priority);
        cleanup(&path);
    }

    #[test]
    fn guarded_message_removal_checks_epoch_and_keeps_fts_consistent() {
        let directory =
            std::env::temp_dir().join(format!("tcs-delete-epoch-{}", uuid::Uuid::new_v4()));
        let path = directory.join("test.db");
        let store = CoreStore::open(&path).unwrap();
        let db = store.legacy().unwrap();
        let account_id = account(&db);
        db.upsert_message(&message(account_id, 42, true)).unwrap();
        let item = db
            .list_messages(Some(account_id), "INBOX", None, 10)
            .unwrap()
            .pop()
            .unwrap();
        let identity = || HydrationIdentity {
            message_id: item.id,
            account_id,
            folder: "INBOX",
            uid: 42,
            uid_validity: 71,
        };
        assert!(store.remove_message_if_current(identity()).is_err());
        store
            .save_sync_state(account_id, "INBOX", Some(72), 42, Some(42), false)
            .unwrap();
        assert!(store.remove_message_if_current(identity()).is_err());
        assert!(db.get_message(item.id).unwrap().is_some());
        store
            .save_sync_state(account_id, "INBOX", Some(71), 42, Some(42), false)
            .unwrap();
        store.conn().unwrap().execute_batch("CREATE TRIGGER reject_guarded_delete BEFORE DELETE ON messages BEGIN SELECT RAISE(ABORT,'simulated failure'); END;").unwrap();
        assert!(store.remove_message_if_current(identity()).is_err());
        assert!(db.get_message(item.id).unwrap().is_some());
        store
            .conn()
            .unwrap()
            .execute(
                "INSERT INTO messages_fts(messages_fts,rank) VALUES('integrity-check',1)",
                [],
            )
            .unwrap();
        store
            .conn()
            .unwrap()
            .execute_batch("DROP TRIGGER reject_guarded_delete")
            .unwrap();
        store.remove_message_if_current(identity()).unwrap();
        assert!(db.get_message(item.id).unwrap().is_none());
        let conn = store.conn().unwrap();
        conn.execute(
            "INSERT INTO messages_fts(messages_fts,rank) VALUES('integrity-check',1)",
            [],
        )
        .unwrap();
        let hits: i64 = conn
            .query_row(
                "SELECT count(*) FROM messages_fts WHERE messages_fts MATCH 'Contrato'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(hits, 0);
        drop(conn);
        cleanup(&path);
    }

    #[test]
    fn attachment_cache_rejects_changed_uidvalidity_in_transaction() {
        let directory =
            std::env::temp_dir().join(format!("tcs-cache-epoch-{}", uuid::Uuid::new_v4()));
        let path = directory.join("test.db");
        let store = CoreStore::open(&path).unwrap();
        let db = store.legacy().unwrap();
        let account_id = account(&db);
        let mut item = message(account_id, 42, true);
        item.attachments[0].data_hex.clear();
        db.upsert_message(&item).unwrap();
        let item = db
            .list_messages(Some(account_id), "INBOX", None, 10)
            .unwrap()
            .pop()
            .unwrap();
        let identity = || AttachmentCacheIdentity {
            message_id: item.id,
            index: 0,
            account_id,
            folder: "INBOX",
            uid: 42,
            uid_validity: Some(71),
        };
        assert!(store
            .cache_attachment_bytes_if_current(identity(), &item.attachments[0], b"new")
            .is_err());
        store
            .save_sync_state(account_id, "INBOX", Some(71), 42, Some(42), false)
            .unwrap();
        store
            .cache_attachment_bytes_if_current(identity(), &item.attachments[0], b"original")
            .unwrap();
        let cached: String = store.conn().unwrap().query_row(
            "SELECT cache_path FROM attachment_cache_v2 WHERE message_id=?1 AND attachment_index=0",
            params![item.id], |row| row.get(0),
        ).unwrap();
        store
            .save_sync_state(account_id, "INBOX", Some(72), 42, Some(42), false)
            .unwrap();
        assert!(store
            .cache_attachment_bytes_if_current(identity(), &item.attachments[0], b"wrong epoch")
            .is_err());
        assert_eq!(fs::read(&cached).unwrap(), b"original");
        drop(db);
        drop(store);
        fs::remove_file(&cached).unwrap();
        fs::remove_dir(
            directory
                .join("cache/attachments")
                .join(item.id.to_string()),
        )
        .unwrap();
        fs::remove_dir(directory.join("cache/attachments")).unwrap();
        fs::remove_dir(directory.join("cache")).unwrap();
        cleanup(&path);
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn hydration_checks_identity_and_epoch_atomically_and_preserves_flags() {
        let (store, path) = temp_store("hydrate-atomic");
        let db = store.legacy().unwrap();
        let account_id = account(&db);
        db.upsert_message(&message(account_id, 42, false)).unwrap();
        let id = db
            .list_messages(Some(account_id), "INBOX", None, 10)
            .unwrap()[0]
            .id;
        let identity = || HydrationIdentity {
            message_id: id,
            account_id,
            folder: "INBOX",
            uid: 42,
            uid_validity: 71,
        };
        let content = || crate::mail::LazyMessageContent {
            body_text: "conteudo atomico".into(),
            body_html: String::new(),
            calendar_ics: String::new(),
            attachments: Vec::new(),
        };
        assert!(store
            .commit_hydration_if_current(identity(), content())
            .is_err());
        store
            .save_sync_state(account_id, "INBOX", Some(71), 42, Some(42), false)
            .unwrap();
        let conn = store.conn().unwrap();
        conn.execute("UPDATE messages SET uid=43 WHERE id=?1", params![id])
            .unwrap();
        assert!(store
            .commit_hydration_if_current(identity(), content())
            .is_err());
        conn.execute("UPDATE messages SET uid=42 WHERE id=?1", params![id])
            .unwrap();
        conn.execute(
            "UPDATE message_extras SET attachments_json='invalid' WHERE message_id=?1",
            params![id],
        )
        .unwrap();
        assert!(store
            .commit_hydration_if_current(identity(), content())
            .is_err());
        let raw: String = conn
            .query_row(
                "SELECT attachments_json FROM message_extras WHERE message_id=?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(raw, "invalid");
        conn.execute(
            "UPDATE message_extras SET attachments_json='[]' WHERE message_id=?1",
            params![id],
        )
        .unwrap();
        drop(conn);
        db.set_message_flags(id, Some(true), None, None, Some(false))
            .unwrap();
        store
            .commit_hydration_if_current(identity(), content())
            .unwrap();
        let hydrated = db.get_message(id).unwrap().unwrap();
        assert_eq!(hydrated.body_text, "conteudo atomico");
        assert!(hydrated.starred);
        assert!(!hydrated.unread);
        assert_eq!(
            db.list_messages(Some(account_id), "INBOX", Some("atomico"), 10)
                .unwrap()
                .len(),
            1
        );
        store
            .save_sync_state(account_id, "INBOX", Some(72), 42, Some(42), false)
            .unwrap();
        assert!(store
            .commit_hydration_if_current(identity(), content())
            .is_err());
        assert_eq!(
            db.get_message(id).unwrap().unwrap().body_text,
            "conteudo atomico"
        );
        drop(db);
        drop(store);
        cleanup(&path);
    }

    #[test]
    fn uidvalidity_reset_preserves_local_identity_and_hydrated_content() {
        let (store, path) = temp_store("uidvalidity-preserve");
        let db = store.legacy().expect("legacy database handle");
        let account_id = account(&db);
        db.upsert_message(&message(account_id, 77, true))
            .expect("insert hydrated message");
        let before = db
            .list_messages(Some(account_id), "INBOX", None, 10)
            .expect("list before")
            .pop()
            .expect("message before");
        let stable_id = before.id;

        store
            .reset_uid_mapping_preserve_messages(account_id, "INBOX")
            .expect("reset UID mapping");
        assert!(store
            .local_folder_uid_rows(account_id, "INBOX")
            .unwrap()
            .is_empty());
        // A stale reconciliation list must not mutate or remove an invalidated UID.
        store
            .apply_remote_flag_state(&[(stable_id, false, false)], &[stable_id])
            .unwrap();
        let stale = db
            .get_message(stable_id)
            .unwrap()
            .expect("stale message preserved");
        assert!(stale.unread);
        assert_eq!(stale.body_text, "Corpo texto preservado");
        db.upsert_message(&message(account_id, 3, false))
            .expect("remap header-only message");

        let after = db
            .get_message(stable_id)
            .expect("get remapped")
            .expect("same row");
        assert_eq!(after.id, stable_id);
        assert_eq!(after.uid, 3);
        assert!(after.pinned);
        assert!(after.priority);
        assert_eq!(after.body_text, "Corpo texto preservado");
        assert_eq!(after.body_html, "<p>Corpo HTML preservado</p>");
        assert!(after.has_attachments);
        assert_eq!(after.attachments.len(), 1);
        assert_eq!(after.attachments[0].filename, "arquivo.txt");

        drop(db);
        drop(store);
        cleanup(&path);
    }

    #[test]
    fn header_only_upsert_does_not_wipe_body_snippet_or_attachments() {
        let (store, path) = temp_store("header-preserve");
        let db = store.legacy().expect("legacy database handle");
        let account_id = account(&db);
        db.upsert_message(&message(account_id, 10, true))
            .expect("insert hydrated message");
        db.upsert_message(&message(account_id, 10, false))
            .expect("apply metadata-only refresh");
        let after = db
            .list_messages(Some(account_id), "INBOX", None, 10)
            .expect("list")
            .pop()
            .expect("message");
        assert_eq!(after.snippet, "Trecho preservado");
        assert_eq!(after.body_text, "Corpo texto preservado");
        assert_eq!(after.body_html, "<p>Corpo HTML preservado</p>");
        assert!(after.has_attachments);
        assert_eq!(after.attachments.len(), 1);
        let search = db
            .list_messages(Some(account_id), "INBOX", Some("preservado"), 10)
            .expect("search preserved FTS");
        assert_eq!(
            search.len(),
            1,
            "header-only refresh must preserve body FTS"
        );

        drop(db);
        drop(store);
        cleanup(&path);
    }

    #[test]
    fn reconcile_commit_rejects_changed_checkpoint_or_uid_without_mutating_data() {
        let (store, path) = temp_store("guarded-reconcile");
        let db = store.legacy().unwrap();
        let account_id = account(&db);
        db.upsert_message(&message(account_id, 10, true)).unwrap();
        let id = db
            .list_messages(Some(account_id), "INBOX", None, 10)
            .unwrap()[0]
            .id;
        store
            .save_sync_state(account_id, "INBOX", Some(71), 10, Some(10), false)
            .unwrap();
        let previous_timestamp = store.last_reconcile_ts(account_id, "INBOX").unwrap();
        let expected = SyncBatchCheckpoint {
            uid_validity: Some(71),
            highest: 10,
            oldest: Some(10),
            complete: false,
        };
        assert!(store
            .commit_guarded_reconcile(
                account_id,
                "INBOX",
                SyncBatchCheckpoint {
                    highest: 9,
                    ..expected
                },
                &[(id, 10, false, false)],
                &[],
                100
            )
            .is_err());
        assert!(store
            .commit_guarded_reconcile(
                account_id,
                "INBOX",
                expected,
                &[(id, 10, false, false)],
                &[(id, 11)],
                100
            )
            .is_err());
        let unchanged = db.get_message(id).unwrap().unwrap();
        assert!(unchanged.unread);
        assert_eq!(unchanged.body_text, "Corpo texto preservado");
        assert_eq!(
            store.last_reconcile_ts(account_id, "INBOX").unwrap(),
            previous_timestamp
        );
        store
            .commit_guarded_reconcile(
                account_id,
                "INBOX",
                expected,
                &[(id, 10, false, false)],
                &[],
                100,
            )
            .unwrap();
        assert!(!db.get_message(id).unwrap().unwrap().unread);
        assert_eq!(store.last_reconcile_ts(account_id, "INBOX").unwrap(), 100);
        store
            .commit_guarded_reconcile(account_id, "INBOX", expected, &[], &[(id, 10)], 101)
            .unwrap();
        assert!(db.get_message(id).unwrap().is_none());
        store
            .conn()
            .unwrap()
            .execute(
                "INSERT INTO messages_fts(messages_fts,rank) VALUES('integrity-check',1)",
                [],
            )
            .unwrap();
        drop(db);
        drop(store);
        cleanup(&path);
    }

    #[test]
    fn guarded_sync_rejects_unknown_and_changed_epochs_without_writes() {
        let (store, path) = temp_store("guarded-sync-epoch");
        let db = store.legacy().unwrap();
        let account_id = account(&db);
        db.upsert_message(&message(account_id, 10, true)).unwrap();
        let checkpoint = SyncBatchCheckpoint {
            uid_validity: Some(71),
            highest: 11,
            oldest: Some(10),
            complete: false,
        };
        let batch = [message(account_id, 11, false)];
        assert!(store
            .commit_guarded_sync_batch(
                account_id,
                "INBOX",
                &batch,
                SyncBatchCheckpoint {
                    uid_validity: Some(72),
                    ..checkpoint
                },
                false,
                SyncBatchCheckpoint {
                    uid_validity: None,
                    highest: 0,
                    oldest: None,
                    complete: false
                }
            )
            .is_err());
        assert_eq!(
            store.sync_state(account_id, "INBOX").unwrap(),
            (None, 0, None, false)
        );
        assert_eq!(
            db.list_messages(Some(account_id), "INBOX", None, 10)
                .unwrap()
                .len(),
            1
        );
        store
            .save_sync_state(account_id, "INBOX", Some(72), 10, Some(10), false)
            .unwrap();
        assert!(store
            .commit_guarded_sync_batch(
                account_id,
                "INBOX",
                &batch,
                SyncBatchCheckpoint {
                    uid_validity: Some(72),
                    ..checkpoint
                },
                true,
                SyncBatchCheckpoint {
                    uid_validity: Some(71),
                    highest: 10,
                    oldest: Some(10),
                    complete: false
                }
            )
            .is_err());
        assert!(store
            .commit_guarded_sync_batch(
                account_id,
                "INBOX",
                &batch,
                SyncBatchCheckpoint {
                    uid_validity: Some(72),
                    ..checkpoint
                },
                false,
                SyncBatchCheckpoint {
                    uid_validity: Some(72),
                    highest: 9,
                    oldest: Some(10),
                    complete: false
                }
            )
            .is_err());
        let original = db
            .list_messages(Some(account_id), "INBOX", None, 10)
            .unwrap();
        assert_eq!(original.len(), 1);
        assert_eq!(original[0].uid, 10);
        assert_eq!(original[0].body_text, "Corpo texto preservado");
        assert_eq!(
            store.sync_state(account_id, "INBOX").unwrap(),
            (Some(72), 10, Some(10), false)
        );
        store
            .commit_guarded_sync_batch(
                account_id,
                "INBOX",
                &batch,
                checkpoint,
                true,
                SyncBatchCheckpoint {
                    uid_validity: Some(72),
                    highest: 10,
                    oldest: Some(10),
                    complete: false,
                },
            )
            .unwrap();
        let remapped = db
            .list_messages(Some(account_id), "INBOX", None, 10)
            .unwrap();
        assert_eq!(remapped.len(), 1);
        assert_eq!(remapped[0].uid, 11);
        assert_eq!(remapped[0].body_text, "Corpo texto preservado");
        let mut fresh = message(account_id, 1, false);
        fresh.folder = "New".into();
        store
            .commit_guarded_sync_batch(
                account_id,
                "New",
                &[fresh],
                SyncBatchCheckpoint {
                    uid_validity: Some(80),
                    highest: 1,
                    oldest: Some(1),
                    complete: false,
                },
                false,
                SyncBatchCheckpoint {
                    uid_validity: None,
                    highest: 0,
                    oldest: None,
                    complete: false,
                },
            )
            .unwrap();
        drop(db);
        drop(store);
        cleanup(&path);
    }

    #[test]
    fn sync_batch_commits_rows_and_checkpoint_together() {
        let (store, path) = temp_store("atomic-sync-commit");
        let db = store.legacy().unwrap();
        let account_id = account(&db);
        let first = message(account_id, 10, false);
        let second = message(account_id, 11, false);
        store
            .commit_sync_batch(
                account_id,
                "INBOX",
                &[first, second],
                SyncBatchCheckpoint {
                    uid_validity: Some(71),
                    highest: 11,
                    oldest: Some(10),
                    complete: false,
                },
            )
            .unwrap();
        assert_eq!(
            db.list_messages(Some(account_id), "INBOX", None, 10)
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            store.sync_state(account_id, "INBOX").unwrap(),
            (Some(71), 11, Some(10), false)
        );
        drop(db);
        drop(store);
        cleanup(&path);
    }

    #[test]
    fn sync_batch_rolls_back_all_rows_fts_and_cursor_on_sqlite_failure() {
        let (store, path) = temp_store("atomic-sync-rollback");
        let db = store.legacy().unwrap();
        let account_id = account(&db);
        store
            .save_sync_state(account_id, "INBOX", Some(71), 5, Some(5), false)
            .unwrap();
        // A constraint failure during the second write must roll back the first
        // message, its FTS/contacts side effects and any cursor change.
        let conn = store.conn().unwrap();
        conn.execute_batch("CREATE TRIGGER reject_second_uid BEFORE INSERT ON messages WHEN NEW.uid=11 BEGIN SELECT RAISE(ABORT,'simulated failure'); END;").unwrap();
        drop(conn);
        let result = store.commit_sync_batch(
            account_id,
            "INBOX",
            &[
                message(account_id, 10, false),
                message(account_id, 11, false),
            ],
            SyncBatchCheckpoint {
                uid_validity: Some(71),
                highest: 11,
                oldest: Some(5),
                complete: false,
            },
        );
        assert!(result.is_err());
        assert!(db
            .list_messages(Some(account_id), "INBOX", None, 10)
            .unwrap()
            .is_empty());
        assert_eq!(
            store.sync_state(account_id, "INBOX").unwrap(),
            (Some(71), 5, Some(5), false)
        );
        drop(db);
        drop(store);
        cleanup(&path);
    }

    #[test]
    fn uidvalidity_reset_and_new_batch_commit_atomically() {
        let (store, path) = temp_store("atomic-uid-reset-success");
        let db = store.legacy().unwrap();
        let account_id = account(&db);
        db.upsert_message(&message(account_id, 77, true)).unwrap();
        store
            .save_sync_state(account_id, "INBOX", Some(71), 77, Some(77), false)
            .unwrap();
        store
            .commit_sync_batch_with_uid_reset(
                account_id,
                "INBOX",
                &[message(account_id, 3, false)],
                SyncBatchCheckpoint {
                    uid_validity: Some(72),
                    highest: 3,
                    oldest: Some(3),
                    complete: false,
                },
                true,
            )
            .unwrap();
        assert_eq!(
            store.sync_state(account_id, "INBOX").unwrap(),
            (Some(72), 3, Some(3), false)
        );
        let rows = db
            .list_messages(Some(account_id), "INBOX", None, 10)
            .unwrap();
        assert!(rows.iter().any(|m| m.uid == 3));
        drop(db);
        drop(store);
        cleanup(&path);
    }

    #[test]
    fn uidvalidity_reset_rolls_back_mapping_on_batch_failure() {
        let (store, path) = temp_store("atomic-uid-reset-failure");
        let db = store.legacy().unwrap();
        let account_id = account(&db);
        db.upsert_message(&message(account_id, 77, true)).unwrap();
        store
            .save_sync_state(account_id, "INBOX", Some(71), 77, Some(77), false)
            .unwrap();
        let conn = store.conn().unwrap();
        conn.execute_batch("CREATE TRIGGER fail_replacement BEFORE INSERT ON messages WHEN NEW.uid=3 BEGIN SELECT RAISE(ABORT,'simulated replace failure'); END;").unwrap();
        drop(conn);
        let err = store.commit_sync_batch_with_uid_reset(
            account_id,
            "INBOX",
            &[message(account_id, 3, false)],
            SyncBatchCheckpoint {
                uid_validity: Some(72),
                highest: 3,
                oldest: Some(3),
                complete: false,
            },
            true,
        );
        assert!(err.is_err());
        assert_eq!(
            store.sync_state(account_id, "INBOX").unwrap(),
            (Some(71), 77, Some(77), false)
        );
        assert!(db
            .list_messages(Some(account_id), "INBOX", None, 10)
            .unwrap()
            .iter()
            .any(|m| m.uid == 77));
        drop(db);
        drop(store);
        cleanup(&path);
    }

    #[test]
    fn sync_batch_rejects_cross_account_before_any_write() {
        let (store, path) = temp_store("atomic-sync-isolation");
        let db = store.legacy().unwrap();
        let account_id = account(&db);
        let other = message(account_id + 10, 11, false);
        assert!(store
            .commit_sync_batch(
                account_id,
                "INBOX",
                &[message(account_id, 10, false), other],
                SyncBatchCheckpoint {
                    uid_validity: None,
                    highest: 11,
                    oldest: None,
                    complete: false
                }
            )
            .is_err());
        assert!(db
            .list_messages(Some(account_id), "INBOX", None, 10)
            .unwrap()
            .is_empty());
        drop(db);
        drop(store);
        cleanup(&path);
    }
}
