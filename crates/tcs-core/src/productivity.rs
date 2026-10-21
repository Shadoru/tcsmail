use crate::secrets::SecretStore;
use chrono::{Duration as ChronoDuration, Local, NaiveDateTime, TimeZone};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::time::Duration as StdDuration;
use uuid::Uuid;

use crate::{db::Database, models::MessageSummary};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Contact {
    pub id: i64,
    pub name: String,
    pub email: String,
    pub frequency: i64,
    pub last_seen_ts: i64,
    pub carddav_source_id: Option<i64>,
    pub remote_href: String,
    pub dirty: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContactSource {
    pub id: i64,
    pub name: String,
    pub url: String,
    pub username: String,
    pub enabled: bool,
    pub last_sync_ts: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Identity {
    pub id: i64,
    pub account_id: i64,
    pub name: String,
    pub email: String,
    pub signature_id: Option<i64>,
    pub is_default: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailRule {
    pub id: i64,
    pub name: String,
    pub enabled: bool,
    pub field: String,
    pub pattern: String,
    pub action: String,
    pub action_value: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedSearch {
    pub id: i64,
    pub name: String,
    pub query: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarInfo {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub visible: bool,
    pub read_only: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEvent {
    pub id: i64,
    pub calendar_id: i64,
    pub uid: String,
    pub title: String,
    pub description: String,
    pub location: String,
    pub start_ts: i64,
    pub end_ts: i64,
    pub all_day: bool,
    pub attendees: String,
    pub status: String,
    pub rrule: String,
    pub source_message_id: Option<i64>,
    pub video_url: String,
    pub timezone: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarSource {
    pub id: i64,
    pub calendar_id: i64,
    pub kind: String,
    pub url: String,
    pub username: String,
    pub shared: bool,
    pub last_sync_ts: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub notes: String,
    pub due_ts: Option<i64>,
    pub completed: bool,
    pub source_message_id: Option<i64>,
    pub priority: i64,
    pub rrule: String,
    pub reminder_ts: Option<i64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FollowUp {
    pub id: i64,
    pub account_id: i64,
    pub recipient: String,
    pub subject_key: String,
    pub due_ts: i64,
    pub created_ts: i64,
    pub state: String,
    pub note: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueItem {
    pub id: String,
    pub account_id: i64,
    pub subject: String,
    pub to_text: String,
    pub send_at_ts: i64,
    pub state: String,
    pub last_error: String,
}
type CalendarExceptionRow = (i64, Option<i64>, Option<i64>, Option<String>);

fn row_event(r: &rusqlite::Row<'_>) -> rusqlite::Result<CalendarEvent> {
    Ok(CalendarEvent {
        id: r.get(0)?,
        calendar_id: r.get(1)?,
        uid: r.get(2)?,
        title: r.get(3)?,
        description: r.get(4)?,
        location: r.get(5)?,
        start_ts: r.get(6)?,
        end_ts: r.get(7)?,
        all_day: r.get::<_, i64>(8)? != 0,
        attendees: r.get(9)?,
        status: r.get(10)?,
        rrule: r.get(11)?,
        source_message_id: r.get(12)?,
        video_url: r.get(13)?,
        timezone: r.get(14)?,
    })
}
fn normalize_subject(subject: &str) -> String {
    let mut s = subject.trim().to_string();
    loop {
        let lower = s.to_ascii_lowercase();
        let prefixes = ["re:", "fwd:", "fw:", "enc:", "res:", "aw:", "sv:"];
        if let Some(p) = prefixes.iter().find(|p| lower.starts_with(**p)) {
            s = s[p.len()..].trim().to_string();
        } else {
            break;
        }
    }
    s.to_ascii_lowercase()
}

fn parse_ics_datetime(v: &str) -> Option<i64> {
    let raw = v.trim();
    let utc = raw.ends_with('Z');
    let value = raw.trim_end_matches('Z');
    for fmt in ["%Y%m%dT%H%M%S", "%Y%m%dT%H%M"] {
        if let Ok(n) = NaiveDateTime::parse_from_str(value, fmt) {
            return if utc {
                Some(chrono::Utc.from_utc_datetime(&n).timestamp())
            } else {
                Local
                    .from_local_datetime(&n)
                    .single()
                    .map(|d| d.timestamp())
            };
        }
    }
    if let Ok(d) = chrono::NaiveDate::parse_from_str(value, "%Y%m%d") {
        return d.and_hms_opt(0, 0, 0).and_then(|n| {
            if utc {
                Some(chrono::Utc.from_utc_datetime(&n).timestamp())
            } else {
                Local
                    .from_local_datetime(&n)
                    .single()
                    .map(|d| d.timestamp())
            }
        });
    }
    None
}
fn rrule_interval(rrule: &str) -> i64 {
    rrule
        .split(';')
        .find_map(|p| {
            p.strip_prefix("INTERVAL=")
                .and_then(|v| v.parse::<i64>().ok())
        })
        .unwrap_or(1)
        .max(1)
}
fn rrule_with_until(rrule: &str, until_ts: i64) -> String {
    let mut parts: Vec<String> = rrule
        .split(';')
        .filter(|p| !p.trim().is_empty() && !p.starts_with("UNTIL="))
        .map(str::to_string)
        .collect();
    let until = chrono::Utc
        .timestamp_opt(until_ts, 0)
        .single()
        .map(|d| d.format("%Y%m%dT%H%M%SZ").to_string())
        .unwrap_or_default();
    if !until.is_empty() {
        parts.push(format!("UNTIL={until}"));
    }
    parts.join(";")
}
fn expand_event(event: CalendarEvent, start_ts: i64, end_ts: i64) -> Vec<CalendarEvent> {
    if event.rrule.trim().is_empty() {
        return if event.start_ts < end_ts && event.end_ts > start_ts {
            vec![event]
        } else {
            Vec::new()
        };
    }
    let freq = event
        .rrule
        .split(';')
        .find_map(|p| p.strip_prefix("FREQ="))
        .unwrap_or("");
    let interval = rrule_interval(&event.rrule);
    let duration = (event.end_ts - event.start_ts).max(60);
    let mut out = Vec::new();
    let Some(mut dt) = Local.timestamp_opt(event.start_ts, 0).single() else {
        return out;
    };
    let until = event
        .rrule
        .split(';')
        .find_map(|p| p.strip_prefix("UNTIL="))
        .and_then(parse_ics_datetime)
        .unwrap_or(end_ts);
    for occurrence in 0..1000 {
        let ts = dt.timestamp();
        if ts > end_ts || ts > until {
            break;
        }
        if ts + duration > start_ts && ts < end_ts {
            let mut e = event.clone();
            e.start_ts = ts;
            e.end_ts = ts + duration;
            if occurrence > 0 {
                e.id = -event.id;
                e.uid = format!("{}#{}", event.uid, occurrence);
            }
            out.push(e)
        }
        dt = match freq {
            "DAILY" => dt + ChronoDuration::days(interval),
            "WEEKLY" => dt + ChronoDuration::weeks(interval),
            "MONTHLY" => dt
                .checked_add_months(chrono::Months::new(interval as u32))
                .unwrap_or(dt + ChronoDuration::days(30 * interval)),
            "YEARLY" => dt
                .checked_add_months(chrono::Months::new((12 * interval) as u32))
                .unwrap_or(dt + ChronoDuration::days(365 * interval)),
            _ => break,
        };
    }
    out
}
fn ics_value(ics: &str, key: &str) -> Option<String> {
    for raw in ics.lines() {
        let line = raw.trim_end_matches('\r');
        if let Some((left, right)) = line.split_once(':') {
            if left
                .split(';')
                .next()
                .unwrap_or("")
                .eq_ignore_ascii_case(key)
            {
                return Some(right.replace("\\n", "\n").replace("\\,", ","));
            }
        }
    }
    None
}
fn parse_ics_times(ics: &str) -> Option<(i64, i64)> {
    let start = ics_value(ics, "DTSTART").and_then(|v| parse_ics_datetime(&v))?;
    let end = ics_value(ics, "DTEND")
        .and_then(|v| parse_ics_datetime(&v))
        .unwrap_or(start + 3600);
    Some((start, end))
}
fn xml_unescape(v: &str) -> String {
    v.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#13;", "\r")
        .replace("&#10;", "\n")
}
fn extract_calendar_payloads(raw: &str) -> Vec<String> {
    if raw.contains("BEGIN:VCALENDAR") {
        if raw.contains("<calendar-data") {
            let mut out = Vec::new();
            let mut rest = raw;
            while let Some(pos) = rest.find("<calendar-data") {
                rest = &rest[pos..];
                let Some(gt) = rest.find('>') else { break };
                rest = &rest[gt + 1..];
                let Some(end) = rest.find("</") else { break };
                out.push(xml_unescape(&rest[..end]));
                rest = &rest[end..];
            }
            if !out.is_empty() {
                return out;
            }
        }
        return vec![raw.to_string()];
    }
    Vec::new()
}
fn parse_ics_events(calendar_id: i64, raw: &str) -> Vec<CalendarEvent> {
    let mut out = Vec::new();
    for part in raw.split("BEGIN:VEVENT").skip(1) {
        let body = part.split("END:VEVENT").next().unwrap_or(part);
        let Some((start, end)) = parse_ics_times(body) else {
            continue;
        };
        out.push(CalendarEvent {
            id: 0,
            calendar_id,
            uid: ics_value(body, "UID").unwrap_or_else(|| Uuid::new_v4().to_string()),
            title: ics_value(body, "SUMMARY").unwrap_or_else(|| "Evento".into()),
            description: ics_value(body, "DESCRIPTION").unwrap_or_default(),
            location: ics_value(body, "LOCATION").unwrap_or_default(),
            start_ts: start,
            end_ts: end,
            all_day: false,
            attendees: String::new(),
            status: ics_value(body, "STATUS").unwrap_or_else(|| "CONFIRMED".into()),
            rrule: ics_value(body, "RRULE").unwrap_or_default(),
            source_message_id: None,
            video_url: String::new(),
            timezone: String::new(),
        });
    }
    out
}
fn calendar_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(StdDuration::from_secs(25))
        .build()
        .map_err(|e| e.to_string())
}
fn calendar_auth(
    req: reqwest::blocking::RequestBuilder,
    source: &CalendarSource,
) -> reqwest::blocking::RequestBuilder {
    if source.username.trim().is_empty() {
        return req;
    }
    match SecretStore::lookup_password(&format!("caldav:{}", source.id)) {
        Ok(pw) => req.basic_auth(&source.username, Some(pw)),
        Err(_) => req,
    }
}
fn checked_text(resp: reqwest::blocking::Response, label: &str) -> Result<String, String> {
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if status.is_success() {
        Ok(text)
    } else {
        Err(format!(
            "{label} HTTP {}: {}",
            status.as_u16(),
            text.chars().take(400).collect::<String>()
        ))
    }
}
fn fetch_source(source: &CalendarSource) -> Result<String, String> {
    let client = calendar_client()?;
    if source.kind == "caldav" {
        let method = reqwest::Method::from_bytes(b"REPORT").map_err(|e| e.to_string())?;
        let body = r#"<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop></d:propfind>"#;
        let req = client
            .request(method, &source.url)
            .header("Depth", "1")
            .header("Content-Type", "application/xml; charset=utf-8")
            .body(body);
        checked_text(
            calendar_auth(req, source)
                .send()
                .map_err(|e| format!("CalDAV: {e}"))?,
            "CalDAV",
        )
    } else {
        checked_text(
            calendar_auth(client.get(&source.url), source)
                .send()
                .map_err(|e| format!("Calendário HTTP: {e}"))?,
            "Calendário",
        )
    }
}
fn format_ics_ts(ts: i64) -> String {
    Local
        .timestamp_opt(ts, 0)
        .single()
        .unwrap_or_else(Local::now)
        .format("%Y%m%dT%H%M%S")
        .to_string()
}
fn event_to_ics(e: &CalendarEvent) -> String {
    format!("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TCS Mail//Calendar//PT-BR\r\nBEGIN:VEVENT\r\nUID:{}\r\nDTSTART:{}\r\nDTEND:{}\r\nSUMMARY:{}\r\nDESCRIPTION:{}\r\nLOCATION:{}\r\nSTATUS:{}\r\n{}END:VEVENT\r\nEND:VCALENDAR\r\n",e.uid,format_ics_ts(e.start_ts),format_ics_ts(e.end_ts),e.title.replace(['\r','\n']," "),e.description.replace('\n',"\\n"),e.location.replace(['\r','\n']," "),e.status,if e.rrule.is_empty(){String::new()}else{format!("RRULE:{}\r\n",e.rrule)})
}
fn push_event(source: &CalendarSource, event: &CalendarEvent) -> Result<(), String> {
    let target = format!(
        "{}/{}.ics",
        source.url.trim_end_matches('/'),
        event.uid.replace('/', "_")
    );
    let req = calendar_client()?
        .put(target)
        .header("Content-Type", "text/calendar; charset=utf-8")
        .body(event_to_ics(event));
    let resp = calendar_auth(req, source)
        .send()
        .map_err(|e| format!("CalDAV PUT: {e}"))?;
    let status = resp.status();
    if status.is_success() {
        Ok(())
    } else {
        Err(format!("CalDAV PUT HTTP {}", status.as_u16()))
    }
}
fn delete_remote_event(source: &CalendarSource, uid: &str) -> Result<(), String> {
    let target = format!(
        "{}/{}.ics",
        source.url.trim_end_matches('/'),
        uid.replace('/', "_")
    );
    let resp = calendar_auth(calendar_client()?.delete(target), source)
        .send()
        .map_err(|e| format!("CalDAV DELETE: {e}"))?;
    let status = resp.status();
    if status.is_success() || status.as_u16() == 404 {
        Ok(())
    } else {
        Err(format!("CalDAV DELETE HTTP {}", status.as_u16()))
    }
}

fn rule_query_tokens(query: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quoted = false;
    for ch in query.chars() {
        match ch {
            '"' => quoted = !quoted,
            ' ' | '\t' if !quoted => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            _ => cur.push(ch),
        }
    }
    if !cur.is_empty() {
        out.push(cur)
    }
    out
}
fn rule_query_matches(m: &MessageSummary, query: &str) -> bool {
    rule_query_tokens(query).iter().all(|token| {
        if let Some(v) = token.strip_prefix("from:") {
            return format!("{} {}", m.from_email, m.from_name)
                .to_ascii_lowercase()
                .contains(&v.to_ascii_lowercase());
        }
        if let Some(v) = token.strip_prefix("to:") {
            return m
                .to_text
                .to_ascii_lowercase()
                .contains(&v.to_ascii_lowercase());
        }
        if let Some(v) = token.strip_prefix("cc:") {
            return m
                .cc_text
                .to_ascii_lowercase()
                .contains(&v.to_ascii_lowercase());
        }
        if let Some(v) = token.strip_prefix("subject:") {
            return m
                .subject
                .to_ascii_lowercase()
                .contains(&v.trim_matches('"').to_ascii_lowercase());
        }
        if token == "is:unread" {
            return m.unread;
        }
        if token == "is:read" {
            return !m.unread;
        }
        if token == "is:starred" {
            return m.starred;
        }
        if token == "is:pinned" {
            return m.pinned;
        }
        if token == "is:priority" {
            return m.priority;
        }
        if token == "is:spam" {
            return m.spam;
        }
        if token == "has:attachment" {
            return m.has_attachments;
        }
        if token == "has:noattachment" {
            return !m.has_attachments;
        }
        let hay = format!(
            "{} {} {} {} {} {}",
            m.from_email, m.from_name, m.subject, m.to_text, m.cc_text, m.body_text
        )
        .to_ascii_lowercase();
        hay.contains(&token.to_ascii_lowercase())
    })
}
impl Database {
    pub fn list_contacts(&self, query: &str, limit: usize) -> rusqlite::Result<Vec<Contact>> {
        let c = self.conn()?;
        let like = format!("%{}%", query.trim());
        let mut s=c.prepare("SELECT id,name,email,frequency,last_seen_ts,carddav_source_id,COALESCE(remote_href,''),COALESCE(dirty,0) FROM contacts WHERE ?1='' OR name LIKE ?2 OR email LIKE ?2 ORDER BY frequency DESC,last_seen_ts DESC LIMIT ?3")?;
        let rows = s.query_map(params![query.trim(), like, limit as i64], |r| {
            Ok(Contact {
                id: r.get(0)?,
                name: r.get(1)?,
                email: r.get(2)?,
                frequency: r.get(3)?,
                last_seen_ts: r.get(4)?,
                carddav_source_id: r.get(5)?,
                remote_href: r.get(6)?,
                dirty: r.get::<_, i64>(7)? != 0,
            })
        })?;
        rows.collect()
    }
    pub fn save_contact(&self, name: &str, email: &str) -> rusqlite::Result<()> {
        self.save_contact_v2(name, email, None)
    }
    pub fn save_contact_v2(
        &self,
        name: &str,
        email: &str,
        source_id: Option<i64>,
    ) -> rusqlite::Result<()> {
        self.conn()?.execute("INSERT INTO contacts(name,email,frequency,last_seen_ts,carddav_source_id,dirty) VALUES(?1,?2,1,?3,?4,1) ON CONFLICT(email) DO UPDATE SET name=excluded.name,last_seen_ts=excluded.last_seen_ts,carddav_source_id=COALESCE(excluded.carddav_source_id,contacts.carddav_source_id),dirty=1",params![name.trim(),email.trim(),Local::now().timestamp(),source_id])?;
        Ok(())
    }
    pub fn delete_contact(&self, id: i64) -> rusqlite::Result<()> {
        self.conn()?
            .execute("DELETE FROM contacts WHERE id=?1", params![id])?;
        Ok(())
    }
    pub fn list_contact_sources(&self) -> rusqlite::Result<Vec<ContactSource>> {
        let c = self.conn()?;
        let mut s=c.prepare("SELECT id,name,url,username,enabled,last_sync_ts FROM contact_sources_v2 ORDER BY name")?;
        let rows = s.query_map([], |r| {
            Ok(ContactSource {
                id: r.get(0)?,
                name: r.get(1)?,
                url: r.get(2)?,
                username: r.get(3)?,
                enabled: r.get::<_, i64>(4)? != 0,
                last_sync_ts: r.get(5)?,
            })
        })?;
        rows.collect()
    }
    pub fn save_contact_source(&self, v: &ContactSource) -> rusqlite::Result<i64> {
        let c = self.conn()?;
        if v.id > 0 {
            c.execute(
                "UPDATE contact_sources_v2 SET name=?2,url=?3,username=?4,enabled=?5 WHERE id=?1",
                params![v.id, v.name, v.url, v.username, v.enabled as i64],
            )?;
            Ok(v.id)
        } else {
            c.execute("INSERT INTO contact_sources_v2(name,url,username,enabled,last_sync_ts) VALUES(?1,?2,?3,?4,0)",params![v.name,v.url,v.username,v.enabled as i64])?;
            Ok(c.last_insert_rowid())
        }
    }
    pub fn delete_contact_source(&self, id: i64) -> rusqlite::Result<()> {
        let c = self.conn()?;
        c.execute("UPDATE contacts SET carddav_source_id=NULL,remote_href='',remote_etag='',dirty=0 WHERE carddav_source_id=?1",params![id])?;
        c.execute("DELETE FROM contact_sources_v2 WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn list_identities(&self, account_id: Option<i64>) -> rusqlite::Result<Vec<Identity>> {
        let c = self.conn()?;
        let mut s=c.prepare("SELECT id,account_id,name,email,signature_id,is_default FROM identities WHERE ?1 IS NULL OR account_id=?1 ORDER BY is_default DESC,name")?;
        let rows = s.query_map(params![account_id], |r| {
            Ok(Identity {
                id: r.get(0)?,
                account_id: r.get(1)?,
                name: r.get(2)?,
                email: r.get(3)?,
                signature_id: r.get(4)?,
                is_default: r.get::<_, i64>(5)? != 0,
            })
        })?;
        rows.collect()
    }
    pub fn save_identity(&self, v: &Identity) -> rusqlite::Result<i64> {
        let c = self.conn()?;
        if v.is_default {
            c.execute(
                "UPDATE identities SET is_default=0 WHERE account_id=?1",
                params![v.account_id],
            )?;
        }
        if v.id > 0 {
            c.execute(
                "UPDATE identities SET name=?2,email=?3,signature_id=?4,is_default=?5 WHERE id=?1",
                params![v.id, v.name, v.email, v.signature_id, v.is_default as i64],
            )?;
            Ok(v.id)
        } else {
            c.execute("INSERT INTO identities(account_id,name,email,signature_id,is_default) VALUES(?1,?2,?3,?4,?5)",params![v.account_id,v.name,v.email,v.signature_id,v.is_default as i64])?;
            Ok(c.last_insert_rowid())
        }
    }
    pub fn delete_identity(&self, id: i64) -> rusqlite::Result<()> {
        self.conn()?
            .execute("DELETE FROM identities WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn list_rules(&self) -> rusqlite::Result<Vec<MailRule>> {
        let c = self.conn()?;
        let mut s = c.prepare(
            "SELECT id,name,enabled,field,pattern,action,action_value FROM mail_rules ORDER BY id",
        )?;
        let rows = s.query_map([], |r| {
            Ok(MailRule {
                id: r.get(0)?,
                name: r.get(1)?,
                enabled: r.get::<_, i64>(2)? != 0,
                field: r.get(3)?,
                pattern: r.get(4)?,
                action: r.get(5)?,
                action_value: r.get(6)?,
            })
        })?;
        rows.collect()
    }
    pub fn save_rule(&self, v: &MailRule) -> rusqlite::Result<i64> {
        let c = self.conn()?;
        if v.id > 0 {
            c.execute("UPDATE mail_rules SET name=?2,enabled=?3,field=?4,pattern=?5,action=?6,action_value=?7 WHERE id=?1",params![v.id,v.name,v.enabled as i64,v.field,v.pattern,v.action,v.action_value])?;
            Ok(v.id)
        } else {
            c.execute("INSERT INTO mail_rules(name,enabled,field,pattern,action,action_value) VALUES(?1,?2,?3,?4,?5,?6)",params![v.name,v.enabled as i64,v.field,v.pattern,v.action,v.action_value])?;
            Ok(c.last_insert_rowid())
        }
    }
    pub fn delete_rule(&self, id: i64) -> rusqlite::Result<()> {
        self.conn()?
            .execute("DELETE FROM mail_rules WHERE id=?1", params![id])?;
        Ok(())
    }
    pub fn queue_rule_actions_for_message(&self, m: &MessageSummary) -> rusqlite::Result<usize> {
        let rules = self.list_rules()?;
        let mut n = 0;
        for r in rules.into_iter().filter(|r| r.enabled) {
            let matches = if r.field == "query" {
                rule_query_matches(m, &r.pattern)
            } else {
                let hay = match r.field.as_str() {
                    "subject" => m.subject.as_str(),
                    "to" => m.to_text.as_str(),
                    "cc" => m.cc_text.as_str(),
                    "body" => m.body_text.as_str(),
                    "any" => "",
                    _ => m.from_email.as_str(),
                };
                if r.field == "any" {
                    format!(
                        "{} {} {} {} {}",
                        m.from_email, m.from_name, m.subject, m.to_text, m.body_text
                    )
                    .to_ascii_lowercase()
                    .contains(&r.pattern.to_ascii_lowercase())
                } else {
                    hay.to_ascii_lowercase()
                        .contains(&r.pattern.to_ascii_lowercase())
                }
            };
            if matches {
                self.conn()?.execute("INSERT OR IGNORE INTO rule_action_queue(message_id,action,action_value,created_ts) VALUES(?1,?2,?3,?4)",params![m.id,r.action,r.action_value,Local::now().timestamp()])?;
                n += 1;
            }
        }
        Ok(n)
    }
    pub fn take_rule_actions(
        &self,
        limit: usize,
    ) -> rusqlite::Result<Vec<(i64, i64, String, String)>> {
        let c = self.conn()?;
        let mut s = c.prepare(
            "SELECT id,message_id,action,action_value FROM rule_action_queue ORDER BY id LIMIT ?1",
        )?;
        let rows = s.query_map(params![limit as i64], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
        })?;
        rows.collect()
    }
    pub fn delete_rule_action(&self, id: i64) -> rusqlite::Result<()> {
        self.conn()?
            .execute("DELETE FROM rule_action_queue WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn list_saved_searches(&self) -> rusqlite::Result<Vec<SavedSearch>> {
        let c = self.conn()?;
        let mut s = c.prepare("SELECT id,name,query FROM saved_searches ORDER BY name")?;
        let rows = s.query_map([], |r| {
            Ok(SavedSearch {
                id: r.get(0)?,
                name: r.get(1)?,
                query: r.get(2)?,
            })
        })?;
        rows.collect()
    }
    pub fn save_saved_search(&self, name: &str, query: &str) -> rusqlite::Result<()> {
        self.conn()?.execute("INSERT INTO saved_searches(name,query) VALUES(?1,?2) ON CONFLICT(name) DO UPDATE SET query=excluded.query",params![name.trim(),query.trim()])?;
        Ok(())
    }
    pub fn delete_saved_search(&self, id: i64) -> rusqlite::Result<()> {
        self.conn()?
            .execute("DELETE FROM saved_searches WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn snooze_message(&self, message_id: i64, until_ts: i64) -> rusqlite::Result<()> {
        let c = self.conn()?;
        let folder: String = c.query_row(
            "SELECT folder FROM messages WHERE id=?1",
            params![message_id],
            |r| r.get(0),
        )?;
        c.execute("INSERT INTO snoozes(message_id,until_ts,original_folder) VALUES(?1,?2,?3) ON CONFLICT(message_id) DO UPDATE SET until_ts=excluded.until_ts,original_folder=excluded.original_folder",params![message_id,until_ts,folder])?;
        Ok(())
    }
    pub fn unsnooze_message(&self, message_id: i64) -> rusqlite::Result<()> {
        self.conn()?.execute(
            "DELETE FROM snoozes WHERE message_id=?1",
            params![message_id],
        )?;
        Ok(())
    }
    pub fn set_aside_message(&self, message_id: i64, on: bool) -> rusqlite::Result<()> {
        let c = self.conn()?;
        if on {
            c.execute("INSERT INTO set_aside(message_id,created_ts) VALUES(?1,?2) ON CONFLICT(message_id) DO NOTHING",params![message_id,Local::now().timestamp()])?;
        } else {
            c.execute(
                "DELETE FROM set_aside WHERE message_id=?1",
                params![message_id],
            )?;
        }
        Ok(())
    }

    pub fn add_follow_up(
        &self,
        account_id: i64,
        recipient: &str,
        subject: &str,
        due_ts: i64,
        note: &str,
    ) -> rusqlite::Result<i64> {
        let key = normalize_subject(subject);
        let c = self.conn()?;
        c.execute("INSERT INTO follow_ups(account_id,recipient,subject_key,due_ts,created_ts,state,note) VALUES(?1,?2,?3,?4,?5,'pending',?6)",params![account_id,recipient.trim().to_ascii_lowercase(),key,due_ts,Local::now().timestamp(),note])?;
        Ok(c.last_insert_rowid())
    }
    pub fn list_follow_ups(&self) -> rusqlite::Result<Vec<FollowUp>> {
        let c = self.conn()?;
        let mut s=c.prepare("SELECT id,account_id,recipient,subject_key,due_ts,created_ts,state,note FROM follow_ups ORDER BY CASE state WHEN 'pending' THEN 0 WHEN 'notified' THEN 1 ELSE 2 END,due_ts")?;
        let rows = s.query_map([], |r| {
            Ok(FollowUp {
                id: r.get(0)?,
                account_id: r.get(1)?,
                recipient: r.get(2)?,
                subject_key: r.get(3)?,
                due_ts: r.get(4)?,
                created_ts: r.get(5)?,
                state: r.get(6)?,
                note: r.get(7)?,
            })
        })?;
        rows.collect()
    }
    pub fn cancel_follow_up(&self, id: i64) -> rusqlite::Result<()> {
        self.conn()?.execute(
            "UPDATE follow_ups SET state='cancelled' WHERE id=?1",
            params![id],
        )?;
        Ok(())
    }
    pub fn process_follow_ups(&self, now: i64) -> rusqlite::Result<Vec<String>> {
        let rows = self.list_follow_ups()?;
        let mut notes = Vec::new();
        for f in rows.into_iter().filter(|f| f.state == "pending") {
            let messages = self
                .list_messages(Some(f.account_id), "*", None, 1500)
                .unwrap_or_default();
            let answered = messages.iter().any(|m| {
                m.date.timestamp() > f.created_ts
                    && m.from_email.to_ascii_lowercase().contains(&f.recipient)
                    && normalize_subject(&m.subject) == f.subject_key
            });
            if answered {
                self.conn()?.execute(
                    "UPDATE follow_ups SET state='answered' WHERE id=?1",
                    params![f.id],
                )?;
            } else if f.due_ts <= now {
                self.conn()?.execute(
                    "UPDATE follow_ups SET state='notified' WHERE id=?1",
                    params![f.id],
                )?;
                notes.push(format!("Follow-up pendente: {}", f.subject_key));
            }
        }
        Ok(notes)
    }

    pub fn list_calendars(&self) -> rusqlite::Result<Vec<CalendarInfo>> {
        let c = self.conn()?;
        let mut s =
            c.prepare("SELECT id,name,color,visible,read_only FROM calendars ORDER BY id")?;
        let rows = s.query_map([], |r| {
            Ok(CalendarInfo {
                id: r.get(0)?,
                name: r.get(1)?,
                color: r.get(2)?,
                visible: r.get::<_, i64>(3)? != 0,
                read_only: r.get::<_, i64>(4)? != 0,
            })
        })?;
        rows.collect()
    }
    pub fn save_calendar(&self, v: &CalendarInfo) -> rusqlite::Result<i64> {
        let c = self.conn()?;
        if v.id > 0 {
            c.execute(
                "UPDATE calendars SET name=?2,color=?3,visible=?4,read_only=?5 WHERE id=?1",
                params![v.id, v.name, v.color, v.visible as i64, v.read_only as i64],
            )?;
            Ok(v.id)
        } else {
            c.execute(
                "INSERT INTO calendars(name,color,visible,read_only) VALUES(?1,?2,?3,?4)",
                params![v.name, v.color, v.visible as i64, v.read_only as i64],
            )?;
            Ok(c.last_insert_rowid())
        }
    }
    pub fn delete_calendar(&self, id: i64) -> rusqlite::Result<()> {
        self.conn()?
            .execute("DELETE FROM calendars WHERE id=?1", params![id])?;
        Ok(())
    }
    pub fn list_events(&self, start: i64, end: i64) -> rusqlite::Result<Vec<CalendarEvent>> {
        let c = self.conn()?;
        let mut st=c.prepare("SELECT e.id,e.calendar_id,e.uid,e.title,e.description,e.location,e.start_ts,e.end_ts,e.all_day,e.attendees,e.status,e.rrule,e.source_message_id,e.video_url,e.timezone FROM calendar_events e JOIN calendars c ON c.id=e.calendar_id WHERE c.visible=1 AND upper(e.status)<>'CANCELLED' AND ((e.start_ts<?2 AND e.end_ts>?1) OR e.rrule<>'') ORDER BY e.start_ts")?;
        let base: Vec<CalendarEvent> = st
            .query_map(params![start, end], row_event)?
            .collect::<rusqlite::Result<_>>()?;
        drop(st);
        let mut out = Vec::new();
        for event in base {
            let base_id = event.id;
            for mut occurrence in expand_event(event, start, end) {
                let original = occurrence.start_ts;
                let ex:Option<CalendarExceptionRow>=c.query_row("SELECT cancelled,override_start_ts,override_end_ts,override_title FROM calendar_event_exceptions WHERE event_id=?1 AND occurrence_ts=?2",params![base_id,original],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional()?;
                if let Some((cancelled, ns, ne, nt)) = ex {
                    if cancelled != 0 {
                        continue;
                    }
                    if let Some(v) = ns {
                        occurrence.start_ts = v
                    }
                    if let Some(v) = ne {
                        occurrence.end_ts = v
                    }
                    if let Some(v) = nt {
                        occurrence.title = v
                    }
                }
                out.push(occurrence)
            }
        }
        out.sort_by_key(|e| e.start_ts);
        Ok(out)
    }
    pub fn save_event(&self, v: &CalendarEvent) -> rusqlite::Result<i64> {
        if v.end_ts <= v.start_ts {
            return Err(rusqlite::Error::InvalidParameterName("event end".into()));
        }
        let c = self.conn()?;
        if v.id > 0 {
            c.execute("UPDATE calendar_events SET calendar_id=?2,uid=?3,title=?4,description=?5,location=?6,start_ts=?7,end_ts=?8,all_day=?9,attendees=?10,status=?11,rrule=?12,source_message_id=?13,video_url=?14,timezone=?15 WHERE id=?1",params![v.id,v.calendar_id,v.uid,v.title,v.description,v.location,v.start_ts,v.end_ts,v.all_day as i64,v.attendees,v.status,v.rrule,v.source_message_id,v.video_url,v.timezone])?;
            Ok(v.id)
        } else {
            let uid = if v.uid.trim().is_empty() {
                Uuid::new_v4().to_string()
            } else {
                v.uid.clone()
            };
            c.execute("INSERT INTO calendar_events(calendar_id,uid,title,description,location,start_ts,end_ts,all_day,attendees,status,rrule,source_message_id,video_url,timezone) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",params![v.calendar_id,uid,v.title,v.description,v.location,v.start_ts,v.end_ts,v.all_day as i64,v.attendees,v.status,v.rrule,v.source_message_id,v.video_url,v.timezone])?;
            Ok(c.last_insert_rowid())
        }
    }
    pub fn split_event_series(&self, id: i64, occurrence_ts: i64) -> rusqlite::Result<i64> {
        let c = self.conn()?;
        let base:CalendarEvent=c.query_row("SELECT id,calendar_id,uid,title,description,location,start_ts,end_ts,all_day,attendees,status,rrule,source_message_id,video_url,timezone FROM calendar_events WHERE id=?1",params![id],row_event)?;
        if base.rrule.trim().is_empty() {
            return Ok(id);
        }
        let duration = (base.end_ts - base.start_ts).max(60);
        let old_rule = rrule_with_until(&base.rrule, occurrence_ts - 1);
        c.execute(
            "UPDATE calendar_events SET rrule=?2 WHERE id=?1",
            params![id, old_rule],
        )?;
        let mut future = base.clone();
        future.id = 0;
        future.uid = Uuid::new_v4().to_string();
        future.start_ts = occurrence_ts;
        future.end_ts = occurrence_ts + duration;
        future.rrule = base.rrule;
        self.save_event(&future)
    }
    pub fn delete_event(&self, id: i64) -> rusqlite::Result<()> {
        let c = self.conn()?;
        let event: Option<(i64, String)> = c
            .query_row(
                "SELECT calendar_id,uid FROM calendar_events WHERE id=?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        if let Some((calendar_id, uid)) = event {
            let remote:i64=c.query_row("SELECT EXISTS(SELECT 1 FROM calendar_sources WHERE calendar_id=?1 AND kind='caldav')",params![calendar_id],|r|r.get(0))?;
            if remote != 0 {
                c.execute("INSERT INTO calendar_tombstones(calendar_id,uid,deleted_ts) VALUES(?1,?2,?3) ON CONFLICT(calendar_id,uid) DO UPDATE SET deleted_ts=excluded.deleted_ts",params![calendar_id,uid,Local::now().timestamp()])?;
            }
            c.execute("DELETE FROM calendar_events WHERE id=?1", params![id])?;
        }
        Ok(())
    }
    pub fn save_remote_event(&self, e: &CalendarEvent) -> rusqlite::Result<Option<i64>> {
        let c = self.conn()?;
        let tomb: i64 = c.query_row(
            "SELECT EXISTS(SELECT 1 FROM calendar_tombstones WHERE calendar_id=?1 AND uid=?2)",
            params![e.calendar_id, e.uid],
            |r| r.get(0),
        )?;
        drop(c);
        if tomb != 0 {
            return Ok(None);
        }
        self.save_event(e).map(Some)
    }
    pub fn list_tombstones(&self, calendar_id: i64) -> rusqlite::Result<Vec<String>> {
        let c = self.conn()?;
        let mut st = c.prepare("SELECT uid FROM calendar_tombstones WHERE calendar_id=?1")?;
        let rows = st.query_map(params![calendar_id], |r| r.get(0))?;
        rows.collect()
    }
    pub fn clear_tombstone(&self, calendar_id: i64, uid: &str) -> rusqlite::Result<()> {
        self.conn()?.execute(
            "DELETE FROM calendar_tombstones WHERE calendar_id=?1 AND uid=?2",
            params![calendar_id, uid],
        )?;
        Ok(())
    }
    pub fn set_source_synced(&self, id: i64) -> rusqlite::Result<()> {
        self.conn()?.execute(
            "UPDATE calendar_sources SET last_sync_ts=?2 WHERE id=?1",
            params![id, Local::now().timestamp()],
        )?;
        Ok(())
    }
    pub fn cancel_event_occurrence(
        &self,
        event_id: i64,
        occurrence_ts: i64,
    ) -> rusqlite::Result<()> {
        self.conn()?.execute("INSERT INTO calendar_event_exceptions(event_id,occurrence_ts,cancelled) VALUES(?1,?2,1) ON CONFLICT(event_id,occurrence_ts) DO UPDATE SET cancelled=1",params![event_id,occurrence_ts])?;
        Ok(())
    }
    pub fn override_event_occurrence(
        &self,
        event_id: i64,
        occurrence_ts: i64,
        title: &str,
        start_ts: i64,
        end_ts: i64,
    ) -> rusqlite::Result<()> {
        if end_ts <= start_ts {
            return Err(rusqlite::Error::InvalidParameterName("event end".into()));
        }
        self.conn()?.execute("INSERT INTO calendar_event_exceptions(event_id,occurrence_ts,cancelled,override_start_ts,override_end_ts,override_title) VALUES(?1,?2,0,?3,?4,?5) ON CONFLICT(event_id,occurrence_ts) DO UPDATE SET cancelled=0,override_start_ts=excluded.override_start_ts,override_end_ts=excluded.override_end_ts,override_title=excluded.override_title",params![event_id,occurrence_ts,start_ts,end_ts,title])?;
        Ok(())
    }
    pub fn add_reminder(&self, event_id: i64, minutes: i64) -> rusqlite::Result<()> {
        self.conn()?.execute("INSERT INTO calendar_reminders(event_id,minutes_before,last_fired_ts) VALUES(?1,?2,0) ON CONFLICT(event_id,minutes_before) DO NOTHING",params![event_id,minutes])?;
        Ok(())
    }
    pub fn due_reminders(&self, now: i64) -> rusqlite::Result<Vec<(i64, String, i64)>> {
        let c = self.conn()?;
        let mut st =
            c.prepare("SELECT id,event_id,minutes_before,last_fired_ts FROM calendar_reminders")?;
        let reminders: Vec<(i64, i64, i64, i64)> = st
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
            .collect::<rusqlite::Result<_>>()?;
        drop(st);
        drop(c);
        let occ = self.list_events(now - 2 * 86400, now + 2 * 86400)?;
        let mut out = Vec::new();
        for (rid, eid, min, last) in reminders {
            for e in occ.iter().filter(|e| e.id.abs() == eid) {
                let fire = e.start_ts - min * 60;
                if fire <= now && fire > last && e.start_ts >= now - 300 {
                    out.push((rid, e.title.clone(), e.start_ts));
                    break;
                }
            }
        }
        Ok(out)
    }
    pub fn mark_reminder_fired(&self, id: i64, ts: i64) -> rusqlite::Result<()> {
        self.conn()?.execute(
            "UPDATE calendar_reminders SET last_fired_ts=?2 WHERE id=?1",
            params![id, ts],
        )?;
        Ok(())
    }
    pub fn event_conflicts(
        &self,
        start: i64,
        end: i64,
        ignore: Option<i64>,
    ) -> rusqlite::Result<Vec<CalendarEvent>> {
        let c = self.conn()?;
        let mut s=c.prepare("SELECT id,calendar_id,uid,title,description,location,start_ts,end_ts,all_day,attendees,status,rrule,source_message_id,video_url,timezone FROM calendar_events WHERE end_ts>?1 AND start_ts<?2 AND (?3 IS NULL OR id<>?3) ORDER BY start_ts")?;
        let rows = s.query_map(params![start, end, ignore], row_event)?;
        rows.collect()
    }
    pub fn list_sources(&self) -> rusqlite::Result<Vec<CalendarSource>> {
        let c = self.conn()?;
        let mut s=c.prepare("SELECT id,calendar_id,kind,url,username,shared,last_sync_ts FROM calendar_sources ORDER BY id")?;
        let rows = s.query_map([], |r| {
            Ok(CalendarSource {
                id: r.get(0)?,
                calendar_id: r.get(1)?,
                kind: r.get(2)?,
                url: r.get(3)?,
                username: r.get(4)?,
                shared: r.get::<_, i64>(5)? != 0,
                last_sync_ts: r.get(6)?,
            })
        })?;
        rows.collect()
    }
    pub fn save_source(&self, v: &CalendarSource) -> rusqlite::Result<i64> {
        let c = self.conn()?;
        if v.id > 0 {
            c.execute("UPDATE calendar_sources SET calendar_id=?2,kind=?3,url=?4,username=?5,shared=?6 WHERE id=?1",params![v.id,v.calendar_id,v.kind,v.url,v.username,v.shared as i64])?;
            Ok(v.id)
        } else {
            c.execute("INSERT INTO calendar_sources(calendar_id,kind,url,username,shared,last_sync_ts) VALUES(?1,?2,?3,?4,?5,0)",params![v.calendar_id,v.kind,v.url,v.username,v.shared as i64])?;
            Ok(c.last_insert_rowid())
        }
    }
    pub fn delete_source(&self, id: i64) -> rusqlite::Result<()> {
        self.conn()?
            .execute("DELETE FROM calendar_sources WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn list_tasks(&self) -> rusqlite::Result<Vec<Task>> {
        let c = self.conn()?;
        let mut s=c.prepare("SELECT id,title,notes,due_ts,completed,source_message_id,COALESCE(priority,0),COALESCE(rrule,''),reminder_ts FROM tasks ORDER BY completed,due_ts IS NULL,due_ts")?;
        let rows = s.query_map([], |r| {
            Ok(Task {
                id: r.get(0)?,
                title: r.get(1)?,
                notes: r.get(2)?,
                due_ts: r.get(3)?,
                completed: r.get::<_, i64>(4)? != 0,
                source_message_id: r.get(5)?,
                priority: r.get(6)?,
                rrule: r.get(7)?,
                reminder_ts: r.get(8)?,
            })
        })?;
        rows.collect()
    }
    pub fn save_task_v2(&self, v: &Task) -> rusqlite::Result<i64> {
        if v.title.trim().is_empty() {
            return Err(rusqlite::Error::InvalidParameterName("task title".into()));
        }
        let c = self.conn()?;
        if v.id > 0 {
            c.execute("UPDATE tasks SET title=?2,notes=?3,due_ts=?4,completed=?5,source_message_id=?6,priority=?7,rrule=?8,reminder_ts=?9 WHERE id=?1",params![v.id,v.title.trim(),v.notes,v.due_ts,v.completed as i64,v.source_message_id,v.priority,v.rrule,v.reminder_ts])?;
            Ok(v.id)
        } else {
            c.execute("INSERT INTO tasks(title,notes,due_ts,completed,source_message_id,priority,rrule,reminder_ts) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",params![v.title.trim(),v.notes,v.due_ts,v.completed as i64,v.source_message_id,v.priority,v.rrule,v.reminder_ts])?;
            Ok(c.last_insert_rowid())
        }
    }
    pub fn delete_task(&self, id: i64) -> rusqlite::Result<()> {
        self.conn()?
            .execute("DELETE FROM tasks WHERE id=?1", params![id])?;
        Ok(())
    }
    pub fn set_task_completed(&self, id: i64, done: bool) -> rusqlite::Result<()> {
        let c = self.conn()?;
        if done {
            let task:Option<Task>=c.query_row("SELECT id,title,notes,due_ts,completed,source_message_id,COALESCE(priority,0),COALESCE(rrule,''),reminder_ts FROM tasks WHERE id=?1",params![id],|r|Ok(Task{id:r.get(0)?,title:r.get(1)?,notes:r.get(2)?,due_ts:r.get(3)?,completed:r.get::<_,i64>(4)?!=0,source_message_id:r.get(5)?,priority:r.get(6)?,rrule:r.get(7)?,reminder_ts:r.get(8)?})).optional()?;
            c.execute("UPDATE tasks SET completed=1 WHERE id=?1", params![id])?;
            if let Some(t) = task {
                if !t.rrule.trim().is_empty() {
                    if let Some(due) = t.due_ts {
                        let interval = rrule_interval(&t.rrule);
                        let freq = t
                            .rrule
                            .split(';')
                            .find_map(|p| p.strip_prefix("FREQ="))
                            .unwrap_or("");
                        if let Some(dt) = Local.timestamp_opt(due, 0).single() {
                            let next = match freq {
                                "DAILY" => Some(dt + ChronoDuration::days(interval)),
                                "WEEKLY" => Some(dt + ChronoDuration::weeks(interval)),
                                "MONTHLY" => {
                                    dt.checked_add_months(chrono::Months::new(interval as u32))
                                }
                                "YEARLY" => dt.checked_add_months(chrono::Months::new(
                                    (12 * interval) as u32,
                                )),
                                _ => None,
                            };
                            if let Some(next) = next {
                                let reminder = t.reminder_ts.map(|r| next.timestamp() - (due - r));
                                c.execute("INSERT INTO tasks(title,notes,due_ts,completed,source_message_id,priority,rrule,reminder_ts) VALUES(?1,?2,?3,0,?4,?5,?6,?7)",params![t.title,t.notes,next.timestamp(),t.source_message_id,t.priority,t.rrule,reminder])?;
                            }
                        }
                    }
                }
            }
        } else {
            c.execute("UPDATE tasks SET completed=0 WHERE id=?1", params![id])?;
        }
        Ok(())
    }
    pub fn due_task_reminders(&self, now: i64) -> rusqlite::Result<Vec<(i64, String)>> {
        let c = self.conn()?;
        let mut s=c.prepare("SELECT id,title FROM tasks WHERE completed=0 AND reminder_ts IS NOT NULL AND reminder_ts<=?1 ORDER BY reminder_ts")?;
        let rows = s.query_map(params![now], |r| Ok((r.get(0)?, r.get(1)?)))?;
        rows.collect()
    }
    pub fn mark_task_reminded(&self, id: i64) -> rusqlite::Result<()> {
        self.conn()?
            .execute("UPDATE tasks SET reminder_ts=NULL WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn list_outbound(&self) -> rusqlite::Result<Vec<QueueItem>> {
        let c = self.conn()?;
        let mut s=c.prepare("SELECT id,account_id,draft_json,send_at_ts,state,last_error FROM outbound_queue_v2 ORDER BY created_ts DESC")?;
        let rows = s.query_map([], |r| {
            let raw: String = r.get(2)?;
            let v: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
            Ok(QueueItem {
                id: r.get(0)?,
                account_id: r.get(1)?,
                subject: v
                    .get("subject")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string(),
                to_text: v
                    .get("to")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_string(),
                send_at_ts: r.get(3)?,
                state: r.get(4)?,
                last_error: r.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn setting(&self, key: &str) -> Option<String> {
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
    pub fn set_setting_value(&self, key: &str, value: &str) -> rusqlite::Result<()> {
        self.conn()?.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![key,value])?;
        Ok(())
    }
    pub fn list_contact_groups(&self) -> rusqlite::Result<Vec<(i64, String, i64)>> {
        let c = self.connection()?;
        let mut st=c.prepare("SELECT g.id,g.name,COUNT(m.contact_id) FROM contact_groups g LEFT JOIN contact_group_members m ON m.group_id=g.id GROUP BY g.id,g.name ORDER BY lower(g.name)")?;
        let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
        rows.collect()
    }
    pub fn save_contact_group(&self, id: Option<i64>, name: &str) -> rusqlite::Result<i64> {
        let c = self.connection()?;
        if let Some(id) = id.filter(|x| *x > 0) {
            c.execute(
                "UPDATE contact_groups SET name=?2 WHERE id=?1",
                params![id, name.trim()],
            )?;
            Ok(id)
        } else {
            c.execute(
                "INSERT INTO contact_groups(name) VALUES(?1)",
                params![name.trim()],
            )?;
            Ok(c.last_insert_rowid())
        }
    }
    pub fn delete_contact_group(&self, id: i64) -> rusqlite::Result<()> {
        self.connection()?
            .execute("DELETE FROM contact_groups WHERE id=?1", params![id])?;
        Ok(())
    }
    pub fn set_contact_group_members(
        &self,
        group_id: i64,
        contact_ids: &[i64],
    ) -> rusqlite::Result<()> {
        let mut c = self.connection()?;
        let tx = c.transaction()?;
        tx.execute(
            "DELETE FROM contact_group_members WHERE group_id=?1",
            params![group_id],
        )?;
        for id in contact_ids {
            tx.execute(
                "INSERT OR IGNORE INTO contact_group_members(group_id,contact_id) VALUES(?1,?2)",
                params![group_id, id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn contact_group_member_ids(&self, group_id: i64) -> rusqlite::Result<Vec<i64>> {
        let c = self.connection()?;
        let mut st = c.prepare(
            "SELECT contact_id FROM contact_group_members WHERE group_id=?1 ORDER BY contact_id",
        )?;
        let rows = st.query_map(params![group_id], |r| r.get(0))?;
        rows.collect()
    }
}

pub fn sync_all_calendar_sources(db: &Database) -> Result<usize, String> {
    let mut count = 0;
    for s in db.list_sources().map_err(|e| e.to_string())? {
        if s.kind == "caldav" {
            for uid in db
                .list_tombstones(s.calendar_id)
                .map_err(|e| e.to_string())?
            {
                if delete_remote_event(&s, &uid).is_ok() {
                    db.clear_tombstone(s.calendar_id, &uid)
                        .map_err(|e| e.to_string())?;
                }
            }
        }
        let raw = fetch_source(&s)?;
        for payload in extract_calendar_payloads(&raw) {
            for e in parse_ics_events(s.calendar_id, &payload) {
                if db
                    .save_remote_event(&e)
                    .map_err(|e| e.to_string())?
                    .is_some()
                {
                    count += 1;
                }
            }
        }
        if s.kind == "caldav" {
            let read_only = db
                .list_calendars()
                .unwrap_or_default()
                .into_iter()
                .find(|c| c.id == s.calendar_id)
                .map(|c| c.read_only)
                .unwrap_or(false);
            if !read_only {
                let now = Local::now().timestamp();
                for e in db
                    .list_events(now - 86400, now + 365 * 86400)
                    .unwrap_or_default()
                    .into_iter()
                    .filter(|e| e.calendar_id == s.calendar_id && e.id > 0)
                {
                    let _ = push_event(&s, &e);
                }
            }
        }
        db.set_source_synced(s.id).map_err(|e| e.to_string())?;
    }
    Ok(count)
}

pub fn format_local_ts(ts: i64) -> String {
    Local
        .timestamp_opt(ts, 0)
        .single()
        .map(|d| d.format("%d/%m/%Y %H:%M").to_string())
        .unwrap_or_default()
}
