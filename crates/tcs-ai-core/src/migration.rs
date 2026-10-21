use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use chrono::Utc;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use sha2::{Digest, Sha256};

use crate::{
    config::{ModelBinding, ProviderConfig, ProviderKind},
    rag::AiStore,
};

pub fn legacy_agent_candidates(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join(".local/share/com.thecreativesolver.TCSMail/agent/agent.db"),
        home.join("Library/Application Support/TCS Mail/Agent/agent.db"),
        home.join("AppData/Local/TCS Mail/Agent/agent.db"),
    ]
}

pub fn import_legacy_agent(store: &AiStore, home: &Path) -> Result<Vec<String>, String> {
    store.ensure_default_provider()?;
    let mut imported = Vec::new();
    for old_path in legacy_agent_candidates(home) {
        if !old_path.is_file() {
            continue;
        }
        let key = format!("python-agent:{}", old_path.display());
        let c = store.conn()?;
        if c.query_row(
            "SELECT 1 FROM ai_migration_log WHERE key=?1",
            params![key],
            |row| row.get::<_, i64>(0),
        )
        .is_ok()
        {
            continue;
        }
        drop(c);

        // Read-only by design: the legacy Agent remains untouched until the user explicitly purges it.
        let old = Connection::open_with_flags(&old_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|error| error.to_string())?;
        import_legacy_settings(store, &old)?;
        import_legacy_knowledge(store, &old)?;
        import_legacy_history(store, &old)?;

        let c = store.conn()?;
        c.execute(
            "INSERT OR REPLACE INTO ai_migration_log(key,completed_ts,detail) VALUES(?1,?2,?3)",
            params![key, Utc::now().timestamp(), old_path.display().to_string()],
        )
        .map_err(|error| error.to_string())?;
        imported.push(old_path.display().to_string());
    }
    Ok(imported)
}

fn import_legacy_settings(store: &AiStore, old: &Connection) -> Result<(), String> {
    if !table_exists(old, "settings")? {
        return Ok(());
    }
    let get = |key: &str| -> String {
        old.query_row(
            "SELECT value FROM settings WHERE key=?1",
            params![key],
            |row| row.get(0),
        )
        .unwrap_or_default()
    };
    let endpoint = get("provider.endpoint");
    if !endpoint.is_empty() {
        store.upsert_provider(&ProviderConfig {
            id: "local".into(),
            name: "OpenAI-compatible local (migrado)".into(),
            kind: ProviderKind::OpenAiCompatible,
            endpoint,
            enabled: true,
            api_version: String::new(),
            project: String::new(),
            region: String::new(),
            chat_timeout_secs: 600,
        })?;
    }
    let mut cfg = store.runtime_config()?;
    let fast = get("model.fast");
    let advanced = get("model.advanced");
    let embedding = get("model.embedding");
    if cfg.fast.model.is_empty() && !fast.is_empty() {
        cfg.fast = ModelBinding {
            provider_id: "local".into(),
            model: fast,
        };
    }
    if cfg.advanced.model.is_empty() && !advanced.is_empty() {
        cfg.advanced = ModelBinding {
            provider_id: "local".into(),
            model: advanced,
        };
    }
    if cfg.embedding.model.is_empty() && !embedding.is_empty() {
        cfg.embedding = ModelBinding {
            provider_id: "local".into(),
            model: embedding,
        };
    }
    store.save_runtime_config(&cfg)
}

