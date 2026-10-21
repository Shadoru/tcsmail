use chrono::Local;
use rusqlite::params;

use crate::{db::Database, productivity::ContactSource, secrets::SecretStore};

fn xml_unescape(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn tag_value(block: &str, local_name: &str) -> Option<String> {
    for prefix in ["d", "card", "C", "D"] {
        let start = format!("<{prefix}:{local_name}");
        if let Some(pos) = block.find(&start) {
            let rest = &block[pos..];
            let body = rest.find('>')? + 1;
            let end = rest[body..].find(&format!("</{prefix}:{local_name}>"))? + body;
            return Some(xml_unescape(&rest[body..end]));
        }
    }
    None
}

fn vcard_value(card: &str, name: &str) -> Option<String> {
    card.lines().find_map(|line| {
        let (left, value) = line.split_once(':')?;
        if left.split(';').next()?.eq_ignore_ascii_case(name) {
            Some(value.trim().replace("\\n", "\n").replace("\\,", ","))
        } else {
            None
        }
    })
}

fn credential_key(source: &ContactSource) -> String {
    format!("carddav:{}:{}", source.id, source.username)
}

fn dav_request(
    source: &ContactSource,
    password: &str,
    method: &str,
    url: &str,
    headers: &[(&str, &str)],
    body: Option<&str>,
) -> Result<String, String> {
    use reqwest::blocking::Client;
    use reqwest::Method;
    use std::time::Duration;
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let method = Method::from_bytes(method.as_bytes()).map_err(|e| e.to_string())?;
    let mut req = client
        .request(method, url)
        .basic_auth(&source.username, Some(password));
    for (name, value) in headers {
        req = req.header(*name, *value);
    }
    if let Some(body) = body {
        req = req.body(body.to_string());
    }
    let resp = req.send().map_err(|e| format!("CardDAV: {e}"))?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!(
            "CardDAV HTTP {}: {}",
            status.as_u16(),
            text.chars().take(400).collect::<String>()
        ));
    }
    Ok(text)
}

pub fn set_password(source: &ContactSource, password: &str) -> Result<(), String> {
    SecretStore::store_password(&credential_key(source), password).map_err(|e| e.to_string())
}

pub fn clear_password(source: &ContactSource) {
    let _ = SecretStore::clear_password(&credential_key(source));
}

pub fn sync_source(db: &Database, source_id: i64) -> Result<usize, String> {
    let source = db
        .list_contact_sources()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|s| s.id == source_id)
        .ok_or("Fonte CardDAV não encontrada")?;
    if !source.enabled {
        return Ok(0);
    }
    let password =
        SecretStore::lookup_password(&credential_key(&source)).map_err(|e| e.to_string())?;

    let query = r#"<?xml version="1.0" encoding="UTF-8"?><card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:prop><d:getetag/><card:address-data/></d:prop></card:addressbook-query>"#;
    let response = dav_request(
        &source,
        &password,
        "REPORT",
        &source.url,
        &[
            ("Depth", "1"),
            ("Content-Type", "application/xml; charset=utf-8"),
        ],
        Some(query),
    )?;
    let conn = db.connection().map_err(|e| e.to_string())?;
    let mut imported = 0usize;
    for block in response.split("<d:response").skip(1) {
        let href = tag_value(block, "href").unwrap_or_default();
        let etag = tag_value(block, "getetag").unwrap_or_default();
        let Some(card) = tag_value(block, "address-data") else {
            continue;
        };
        let Some(email) = vcard_value(&card, "EMAIL") else {
            continue;
        };
        let name = vcard_value(&card, "FN").unwrap_or_else(|| email.clone());
        conn.execute(
            "INSERT INTO contacts(name,email,frequency,last_seen_ts,carddav_source_id,remote_href,remote_etag,dirty) VALUES(?1,?2,1,?3,?4,?5,?6,0) ON CONFLICT(email) DO UPDATE SET name=excluded.name,last_seen_ts=excluded.last_seen_ts,carddav_source_id=excluded.carddav_source_id,remote_href=excluded.remote_href,remote_etag=excluded.remote_etag,dirty=0",
            params![name,email,Local::now().timestamp(),source.id,href,etag],
        ).map_err(|e|e.to_string())?;
        imported += 1;
    }

    let mut stmt = conn
        .prepare(
            "SELECT id,name,email,remote_href FROM contacts WHERE carddav_source_id=?1 AND dirty=1",
        )
        .map_err(|e| e.to_string())?;
    let dirty = stmt
        .query_map(params![source.id], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);
    for (id, name, email, href) in dirty {
        let href = if href.trim().is_empty() {
            format!("{}.vcf", uuid::Uuid::new_v4())
        } else {
            href
        };
        let target = if href.starts_with("http://") || href.starts_with("https://") {
            href.clone()
        } else {
            format!(
                "{}/{}",
                source.url.trim_end_matches('/'),
                href.trim_start_matches('/')
            )
        };
        let card = format!(
            "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:{}\r\nEMAIL:{}\r\nUID:{}\r\nEND:VCARD\r\n",
            name.replace(['\r', '\n'], " "),
            email.replace(['\r', '\n'], ""),
            id
        );
        dav_request(
            &source,
            &password,
            "PUT",
            &target,
            &[("Content-Type", "text/vcard; charset=utf-8")],
            Some(&card),
        )?;
        conn.execute(
            "UPDATE contacts SET remote_href=?2,dirty=0 WHERE id=?1",
            params![id, href],
        )
        .map_err(|e| e.to_string())?;
    }
    conn.execute(
        "UPDATE contact_sources_v2 SET last_sync_ts=?2 WHERE id=?1",
        params![source.id, Local::now().timestamp()],
    )
    .map_err(|e| e.to_string())?;
    Ok(imported)
}
