use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

type FtsRow = (i64, String, String, String, String, String, String, String);

use chrono::{DateTime, Local, TimeZone};
use rusqlite::{params, Connection, OptionalExtension};

use crate::models::{Account, MessageSummary, Signature, SpecialFolders, Template};

const SCHEMA_VERSION: i64 = 11;

pub struct Database {
    path: PathBuf,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> rusqlite::Result<Self> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        }
        let db = Self { path };
        db.migrate()?;
        Ok(db)
    }

    /// Attach to an already migrated database. Used by the persistent 0.7 CoreStore
    /// so ordinary commands never execute migrations again.
    pub fn attach(path: impl AsRef<Path>) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
        }
    }
    pub fn connection(&self) -> rusqlite::Result<Connection> {
        self.conn()
    }

    pub(crate) fn conn(&self) -> rusqlite::Result<Connection> {
        let conn = Connection::open(&self.path)?;
        // WAL is enabled once during startup migration. Re-applying journal_mode on
        // every UI/database operation can require exclusive SQLite locks and stall
        // the GTK main thread while background sync is writing.
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.busy_timeout(Duration::from_secs(5))?;
        Ok(conn)
    }

    fn migrate(&self) -> rusqlite::Result<()> {
        let existed = self.path.exists();
        let conn = self.conn()?;
        // journal_mode is persistent for the database file, so set it once while
        // startup is single-threaded instead of on every connection.
        conn.pragma_update(None, "journal_mode", "WAL")?;
        let old: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;

        if existed && old < SCHEMA_VERSION {
            drop(conn);
            self.backup()?;
        } else {
            drop(conn);
        }

        let conn = self.conn()?;
        conn.execute_batch(include_str!("../data/schema_v9.sql"))?;
        conn.execute_batch(include_str!("../data/schema_v10.sql"))?;

        for (table, col, def) in [
            ("accounts", "color", "TEXT NOT NULL DEFAULT '#3584e4'"),
            ("accounts", "imap_security", "TEXT NOT NULL DEFAULT ''"),
            ("accounts", "smtp_security", "TEXT NOT NULL DEFAULT ''"),
            (
                "accounts",
                "auth_method",
                "TEXT NOT NULL DEFAULT 'password'",
            ),
            ("accounts", "oauth_provider", "TEXT NOT NULL DEFAULT ''"),
            ("messages", "spam", "INTEGER NOT NULL DEFAULT 0"),
            ("messages", "cc_text", "TEXT NOT NULL DEFAULT ''"),
            ("messages", "message_id", "TEXT NOT NULL DEFAULT ''"),
            ("messages", "in_reply_to", "TEXT NOT NULL DEFAULT ''"),
            ("messages", "references_text", "TEXT NOT NULL DEFAULT ''"),
            ("messages", "has_attachments", "INTEGER NOT NULL DEFAULT 0"),
            ("messages", "pinned", "INTEGER NOT NULL DEFAULT 0"),
            ("messages", "priority", "INTEGER NOT NULL DEFAULT 0"),
            (
                "scheduled_messages",
                "from_name",
                "TEXT NOT NULL DEFAULT ''",
            ),
            (
                "scheduled_messages",
                "from_email",
                "TEXT NOT NULL DEFAULT ''",
            ),
            (
                "scheduled_messages",
                "request_read_receipt",
                "INTEGER NOT NULL DEFAULT 0",
            ),
        ] {
            if !Self::column_exists(&conn, table, col)? {
                conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {col} {def}"), [])?;
            }
        }

        conn.execute(
            "UPDATE accounts SET imap_security=CASE WHEN imap_port=143 THEN 'starttls' ELSE 'tls' END WHERE imap_security=''",
            [],
        )?;
        conn.execute(
            "UPDATE accounts SET smtp_security=CASE WHEN smtp_port=465 THEN 'tls' ELSE 'starttls' END WHERE smtp_security=''",
            [],
        )?;

        // Rebuild the FTS index on every pre-v5 migration. Older releases could leave
        // stale FTS rows after message updates, so rebuilding is safer than preserving them.
        if old < 5 {
            conn.execute_batch(
                "DROP TABLE IF EXISTS messages_fts;
                 CREATE VIRTUAL TABLE messages_fts USING fts5(
                   subject, from_name, from_email, to_text, cc_text, snippet, body_text,
                   content='messages', content_rowid='id'
                 );
                 INSERT INTO messages_fts(rowid,subject,from_name,from_email,to_text,cc_text,snippet,body_text)
                 SELECT id,subject,from_name,from_email,to_text,cc_text,snippet,body_text FROM messages;",
            )?;
        }

        // v5: persist the last successful sync UID per account/folder. This allows future
        // incremental sync without destroying older installations.
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sync_state (
                account_id INTEGER NOT NULL,
                folder TEXT NOT NULL,
                last_uid INTEGER NOT NULL DEFAULT 0,
                uid_validity INTEGER,
                PRIMARY KEY(account_id, folder),
                FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
             );",
        )?;

        if old < SCHEMA_VERSION {
            conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;
        }
        Ok(())
    }

    fn column_exists(conn: &Connection, table: &str, col: &str) -> rusqlite::Result<bool> {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(1))?;
        for name in rows {
            if name? == col {
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn backup(&self) -> rusqlite::Result<()> {
        let stamp = Local::now().format("%Y%m%d-%H%M%S");
        let backup = self.path.with_file_name(format!("mail.db.backup-{stamp}"));
        // Include committed WAL pages even when an older reader prevents a
        // checkpoint. A failed snapshot aborts migration instead of copying .db.
        self.conn()?
            .backup(rusqlite::DatabaseName::Main, backup, None)
    }

    pub fn get_sync_state(
        &self,
        account_id: i64,
        folder: &str,
    ) -> rusqlite::Result<(u32, Option<u32>)> {
        let conn = self.conn()?;
        Ok(conn
            .query_row(
                "SELECT last_uid,uid_validity FROM sync_state WHERE account_id=?1 AND folder=?2",
                params![account_id, folder],
                |r| {
                    Ok((
                        r.get::<_, i64>(0)? as u32,
                        r.get::<_, Option<i64>>(1)?.map(|v| v as u32),
                    ))
                },
            )
            .optional()?
            .unwrap_or((0, None)))
    }
    pub fn set_sync_state(
        &self,
        account_id: i64,
        folder: &str,
        last_uid: u32,
        uid_validity: Option<u32>,
    ) -> rusqlite::Result<()> {
        self.conn()?.execute("INSERT INTO sync_state(account_id,folder,last_uid,uid_validity) VALUES(?1,?2,?3,?4) ON CONFLICT(account_id,folder) DO UPDATE SET last_uid=excluded.last_uid,uid_validity=excluded.uid_validity",params![account_id,folder,last_uid as i64,uid_validity.map(|v|v as i64)])?;
        Ok(())
    }

    pub fn list_accounts(&self) -> rusqlite::Result<Vec<Account>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT id,name,email,imap_host,imap_port,smtp_host,smtp_port,username,use_tls,default_signature_id,color,COALESCE(imap_security,''),COALESCE(smtp_security,''),COALESCE(auth_method,'password'),COALESCE(oauth_provider,'')
             FROM accounts ORDER BY id",
        )?;
        let rows = stmt.query_map([], Self::row_account)?;
        rows.collect()
    }

    fn row_account(r: &rusqlite::Row<'_>) -> rusqlite::Result<Account> {
        Ok(Account {
            id: r.get(0)?,
            name: r.get(1)?,
            email: r.get(2)?,
            imap_host: r.get(3)?,
            imap_port: r.get::<_, i64>(4)? as u16,
            smtp_host: r.get(5)?,
            smtp_port: r.get::<_, i64>(6)? as u16,
            username: r.get(7)?,
            use_tls: r.get::<_, i64>(8)? != 0,
            default_signature_id: r.get(9)?,
            color: r.get(10)?,
            imap_security: {
                let v: String = r.get(11)?;
                if v.is_empty() {
                    if r.get::<_, i64>(4)? == 143 {
                        "starttls".into()
                    } else {
                        "tls".into()
                    }
                } else {
                    v
                }
            },
            smtp_security: {
                let v: String = r.get(12)?;
                if v.is_empty() {
                    if r.get::<_, i64>(6)? == 465 {
                        "tls".into()
                    } else {
                        "starttls".into()
                    }
                } else {
                    v
                }
            },
            auth_method: r.get(13)?,
            oauth_provider: r.get(14)?,
        })
    }

    pub fn save_account(&self, a: &Account) -> rusqlite::Result<i64> {
        let conn = self.conn()?;
        if a.id > 0 {
            conn.execute(
                "UPDATE accounts SET name=?2,email=?3,imap_host=?4,imap_port=?5,smtp_host=?6,smtp_port=?7,username=?8,use_tls=?9,default_signature_id=?10,color=?11,imap_security=?12,smtp_security=?13,auth_method=?14,oauth_provider=?15 WHERE id=?1",
                params![a.id,a.name,a.email,a.imap_host,a.imap_port as i64,a.smtp_host,a.smtp_port as i64,a.username,a.use_tls as i64,a.default_signature_id,a.color,a.imap_security,a.smtp_security,a.auth_method,a.oauth_provider],
            )?;
            Ok(a.id)
        } else {
            conn.execute(
                "INSERT INTO accounts(name,email,imap_host,imap_port,smtp_host,smtp_port,username,use_tls,default_signature_id,color,imap_security,smtp_security,auth_method,oauth_provider) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
                params![a.name,a.email,a.imap_host,a.imap_port as i64,a.smtp_host,a.smtp_port as i64,a.username,a.use_tls as i64,a.default_signature_id,a.color,a.imap_security,a.smtp_security,a.auth_method,a.oauth_provider],
            )?;
            Ok(conn.last_insert_rowid())
        }
    }

    pub fn get_account(&self, id: i64) -> rusqlite::Result<Option<Account>> {
        let conn = self.conn()?;
        conn.query_row(
            "SELECT id,name,email,imap_host,imap_port,smtp_host,smtp_port,username,use_tls,default_signature_id,color,COALESCE(imap_security,''),COALESCE(smtp_security,''),COALESCE(auth_method,'password'),COALESCE(oauth_provider,'') FROM accounts WHERE id=?1",
            params![id],
            Self::row_account,
        )
        .optional()
    }

    pub fn list_signatures(&self, account_id: Option<i64>) -> rusqlite::Result<Vec<Signature>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT id,account_id,name,language,context,body,is_default
             FROM signatures
             WHERE account_id IS NULL OR account_id=?1
             ORDER BY (account_id=?1) DESC, is_default DESC, name",
        )?;
        let rows = stmt.query_map(params![account_id], |r| {
            Ok(Signature {
                id: r.get(0)?,
                account_id: r.get(1)?,
                name: r.get(2)?,
                language: r.get(3)?,
                context: r.get(4)?,
                body: r.get(5)?,
                is_default: r.get::<_, i64>(6)? != 0,
            })
        })?;
        rows.collect()
    }

    pub fn save_signature(&self, s: &Signature) -> rusqlite::Result<i64> {
        let conn = self.conn()?;
        if s.is_default {
            match s.account_id {
                Some(id) => {
                    conn.execute(
                        "UPDATE signatures SET is_default=0 WHERE account_id=?1",
                        params![id],
                    )?;
                }
                None => {
                    conn.execute(
                        "UPDATE signatures SET is_default=0 WHERE account_id IS NULL",
                        [],
                    )?;
                }
            }
        }

        if s.id > 0 {
            conn.execute(
                "UPDATE signatures SET account_id=?2,name=?3,language=?4,context=?5,body=?6,is_default=?7 WHERE id=?1",
                params![s.id,s.account_id,s.name,s.language,s.context,s.body,s.is_default as i64],
            )?;
            Ok(s.id)
        } else {
            conn.execute(
                "INSERT INTO signatures(account_id,name,language,context,body,is_default) VALUES(?1,?2,?3,?4,?5,?6)",
                params![s.account_id,s.name,s.language,s.context,s.body,s.is_default as i64],
            )?;
            Ok(conn.last_insert_rowid())
        }
    }

    pub fn preferred_signature(&self, account_id: i64) -> rusqlite::Result<Option<Signature>> {
        let account = self.get_account(account_id)?;
        let signatures = self.list_signatures(Some(account_id))?;
        if let Some(default_id) = account.and_then(|a| a.default_signature_id) {
            if let Some(signature) = signatures.iter().find(|s| s.id == default_id) {
                return Ok(Some(signature.clone()));
            }
        }
        Ok(signatures
            .iter()
            .find(|s| s.account_id == Some(account_id) && s.is_default)
            .cloned()
            .or_else(|| {
                signatures
                    .iter()
                    .find(|s| s.account_id == Some(account_id))
                    .cloned()
            })
            .or_else(|| signatures.iter().find(|s| s.is_default).cloned())
            .or_else(|| signatures.into_iter().next()))
    }

    pub fn list_templates(&self) -> rusqlite::Result<Vec<Template>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare("SELECT id,name,subject,body FROM templates ORDER BY name")?;
        let rows = stmt.query_map([], |r| {
            Ok(Template {
                id: r.get(0)?,
                name: r.get(1)?,
                subject: r.get(2)?,
                body: r.get(3)?,
            })
        })?;
        rows.collect()
    }

    pub fn save_template(&self, t: &Template) -> rusqlite::Result<i64> {
        let conn = self.conn()?;
        if t.id > 0 {
            conn.execute(
                "UPDATE templates SET name=?2,subject=?3,body=?4 WHERE id=?1",
                params![t.id, t.name, t.subject, t.body],
            )?;
            Ok(t.id)
        } else {
            conn.execute(
                "INSERT INTO templates(name,subject,body) VALUES(?1,?2,?3)
                 ON CONFLICT(name) DO UPDATE SET subject=excluded.subject,body=excluded.body",
                params![t.name, t.subject, t.body],
            )?;
            conn.query_row(
                "SELECT id FROM templates WHERE name=?1",
                params![t.name],
                |r| r.get(0),
            )
        }
    }

    pub fn delete_template(&self, id: i64) -> rusqlite::Result<()> {
        let conn = self.conn()?;
        conn.execute("DELETE FROM templates WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn upsert_message(&self, m: &MessageSummary) -> rusqlite::Result<()> {
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        Self::upsert_message_in_tx(&tx, m)?;
        tx.commit()
    }

    pub(crate) fn upsert_message_in_tx(
        tx: &rusqlite::Transaction<'_>,
        m: &MessageSummary,
    ) -> rusqlite::Result<()> {
        // After an UIDVALIDITY reset CoreStore marks the old UID as negative.
        // Reassociate a header with its stable local row by Message-ID before
        // applying the normal account/folder/UID upsert. This preserves row IDs,
        // Snooze/Set Aside links, pin/priority and cached message content.
        if !m.message_id.trim().is_empty() {
            if let Some(stale_id) = tx
                .query_row(
                    "SELECT id FROM messages WHERE account_id=?1 AND folder=?2 AND message_id=?3 AND uid<0 ORDER BY id LIMIT 1",
                    params![m.account_id, m.folder, m.message_id],
                    |r| r.get::<_, i64>(0),
                )
                .optional()?
            {
                tx.execute("UPDATE messages SET uid=?2 WHERE id=?1", params![stale_id, m.uid])?;
            }
        }

        // FTS5 external-content tables do not automatically track UPDATE/DELETE.
        // Keep the content row and its FTS index in one transaction so a partial
        // failure cannot leave search results inconsistent with the message cache.
        let old_fts: Option<FtsRow> = tx
            .query_row(
                "SELECT id,subject,from_name,from_email,to_text,cc_text,snippet,body_text
                 FROM messages WHERE account_id=?1 AND folder=?2 AND uid=?3",
                params![m.account_id, m.folder, m.uid],
                |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                        r.get(3)?,
                        r.get(4)?,
                        r.get(5)?,
                        r.get(6)?,
                        r.get(7)?,
                    ))
                },
            )
            .optional()?;

        if let Some((id, subject, from_name, from_email, to_text, cc_text, snippet, body_text)) =
            old_fts
        {
            tx.execute(
                "INSERT INTO messages_fts(messages_fts,rowid,subject,from_name,from_email,to_text,cc_text,snippet,body_text)
                 VALUES('delete',?1,?2,?3,?4,?5,?6,?7,?8)",
                params![id, subject, from_name, from_email, to_text, cc_text, snippet, body_text],
            )?;
        }

        tx.execute(
            "INSERT INTO messages(account_id,folder,uid,subject,from_name,from_email,to_text,cc_text,date_ts,snippet,body_text,unread,starred,spam,message_id,in_reply_to,references_text,has_attachments,pinned,priority)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)
             ON CONFLICT(account_id,folder,uid) DO UPDATE SET
               subject=excluded.subject,from_name=excluded.from_name,from_email=excluded.from_email,
               to_text=excluded.to_text,cc_text=excluded.cc_text,date_ts=excluded.date_ts,
               snippet=CASE WHEN excluded.snippet<>'' THEN excluded.snippet ELSE messages.snippet END,
               body_text=CASE WHEN excluded.body_text<>'' THEN excluded.body_text ELSE messages.body_text END,
               unread=excluded.unread,starred=excluded.starred,spam=excluded.spam,message_id=excluded.message_id,
               in_reply_to=excluded.in_reply_to,references_text=excluded.references_text,
               has_attachments=CASE WHEN excluded.has_attachments=1 THEN 1 ELSE messages.has_attachments END",
            params![m.account_id,m.folder,m.uid,m.subject,m.from_name,m.from_email,m.to_text,m.cc_text,m.date.timestamp(),m.snippet,m.body_text,m.unread as i64,m.starred as i64,m.spam as i64,m.message_id,m.in_reply_to,m.references_text,m.has_attachments as i64,m.pinned as i64,m.priority as i64],
        )?;

        let stored_fts: FtsRow = tx.query_row(
            "SELECT id,subject,from_name,from_email,to_text,cc_text,snippet,body_text
             FROM messages WHERE account_id=?1 AND folder=?2 AND uid=?3",
            params![m.account_id, m.folder, m.uid],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                ))
            },
        )?;
        let (row_id, subject, from_name, from_email, to_text, cc_text, snippet, body_text) =
            stored_fts;
        tx.execute(
            "INSERT INTO messages_fts(rowid,subject,from_name,from_email,to_text,cc_text,snippet,body_text)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
            params![row_id,subject,from_name,from_email,to_text,cc_text,snippet,body_text],
        )?;
        // Header-only sync must never wipe a body/attachments already fetched
        // lazily. Only replace extras when this payload actually contains MIME
        // detail, or create the initially empty extras row for a brand-new item.
        let has_extras = !m.body_html.is_empty()
            || !m.attachments.is_empty()
            || !m.calendar_ics.is_empty()
            || !m.body_text.is_empty();
        if has_extras {
            let attachments_json =
                serde_json::to_string(&m.attachments).unwrap_or_else(|_| "[]".to_string());
            tx.execute(
                "INSERT INTO message_extras(message_id,body_html,attachments_json,calendar_ics) VALUES(?1,?2,?3,?4)
                 ON CONFLICT(message_id) DO UPDATE SET body_html=excluded.body_html,attachments_json=excluded.attachments_json,calendar_ics=excluded.calendar_ics",
                params![row_id,m.body_html,attachments_json,m.calendar_ics],
            )?;
        } else {
            tx.execute(
                "INSERT OR IGNORE INTO message_extras(message_id,body_html,attachments_json,calendar_ics) VALUES(?1,'','[]','')",
                params![row_id],
            )?;
        }
        // Build a local address book opportunistically from message traffic.
        if !m.from_email.trim().is_empty() {
            tx.execute(
                "INSERT INTO contacts(name,email,frequency,last_seen_ts) VALUES(?1,?2,1,?3)
                 ON CONFLICT(email) DO UPDATE SET name=CASE WHEN excluded.name<>'' THEN excluded.name ELSE contacts.name END,frequency=contacts.frequency+1,last_seen_ts=MAX(contacts.last_seen_ts,excluded.last_seen_ts)",
                params![m.from_name,m.from_email,m.date.timestamp()],
            )?;
        }
        Ok(())
    }

    pub fn list_messages(
        &self,
        account_id: Option<i64>,
        folder: &str,
        search: Option<&str>,
        limit: usize,
    ) -> rusqlite::Result<Vec<MessageSummary>> {
        let conn = self.conn()?;
        let mut out = Vec::new();
        if let Some(q) = search.filter(|s| !s.trim().is_empty()) {
            let fts = Self::fts_query(q);
            let mut stmt = conn.prepare(
                "SELECT m.id,m.account_id,m.folder,m.uid,m.subject,m.from_name,m.from_email,m.to_text,m.cc_text,m.date_ts,m.snippet,m.body_text,m.unread,m.starred,m.spam,m.message_id,m.in_reply_to,m.references_text,m.has_attachments,m.pinned,m.priority
                 FROM messages_fts f JOIN messages m ON m.id=f.rowid
                 WHERE (?1 IS NULL OR m.account_id=?1) AND (?2='*' OR m.folder=?2) AND messages_fts MATCH ?3
                 ORDER BY m.pinned DESC,m.priority DESC,m.date_ts DESC LIMIT ?4",
            )?;
            let rows = stmt.query_map(
                params![account_id, folder, fts, limit as i64],
                Self::row_message,
            )?;
            for row in rows {
                out.push(row?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id,account_id,folder,uid,subject,from_name,from_email,to_text,cc_text,date_ts,snippet,body_text,unread,starred,spam,message_id,in_reply_to,references_text,has_attachments,pinned,priority
                 FROM messages
                 WHERE (?1 IS NULL OR account_id=?1) AND (?2='*' OR folder=?2)
                 ORDER BY pinned DESC,priority DESC,date_ts DESC LIMIT ?3",
            )?;
            let rows =
                stmt.query_map(params![account_id, folder, limit as i64], Self::row_message)?;
            for row in rows {
                out.push(row?);
            }
        }
        for message in &mut out {
            Self::hydrate_message_extras(&conn, message)?;
        }
        Ok(out)
    }

    pub fn list_starred_messages(
        &self,
        account_id: Option<i64>,
        search: Option<&str>,
        limit: usize,
    ) -> rusqlite::Result<Vec<MessageSummary>> {
        let conn = self.conn()?;
        let mut out = Vec::new();
        if let Some(q) = search.filter(|s| !s.trim().is_empty()) {
            let fts = Self::fts_query(q);
            let mut stmt = conn.prepare(
                "SELECT m.id,m.account_id,m.folder,m.uid,m.subject,m.from_name,m.from_email,m.to_text,m.cc_text,m.date_ts,m.snippet,m.body_text,m.unread,m.starred,m.spam,m.message_id,m.in_reply_to,m.references_text,m.has_attachments,m.pinned,m.priority
                 FROM messages_fts f JOIN messages m ON m.id=f.rowid
                 WHERE (?1 IS NULL OR m.account_id=?1) AND m.starred=1 AND messages_fts MATCH ?2
                 ORDER BY m.pinned DESC,m.priority DESC,m.date_ts DESC LIMIT ?3",
            )?;
            let rows = stmt.query_map(params![account_id, fts, limit as i64], Self::row_message)?;
            for row in rows {
                out.push(row?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id,account_id,folder,uid,subject,from_name,from_email,to_text,cc_text,date_ts,snippet,body_text,unread,starred,spam,message_id,in_reply_to,references_text,has_attachments,pinned,priority
                 FROM messages WHERE (?1 IS NULL OR account_id=?1) AND starred=1
                 ORDER BY pinned DESC,priority DESC,date_ts DESC LIMIT ?2",
            )?;
            let rows = stmt.query_map(params![account_id, limit as i64], Self::row_message)?;
            for row in rows {
                out.push(row?);
            }
        }
        for message in &mut out {
            Self::hydrate_message_extras(&conn, message)?;
        }
        Ok(out)
    }

    fn row_message(r: &rusqlite::Row<'_>) -> rusqlite::Result<MessageSummary> {
        let ts: i64 = r.get(9)?;
        let date: DateTime<Local> = Local
            .timestamp_opt(ts, 0)
            .single()
            .unwrap_or_else(Local::now);
        Ok(MessageSummary {
            id: r.get(0)?,
            account_id: r.get(1)?,
            folder: r.get(2)?,
            uid: r.get::<_, i64>(3)? as u32,
            subject: r.get(4)?,
            from_name: r.get(5)?,
            from_email: r.get(6)?,
            to_text: r.get(7)?,
            cc_text: r.get(8)?,
            date,
            snippet: r.get(10)?,
            body_text: r.get(11)?,
            body_html: String::new(),
            attachments: Vec::new(),
            calendar_ics: String::new(),
            unread: r.get::<_, i64>(12)? != 0,
            starred: r.get::<_, i64>(13)? != 0,
            spam: r.get::<_, i64>(14)? != 0,
            message_id: r.get(15)?,
            in_reply_to: r.get(16)?,
            references_text: r.get(17)?,
            has_attachments: r.get::<_, i64>(18)? != 0,
            pinned: r.get::<_, i64>(19)? != 0,
            priority: r.get::<_, i64>(20)? != 0,
        })
    }

    fn hydrate_message_extras(
        conn: &Connection,
        message: &mut MessageSummary,
    ) -> rusqlite::Result<()> {
        let extras: Option<(String,String,String)> = conn.query_row(
            "SELECT body_html,attachments_json,calendar_ics FROM message_extras WHERE message_id=?1",
            params![message.id],
            |r| Ok((r.get(0)?,r.get(1)?,r.get(2)?)),
        ).optional()?;
        if let Some((html, attachments_json, ics)) = extras {
            message.body_html = html;
            message.attachments = serde_json::from_str(&attachments_json).unwrap_or_default();
            message.calendar_ics = ics;
            message.has_attachments = !message.attachments.is_empty() || message.has_attachments;
        }
        Ok(())
    }

    pub fn get_message_by_uid(
        &self,
        account_id: i64,
        folder: &str,
        uid: u32,
    ) -> rusqlite::Result<Option<MessageSummary>> {
        let conn = self.conn()?;
        let id: Option<i64> = conn
            .query_row(
                "SELECT id FROM messages WHERE account_id=?1 AND folder=?2 AND uid=?3",
                params![account_id, folder, uid as i64],
                |r| r.get(0),
            )
            .optional()?;
        drop(conn);
        match id {
            Some(id) => self.get_message(id),
            None => Ok(None),
        }
    }

    pub fn has_message_uid(
        &self,
        account_id: i64,
        folder: &str,
        uid: u32,
    ) -> rusqlite::Result<bool> {
        let conn = self.conn()?;
        let exists: i64 = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM messages WHERE account_id=?1 AND folder=?2 AND uid=?3)",
            params![account_id, folder, uid as i64],
            |r| r.get(0),
        )?;
        Ok(exists != 0)
    }

    pub fn count_messages(&self, account_id: i64, folder: &str) -> rusqlite::Result<i64> {
        let conn = self.conn()?;
        conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE account_id=?1 AND folder=?2",
            params![account_id, folder],
            |r| r.get(0),
        )
    }

    pub fn get_message(&self, id: i64) -> rusqlite::Result<Option<MessageSummary>> {
        let conn = self.conn()?;
        Self::get_message_from_connection(&conn, id)
    }

    pub(crate) fn get_message_from_connection(
        conn: &Connection,
        id: i64,
    ) -> rusqlite::Result<Option<MessageSummary>> {
        let mut message = conn.query_row(
            "SELECT id,account_id,folder,uid,subject,from_name,from_email,to_text,cc_text,date_ts,snippet,body_text,unread,starred,spam,message_id,in_reply_to,references_text,has_attachments,pinned,priority FROM messages WHERE id=?1",
            params![id],
            Self::row_message,
        ).optional()?;
        if let Some(value) = message.as_mut() {
            Self::hydrate_message_extras(conn, value)?;
        }
        Ok(message)
    }

    pub fn set_message_flags(
        &self,
        id: i64,
        starred: Option<bool>,
        pinned: Option<bool>,
        priority: Option<bool>,
        unread: Option<bool>,
    ) -> rusqlite::Result<()> {
        let conn = self.conn()?;
        if let Some(v) = starred {
            conn.execute(
                "UPDATE messages SET starred=?2 WHERE id=?1",
                params![id, v as i64],
            )?;
        }
        if let Some(v) = pinned {
            conn.execute(
                "UPDATE messages SET pinned=?2 WHERE id=?1",
                params![id, v as i64],
            )?;
        }
        if let Some(v) = priority {
            conn.execute(
                "UPDATE messages SET priority=?2 WHERE id=?1",
                params![id, v as i64],
            )?;
        }
        if let Some(v) = unread {
            conn.execute(
                "UPDATE messages SET unread=?2 WHERE id=?1",
                params![id, v as i64],
            )?;
        }
        Ok(())
    }

    /// A successful IMAP MOVE/COPY may allocate a different UID in the target mailbox.
    /// Therefore the local source row is removed instead of being rewritten with a stale UID.
    pub fn remove_local_message(&self, id: i64) -> rusqlite::Result<()> {
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        if let Some((subject, from_name, from_email, to_text, cc_text, snippet, body_text)) = tx
            .query_row(
                "SELECT subject,from_name,from_email,to_text,cc_text,snippet,body_text FROM messages WHERE id=?1",
                params![id],
                |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,String>(4)?,r.get::<_,String>(5)?,r.get::<_,String>(6)?)),
            )
            .optional()?
        {
            tx.execute(
                "INSERT INTO messages_fts(messages_fts,rowid,subject,from_name,from_email,to_text,cc_text,snippet,body_text) VALUES('delete',?1,?2,?3,?4,?5,?6,?7,?8)",
                params![id,subject,from_name,from_email,to_text,cc_text,snippet,body_text],
            )?;
        }
        tx.execute("DELETE FROM messages WHERE id=?1", params![id])?;
        tx.commit()?;
        Ok(())
    }

    pub fn remove_local_messages(&self, ids: &[i64]) -> rusqlite::Result<()> {
        if ids.is_empty() {
            return Ok(());
        }
        let mut conn = self.conn()?;
        let tx = conn.transaction()?;
        for id in ids {
            if let Some((subject, from_name, from_email, to_text, cc_text, snippet, body_text)) = tx
                .query_row(
                    "SELECT subject,from_name,from_email,to_text,cc_text,snippet,body_text FROM messages WHERE id=?1",
                    params![id],
                    |r| Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,String>(4)?,r.get::<_,String>(5)?,r.get::<_,String>(6)?)),
                )
                .optional()?
            {
                tx.execute(
                    "INSERT INTO messages_fts(messages_fts,rowid,subject,from_name,from_email,to_text,cc_text,snippet,body_text) VALUES('delete',?1,?2,?3,?4,?5,?6,?7,?8)",
                    params![id,subject,from_name,from_email,to_text,cc_text,snippet,body_text],
                )?;
            }
            tx.execute("DELETE FROM messages WHERE id=?1", params![id])?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn remove_local_by_message_id(
        &self,
        account_id: i64,
        folder: &str,
        message_id: &str,
    ) -> rusqlite::Result<()> {
        let conn = self.conn()?;
        let ids: Vec<i64> = {
            let mut stmt = conn.prepare(
                "SELECT id FROM messages WHERE account_id=?1 AND folder=?2 AND message_id=?3",
            )?;
            let rows = stmt.query_map(params![account_id, folder, message_id], |r| r.get(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        drop(conn);
        self.remove_local_messages(&ids)
    }

    pub fn delete_folder_cache(&self, account_id: i64, folder: &str) -> rusqlite::Result<()> {
        let conn = self.conn()?;
        let ids: Vec<i64> = {
            let mut stmt =
                conn.prepare("SELECT id FROM messages WHERE account_id=?1 AND folder=?2")?;
            let rows = stmt.query_map(params![account_id, folder], |r| r.get(0))?;
            rows.collect::<rusqlite::Result<Vec<_>>>()?
        };
        drop(conn);
        self.remove_local_messages(&ids)
    }

    pub fn mark_folder_read(&self, account_id: i64, folder: &str) -> rusqlite::Result<()> {
        self.conn()?.execute(
            "UPDATE messages SET unread=0 WHERE account_id=?1 AND folder=?2",
            params![account_id, folder],
        )?;
        Ok(())
    }

    pub fn set_folder_roles(&self, account_id: i64, f: &SpecialFolders) -> rusqlite::Result<()> {
        for (role, value) in [
            ("sent", &f.sent),
            ("drafts", &f.drafts),
            ("archive", &f.archive),
            ("trash", &f.trash),
            ("junk", &f.junk),
        ] {
            if let Some(value) = value {
                self.set_folder_role(account_id, role, value)?;
            }
        }
        Ok(())
    }

    pub fn set_folder_role(
        &self,
        account_id: i64,
        role: &str,
        folder: &str,
    ) -> rusqlite::Result<()> {
        self.conn()?.execute(
            "INSERT INTO folder_roles(account_id,role,folder) VALUES(?1,?2,?3)
             ON CONFLICT(account_id,role) DO UPDATE SET folder=excluded.folder",
            params![account_id, role, folder],
        )?;
        Ok(())
    }

    pub fn folder_role(&self, account_id: i64, role: &str) -> Option<String> {
        self.conn()
            .ok()?
            .query_row(
                "SELECT folder FROM folder_roles WHERE account_id=?1 AND role=?2",
                params![account_id, role],
                |r| r.get(0),
            )
            .optional()
            .ok()
            .flatten()
    }

    pub fn set_setting(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        self.conn()?.execute(
            "INSERT INTO settings(key,value) VALUES(?1,?2)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Option<String> {
        self.conn()
            .ok()?
            .query_row(
                "SELECT value FROM settings WHERE key=?1",
                params![key],
                |r| r.get(0),
            )
            .optional()
            .ok()
            .flatten()
    }

    pub fn setting_bool(&self, key: &str, default: bool) -> bool {
        self.get_setting(key)
            .map(|v| v == "true")
            .unwrap_or(default)
    }

    pub fn setting_i64(&self, key: &str, default: i64) -> i64 {
        self.get_setting(key)
            .and_then(|v| v.parse().ok())
            .unwrap_or(default)
    }
    fn fts_query(input: &str) -> String {
        input
            .split_whitespace()
            .filter(|part| !part.is_empty())
            .map(|part| format!("\"{}\"", part.replace('\"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Template;

    #[test]
    fn migration_backup_includes_committed_wal_with_an_older_reader() {
        let directory =
            std::env::temp_dir().join(format!("tcs-db-backup-{}", uuid::Uuid::new_v4()));
        let path = directory.join("synthetic.db");
        {
            let db = Database::open(&path).unwrap();
            let writer = db.connection().unwrap();
            writer.pragma_update(None, "wal_autocheckpoint", 0).unwrap();
            writer.execute_batch("CREATE TABLE backup_probe(value BLOB); PRAGMA user_version=9; PRAGMA wal_checkpoint(TRUNCATE);").unwrap();
            let reader = db.connection().unwrap();
            reader.execute_batch("BEGIN").unwrap();
            assert_eq!(
                reader
                    .query_row("SELECT COUNT(*) FROM backup_probe", [], |r| r
                        .get::<_, i64>(0))
                    .unwrap(),
                0
            );
            writer
                .execute("INSERT INTO backup_probe VALUES(x'0080ff')", [])
                .unwrap();
            let (_, logged, checkpointed) = writer
                .query_row("PRAGMA wal_checkpoint(PASSIVE)", [], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, i64>(1)?,
                        r.get::<_, i64>(2)?,
                    ))
                })
                .unwrap();
            assert!(
                logged > checkpointed,
                "test requires committed data still in WAL"
            );
            Database::open(&path).unwrap();
            let backups = fs::read_dir(&directory)
                .unwrap()
                .map(|p| p.unwrap().path())
                .filter(|p| {
                    p.file_name()
                        .unwrap()
                        .to_string_lossy()
                        .starts_with("mail.db.backup-")
                })
                .collect::<Vec<_>>();
            assert_eq!(backups.len(), 1, "legacy backup filename is preserved");
            let backup = Connection::open(&backups[0]).unwrap();
            assert_eq!(
                backup
                    .query_row("SELECT value FROM backup_probe", [], |r| r
                        .get::<_, Vec<u8>>(0))
                    .unwrap(),
                vec![0, 128, 255]
            );
            assert_eq!(
                backup
                    .query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0))
                    .unwrap(),
                "ok"
            );
            assert_eq!(
                backup
                    .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
                    .unwrap(),
                9
            );
        }
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn template_crud_refresh_contract() {
        let base = std::env::temp_dir().join(format!(
            "tcs-mail-template-test-{}.db",
            uuid::Uuid::new_v4()
        ));
        let db = Database::open(&base).expect("open temp database");

        let id = db
            .save_template(&Template {
                id: 0,
                name: "Resposta curta".into(),
                subject: "Assunto A".into(),
                body: "Corpo A".into(),
            })
            .expect("save template");
        assert!(db.list_templates().unwrap().iter().any(|t| t.id == id));

        db.save_template(&Template {
            id,
            name: "Resposta revisada".into(),
            subject: "Assunto B".into(),
            body: "Corpo B".into(),
        })
        .expect("update template");
        let updated = db
            .list_templates()
            .unwrap()
            .into_iter()
            .find(|t| t.id == id)
            .expect("updated template listed");
        assert_eq!(updated.name, "Resposta revisada");
        assert_eq!(updated.subject, "Assunto B");

        db.delete_template(id).expect("delete template");
        assert!(!db.list_templates().unwrap().iter().any(|t| t.id == id));

        drop(db);
        let _ = std::fs::remove_file(&base);
        let _ = std::fs::remove_file(format!("{}-wal", base.display()));
        let _ = std::fs::remove_file(format!("{}-shm", base.display()));
    }
    #[test]
    fn batch_message_management_contract() {
        let base =
            std::env::temp_dir().join(format!("tcs-mail-batch-test-{}.db", uuid::Uuid::new_v4()));
        let db = Database::open(&base).expect("open temp database");
        let account_id = db
            .save_account(&Account {
                id: 0,
                name: "Teste".into(),
                email: "test@example.invalid".into(),
                imap_host: "imap.invalid".into(),
                imap_port: 993,
                smtp_host: "smtp.invalid".into(),
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
            .expect("save account");
        for uid in [10u32, 11u32] {
            db.upsert_message(&MessageSummary {
                id: 0,
                account_id,
                folder: "INBOX".into(),
                uid,
                subject: format!("Mensagem {uid}"),
                from_name: "Alice".into(),
                from_email: "alice@example.invalid".into(),
                to_text: "test@example.invalid".into(),
                cc_text: String::new(),
                date: chrono::Local::now(),
                snippet: "Teste".into(),
                body_text: "Corpo".into(),
                body_html: "<p>Corpo</p>".into(),
                attachments: Vec::new(),
                calendar_ics: String::new(),
                unread: true,
                starred: false,
                spam: false,
                message_id: format!("<m{uid}@example.invalid>"),
                in_reply_to: String::new(),
                references_text: String::new(),
                has_attachments: false,
                pinned: false,
                priority: false,
            })
            .expect("upsert message");
        }
        db.mark_folder_read(account_id, "INBOX")
            .expect("mark folder read");
        let rows = db
            .list_messages(Some(account_id), "INBOX", None, 10)
            .unwrap();
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|m| !m.unread));
        let ids: Vec<i64> = rows.iter().map(|m| m.id).collect();
        db.remove_local_messages(&ids).expect("remove messages");
        assert!(db
            .list_messages(Some(account_id), "INBOX", None, 10)
            .unwrap()
            .is_empty());

        drop(db);
        let _ = std::fs::remove_file(&base);
        let _ = std::fs::remove_file(format!("{}-wal", base.display()));
        let _ = std::fs::remove_file(format!("{}-shm", base.display()));
    }
}