fn import_legacy_knowledge(store: &AiStore, old: &Connection) -> Result<(), String> {
    if !table_exists(old, "collections")? || !table_exists(old, "sources")? {
        return Ok(());
    }
    let c = store.conn()?;
    let mut collection_map = HashMap::new();
    let mut st = old
        .prepare("SELECT id,name,account_scope,enabled,created_ts FROM collections ORDER BY id")
        .map_err(|error| error.to_string())?;
    let rows = st
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })
        .map_err(|error| error.to_string())?;
    for row in rows {
        let (old_id, name, scope, enabled, created_ts) = row.map_err(|error| error.to_string())?;
        c.execute(
            "INSERT OR IGNORE INTO ai_collections(name,account_scope,enabled,created_ts) VALUES(?1,?2,?3,?4)",
            params![name, scope, enabled, created_ts],
        ).map_err(|error| error.to_string())?;
        let new_id: i64 = c
            .query_row(
                "SELECT id FROM ai_collections WHERE name=?1",
                params![name],
                |r| r.get(0),
            )
            .map_err(|error| error.to_string())?;
        collection_map.insert(old_id, new_id);
    }

    let mut source_map = HashMap::new();
    let mut st = old.prepare(
        "SELECT id,collection_id,source,kind,enabled,last_index_ts,last_error FROM sources ORDER BY id",
    ).map_err(|error| error.to_string())?;
    let rows = st
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(|error| error.to_string())?;
    for row in rows {
        let (old_id, old_collection, source, kind, enabled, last_index_ts, last_error) =
            row.map_err(|error| error.to_string())?;
        let Some(&collection_id) = collection_map.get(&old_collection) else {
            continue;
        };
        c.execute(
            "INSERT OR IGNORE INTO ai_sources(collection_id,source,kind,enabled,last_index_ts,last_error) VALUES(?1,?2,?3,?4,?5,?6)",
            params![collection_id, source, kind, enabled, last_index_ts, last_error],
        ).map_err(|error| error.to_string())?;
        let new_id: i64 = c
            .query_row(
                "SELECT id FROM ai_sources WHERE collection_id=?1 AND source=?2",
                params![collection_id, source],
                |r| r.get(0),
            )
            .map_err(|error| error.to_string())?;
        source_map.insert(old_id, new_id);
    }

    if table_exists(old, "chunks")? {
        for (old_source_id, new_source_id) in source_map {
            import_legacy_chunks(&c, old, old_source_id, new_source_id)?;
        }
    }
    Ok(())
}

fn import_legacy_chunks(
    c: &Connection,
    old: &Connection,
    old_source_id: i64,
    new_source_id: i64,
) -> Result<(), String> {
    let current: Option<i64> = c
        .query_row(
            "SELECT current_revision_id FROM ai_sources WHERE id=?1",
            params![new_source_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .flatten();
    if current.is_some() {
        return Ok(());
    }
    let mut st = old.prepare(
        "SELECT account_scope,ordinal,text,embedding,metadata_json FROM chunks WHERE source_id=?1 ORDER BY ordinal",
    ).map_err(|error| error.to_string())?;
    let rows = st
        .query_map(params![old_source_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|error| error.to_string())?;
    let chunks = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())?;
    if chunks.is_empty() {
        return Ok(());
    }
    let mut hash = Sha256::new();
    for (_, ordinal, text, embedding, metadata) in &chunks {
        hash.update(ordinal.to_le_bytes());
        hash.update(text.as_bytes());
        hash.update(embedding.as_bytes());
        hash.update(metadata.as_bytes());
    }
    let content_hash = format!("legacy:{:x}", hash.finalize());
    c.execute(
        "INSERT INTO ai_source_revisions(source_id,content_hash,created_ts,status) VALUES(?1,?2,?3,'active')",
        params![new_source_id, content_hash, Utc::now().timestamp()],
    ).map_err(|error| error.to_string())?;
    let revision_id = c.last_insert_rowid();
    for (account_scope, ordinal, text, embedding, metadata) in chunks {
        c.execute(
            "INSERT INTO ai_chunks(source_id,revision_id,account_scope,ordinal,text,embedding,metadata_json) VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![new_source_id, revision_id, account_scope, ordinal, text, normalize_legacy_embedding(&embedding), metadata],
        ).map_err(|error| error.to_string())?;
    }
    c.execute(
        "UPDATE ai_sources SET current_revision_id=?2 WHERE id=?1",
        params![new_source_id, revision_id],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn normalize_legacy_embedding(raw: &str) -> String {
    if raw.trim().is_empty() {
        "[]".into()
    } else {
        raw.to_string()
    }
}

fn import_legacy_history(store: &AiStore, old: &Connection) -> Result<(), String> {
    let c = store.conn()?;
    if table_exists(old, "suggestions")? {
        let mut st = old.prepare("SELECT message_key,account_scope,created_ts,request_json,response_json FROM suggestions ORDER BY id")
            .map_err(|error| error.to_string())?;
        let rows = st
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|error| error.to_string())?;
        for row in rows {
            let (key, scope, ts, request, response) = row.map_err(|error| error.to_string())?;
            c.execute(
                "INSERT INTO ai_suggestions(message_key,account_scope,created_ts,request_json,response_json) SELECT ?1,?2,?3,?4,?5 WHERE NOT EXISTS (SELECT 1 FROM ai_suggestions WHERE message_key=?1 AND account_scope=?2 AND created_ts=?3 AND response_json=?5)",
                params![key, scope, ts, request, response],
            ).map_err(|error| error.to_string())?;
        }
    }
    if table_exists(old, "analyses")? {
        let mut st = old
            .prepare("SELECT message_key,account_scope,updated_ts,response_json FROM analyses")
            .map_err(|error| error.to_string())?;
        let rows = st
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|error| error.to_string())?;
        for row in rows {
            let (key, scope, ts, response) = row.map_err(|error| error.to_string())?;
            c.execute(
                "INSERT INTO ai_analyses(message_key,account_scope,updated_ts,response_json) VALUES(?1,?2,?3,?4) ON CONFLICT(message_key) DO UPDATE SET account_scope=excluded.account_scope,updated_ts=excluded.updated_ts,response_json=excluded.response_json",
                params![key, scope, ts, response],
            ).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub fn seed_from_mail_settings(
    store: &AiStore,
    settings: &[(String, String)],
) -> Result<(), String> {
    store.ensure_default_provider()?;
    let map = settings.iter().cloned().collect::<HashMap<_, _>>();
    if let Some(endpoint) = map
        .get("ai.endpoint")
        .filter(|value| !value.trim().is_empty())
    {
        store.upsert_provider(&ProviderConfig {
            id: "local".into(),
            name: "OpenAI-compatible local".into(),
            kind: ProviderKind::OpenAiCompatible,
            endpoint: endpoint.clone(),
            enabled: true,
            api_version: String::new(),
            project: String::new(),
            region: String::new(),
            chat_timeout_secs: 600,
        })?;
    }
    let mut cfg = store.runtime_config()?;
    cfg.enabled = map
        .get("ai.enabled")
        .map(|value| value == "true")
        .unwrap_or(cfg.enabled);
    cfg.rag_enabled = map
        .get("ai.rag_enabled")
        .map(|value| value == "true")
        .unwrap_or(cfg.rag_enabled);
    cfg.analysis_scope = map
        .get("ai.analysis_scope")
        .cloned()
        .unwrap_or(cfg.analysis_scope);
    cfg.preanalyze_received = map
        .get("ai.preanalyze_received")
        .map(|value| value == "true")
        .unwrap_or(cfg.preanalyze_received);
    if cfg.fast.model.is_empty() {
        cfg.fast = ModelBinding {
            provider_id: "local".into(),
            model: map.get("ai.fast_model").cloned().unwrap_or_default(),
        };
    }
    if cfg.advanced.model.is_empty() {
        cfg.advanced = ModelBinding {
            provider_id: "local".into(),
            model: map.get("ai.advanced_model").cloned().unwrap_or_default(),
        };
    }
    if cfg.embedding.model.is_empty() {
        cfg.embedding = ModelBinding {
            provider_id: "local".into(),
            model: map.get("ai.embeddings_model").cloned().unwrap_or_default(),
        };
    }
    store.save_runtime_config(&cfg)
}

fn table_exists(c: &Connection, name: &str) -> Result<bool, String> {
    Ok(c.query_row(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1",
        params![name],
        |row| row.get::<_, i64>(0),
    )
    .optional()
    .map_err(|error| error.to_string())?
    .is_some())
}

// Optional safety helper for users who want an explicit archive before running the separate purge script.
pub fn backup_legacy_agent_data(home: &Path, target: &Path) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for src in legacy_agent_candidates(home) {
        if let Some(dir) = src.parent() {
            if dir.exists() {
                let dst = target.join("legacy-python-agent-backup");
                fs::create_dir_all(&dst).map_err(|error| error.to_string())?;
                let file = dst.join(format!("agent-{}.db", out.len() + 1));
                if !file.exists() {
                    fs::copy(&src, &file).map_err(|error| error.to_string())?;
                }
                out.push(file.display().to_string());
            }
        }
    }
    Ok(out)
}
