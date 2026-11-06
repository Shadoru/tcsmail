use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};
use zip::ZipArchive;

use crate::{
    config::{AiRuntimeConfig, ModelBinding, ProviderConfig, ProviderKind},
    provider::ProviderRouter,
};

const MAX_SOURCE_BYTES: u64 = 25 * 1024 * 1024;
const MAX_EXTRACTED_CHARS: usize = 2_000_000;

#[derive(Clone)]
pub struct AiStore {
    path: PathBuf,
    unavailable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagSearchItem {
    pub id: i64,
    pub source_id: i64,
    pub revision_id: i64,
    pub text: String,
    pub score: f32,
    pub metadata: Value,
}

impl AiStore {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let s = Self {
            path,
            unavailable: false,
        };
        s.migrate()?;
        Ok(s)
    }
    /// Retain an unreadable optional AI database untouched. Mail remains usable;
    /// all AI commands return an actionable error rather than opening a new DB.
    pub fn unavailable(path: impl AsRef<Path>) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
            unavailable: true,
        }
    }
    pub fn path(&self) -> &Path {
        &self.path
    }
    pub fn conn(&self) -> Result<Connection, String> {
        if self.unavailable {
            return Err("O banco opcional de IA está indisponível. Seus e-mails continuam disponíveis. Preserve ai.db e consulte o diagnóstico antes de restaurá-lo.".into());
        }
        let c = Connection::open(&self.path).map_err(|e| e.to_string())?;
        c.busy_timeout(Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        c.pragma_update(None, "foreign_keys", "ON")
            .map_err(|e| e.to_string())?;
        Ok(c)
    }
    fn migrate(&self) -> Result<(), String> {
        let c = self.conn()?;
        c.execute_batch(SCHEMA).map_err(|e| e.to_string())?;
        // A scalar SQLite query avoids retaining a MappedRows borrow over a Statement.
        // Also avoids the Rust 1.99 Clippy `let_and_return`/borrow-lifetime conflict.
        let has_timeout = c.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('ai_providers') WHERE name = 'chat_timeout_secs'",
            [],
            |row| row.get::<_, i64>(0),
        ).map_err(|e| e.to_string())? > 0;
        if !has_timeout {
            c.execute("ALTER TABLE ai_providers ADD COLUMN chat_timeout_secs INTEGER NOT NULL DEFAULT 600",[]).map_err(|e|e.to_string())?;
        }
        c.execute("INSERT OR IGNORE INTO ai_collections(name,account_scope,enabled,created_ts) VALUES('Geral','*',1,?1)",params![Utc::now().timestamp()]).map_err(|e|e.to_string())?;
        Ok(())
    }

    pub fn providers(&self) -> Result<Vec<ProviderConfig>, String> {
        let c = self.conn()?;
        let mut st=c.prepare("SELECT id,name,kind,endpoint,enabled,api_version,project,region,chat_timeout_secs FROM ai_providers ORDER BY lower(name)").map_err(|e|e.to_string())?;
        let rows = st
            .query_map([], |r| {
                Ok(ProviderConfig {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    kind: ProviderKind::parse(&r.get::<_, String>(2)?),
                    endpoint: r.get(3)?,
                    enabled: r.get::<_, i64>(4)? != 0,
                    api_version: r.get(5)?,
                    project: r.get(6)?,
                    region: r.get(7)?,
                    chat_timeout_secs: r.get::<_, i64>(8)?.max(30) as u64,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())
    }
    pub fn upsert_provider(&self, p: &ProviderConfig) -> Result<(), String> {
        let c = self.conn()?;
        c.execute("INSERT INTO ai_providers(id,name,kind,endpoint,enabled,api_version,project,region,chat_timeout_secs) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,endpoint=excluded.endpoint,enabled=excluded.enabled,api_version=excluded.api_version,project=excluded.project,region=excluded.region,chat_timeout_secs=excluded.chat_timeout_secs",params![p.id,p.name,p.kind.as_str(),p.endpoint,p.enabled as i64,p.api_version,p.project,p.region,p.chat_timeout_secs.clamp(30,1800) as i64]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn delete_provider(&self, id: &str) -> Result<(), String> {
        if id == "local" {
            return Err("provider local padrão não pode ser apagado".into());
        }
        self.conn()?
            .execute("DELETE FROM ai_providers WHERE id=?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn ensure_default_provider(&self) -> Result<(), String> {
        let c = self.conn()?;
        c.execute("INSERT OR IGNORE INTO ai_providers(id,name,kind,endpoint,enabled,api_version,project,region) VALUES('local','OpenAI-compatible local','openai_compatible','http://127.0.0.1:9292',1,'','','')",[]).map_err(|e|e.to_string())?;
        Ok(())
    }

    pub fn runtime_config(&self) -> Result<AiRuntimeConfig, String> {
        let c = self.conn()?;
        let get = |k: &str, d: &str| -> String {
            c.query_row(
                "SELECT value FROM ai_settings WHERE key=?1",
                params![k],
                |r| r.get(0),
            )
            .optional()
            .ok()
            .flatten()
            .unwrap_or_else(|| d.into())
        };
        Ok(AiRuntimeConfig {
            enabled: get("enabled", "false") == "true",
            rag_enabled: get("rag_enabled", "false") == "true",
            fast: ModelBinding {
                provider_id: get("fast.provider", "local"),
                model: get("fast.model", ""),
            },
            advanced: ModelBinding {
                provider_id: get("advanced.provider", "local"),
                model: get("advanced.model", ""),
            },
            embedding: ModelBinding {
                provider_id: get("embedding.provider", "local"),
                model: get("embedding.model", ""),
            },
            analysis_scope: get("analysis_scope", "none"),
            preanalyze_received: get("preanalyze_received", "false") == "true",
            shadow_mode: get("automation.shadow_mode", "true") == "true",
        })
    }
    pub fn save_runtime_config(&self, cfg: &AiRuntimeConfig) -> Result<(), String> {
        let mut c = self.conn()?;
        let tx = c.transaction().map_err(|e| e.to_string())?;
        for (k, v) in [
            ("enabled", cfg.enabled.to_string()),
            ("rag_enabled", cfg.rag_enabled.to_string()),
            ("fast.provider", cfg.fast.provider_id.clone()),
            ("fast.model", cfg.fast.model.clone()),
            ("advanced.provider", cfg.advanced.provider_id.clone()),
            ("advanced.model", cfg.advanced.model.clone()),
            ("embedding.provider", cfg.embedding.provider_id.clone()),
            ("embedding.model", cfg.embedding.model.clone()),
            ("analysis_scope", cfg.analysis_scope.clone()),
            ("preanalyze_received", cfg.preanalyze_received.to_string()),
            ("automation.shadow_mode", cfg.shadow_mode.to_string()),
        ] {
            tx.execute("INSERT INTO ai_settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![k,v]).map_err(|e|e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn collections(&self) -> Result<Value, String> {
        let c = self.conn()?;
        let mut st=c.prepare("SELECT id,name,account_scope,enabled,created_ts FROM ai_collections ORDER BY lower(name)").map_err(|e|e.to_string())?;
        let rows=st.query_map([],|r|Ok(serde_json::json!({"id":r.get::<_,i64>(0)?,"name":r.get::<_,String>(1)?,"account_scope":r.get::<_,String>(2)?,"enabled":r.get::<_,i64>(3)?!=0,"created_ts":r.get::<_,i64>(4)?}))).map_err(|e|e.to_string())?;
        Ok(Value::Array(
            rows.collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| e.to_string())?,
        ))
    }
    pub fn add_collection(&self, name: &str, scope: &str) -> Result<Value, String> {
        if name.trim().is_empty() {
            return Err("nome obrigatório".into());
        }
        let c = self.conn()?;
        c.execute(
            "INSERT INTO ai_collections(name,account_scope,enabled,created_ts) VALUES(?1,?2,1,?3)",
            params![
                name.trim(),
                if scope.trim().is_empty() {
                    "*"
                } else {
                    scope.trim()
                },
                Utc::now().timestamp()
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(serde_json::json!({"ok":true,"id":c.last_insert_rowid()}))
    }
    pub fn delete_collection(&self, id: i64) -> Result<Value, String> {
        self.conn()?
            .execute("DELETE FROM ai_collections WHERE id=?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(serde_json::json!({"ok":true}))
    }
    pub fn sources(&self) -> Result<Value, String> {
        let c = self.conn()?;
        let mut st=c.prepare("SELECT s.id,s.collection_id,s.source,s.kind,s.enabled,s.last_index_ts,s.last_error,c.name,c.account_scope,s.current_revision_id FROM ai_sources s JOIN ai_collections c ON c.id=s.collection_id ORDER BY lower(c.name),lower(s.source)").map_err(|e|e.to_string())?;
        let rows=st.query_map([],|r|Ok(serde_json::json!({"id":r.get::<_,i64>(0)?,"collection_id":r.get::<_,i64>(1)?,"source":r.get::<_,String>(2)?,"kind":r.get::<_,String>(3)?,"enabled":r.get::<_,i64>(4)?!=0,"last_index_ts":r.get::<_,Option<i64>>(5)?,"last_error":r.get::<_,String>(6)?,"collection_name":r.get::<_,String>(7)?,"account_scope":r.get::<_,String>(8)?,"current_revision_id":r.get::<_,Option<i64>>(9)?}))).map_err(|e|e.to_string())?;
        Ok(Value::Array(
            rows.collect::<rusqlite::Result<Vec<_>>>()
                .map_err(|e| e.to_string())?,
        ))
    }
    pub fn add_source(&self, source: &str, collection: &str, scope: &str) -> Result<Value, String> {
        if source.trim().is_empty() {
            return Err("fonte obrigatória".into());
        }
        let c = self.conn()?;
        let scope = if scope.trim().is_empty() {
            "*"
        } else {
            scope.trim()
        };
        c.execute("INSERT OR IGNORE INTO ai_collections(name,account_scope,enabled,created_ts) VALUES(?1,?2,1,?3)",params![collection,scope,Utc::now().timestamp()]).map_err(|e|e.to_string())?;
        let cid: i64 = c
            .query_row(
                "SELECT id FROM ai_collections WHERE name=?1",
                params![collection],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        c.execute("INSERT OR IGNORE INTO ai_sources(collection_id,source,kind,enabled) VALUES(?1,?2,'path',1)",params![cid,source.trim()]).map_err(|e|e.to_string())?;
        Ok(serde_json::json!({"ok":true}))
    }
    pub fn delete_source(&self, id: i64) -> Result<Value, String> {
        self.conn()?
            .execute("DELETE FROM ai_sources WHERE id=?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(serde_json::json!({"ok":true}))
    }
    pub fn clear_index(&self) -> Result<Value, String> {
        let c = self.conn()?;
        c.execute("DELETE FROM ai_chunks", [])
            .map_err(|e| e.to_string())?;
        c.execute(
            "UPDATE ai_sources SET current_revision_id=NULL,last_index_ts=NULL",
            [],
        )
        .map_err(|e| e.to_string())?;
        Ok(serde_json::json!({"ok":true}))
    }
    pub fn clear_history(&self) -> Result<Value, String> {
        let c = self.conn()?;
        c.execute("DELETE FROM ai_suggestions", [])
            .map_err(|e| e.to_string())?;
        c.execute("DELETE FROM ai_analyses", [])
            .map_err(|e| e.to_string())?;
        Ok(serde_json::json!({"ok":true}))
    }
    pub fn cached_analysis(&self, key: &str) -> Result<Option<Value>, String> {
        let c = self.conn()?;
        let raw: Option<String> = c
            .query_row(
                "SELECT response_json FROM ai_analyses WHERE message_key=?1",
                params![key],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        Ok(raw.and_then(|x| serde_json::from_str(&x).ok()))
    }
    pub fn save_analysis(&self, key: &str, scope: &str, value: &Value) -> Result<(), String> {
        self.conn()?.execute("INSERT INTO ai_analyses(message_key,account_scope,updated_ts,response_json) VALUES(?1,?2,?3,?4) ON CONFLICT(message_key) DO UPDATE SET account_scope=excluded.account_scope,updated_ts=excluded.updated_ts,response_json=excluded.response_json",params![key,scope,Utc::now().timestamp(),value.to_string()]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn save_suggestion(
        &self,
        key: &str,
        scope: &str,
        request: &Value,
        response: &Value,
    ) -> Result<(), String> {
        self.conn()?.execute("INSERT INTO ai_suggestions(message_key,account_scope,created_ts,request_json,response_json) VALUES(?1,?2,?3,?4,?5)",params![key,scope,Utc::now().timestamp(),request.to_string(),response.to_string()]).map_err(|e|e.to_string())?;
        Ok(())
    }

    pub fn status(&self) -> Result<Value, String> {
        let c = self.conn()?;
        let n = |table: &str| -> i64 {
            c.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
                .unwrap_or(0)
        };
        let last: i64 = c
            .query_row(
                "SELECT COALESCE(MAX(last_index_ts),0) FROM ai_sources",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        Ok(
            serde_json::json!({"runtime":"rust-integrated","collections":n("ai_collections"),"sources":n("ai_sources"),"revisions":n("ai_source_revisions"),"chunks":n("ai_chunks"),"suggestions":n("ai_suggestions"),"analyses":n("ai_analyses"),"last_index_ts":last}),
        )
    }

    pub fn reindex_all<F>(
        &self,
        router: &ProviderRouter,
        binding: &ModelBinding,
        mut secret: F,
    ) -> Result<Value, String>
    where
        F: FnMut(&str) -> Option<String>,
    {
        let c = self.conn()?;
        let ids = c
            .prepare("SELECT id FROM ai_sources WHERE enabled=1")
            .map_err(|e| e.to_string())?
            .query_map([], |r| r.get::<_, i64>(0))
            .map_err(|e| e.to_string())?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| e.to_string())?;
        drop(c);
        let mut results = Vec::new();
        for id in ids {
            match self.index_source(id, router, binding, secret(&binding.provider_id).as_deref()) {
                Ok(n) => results.push(serde_json::json!({"id":id,"chunks":n})),
                Err(e) => results.push(serde_json::json!({"id":id,"error":e})),
            }
        }
        Ok(serde_json::json!({"ok":true,"results":results}))
    }
    fn index_source(
        &self,
        id: i64,
        router: &ProviderRouter,
        binding: &ModelBinding,
        secret: Option<&str>,
    ) -> Result<usize, String> {
        let c = self.conn()?;
        let row=c.query_row("SELECT s.source,c.account_scope FROM ai_sources s JOIN ai_collections c ON c.id=s.collection_id WHERE s.id=?1",params![id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).optional().map_err(|e|e.to_string())?.ok_or("fonte não encontrada")?;
        drop(c);
        let root = PathBuf::from(&row.0);
        let paths = if root.is_file() && !root.is_symlink() {
            vec![root]
        } else if root.is_dir() {
            walk_files(&root)
        } else {
            vec![]
        };
        if paths.is_empty() {
            return Err("fonte inexistente ou vazia".into());
        }
        let mut parts = Vec::new();
        for p in paths {
            let text = read_source(&p)?;
            for (idx, piece) in chunks(&text).into_iter().enumerate() {
                parts.push((p.clone(), idx, piece));
            }
        }
        if parts.is_empty() {
            return Err("nenhum conteúdo indexável".into());
        }
        parts.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
        let stamp = serde_json::json!({"extractor":"0.8.3-v1", "scope":row.1, "binding":binding, "providers":self.providers()?, "parts":parts});
        let digest = format!("{:x}", Sha256::digest(stamp.to_string().as_bytes()));
        let c = self.conn()?;
        let unchanged: bool = c.query_row("SELECT EXISTS(SELECT 1 FROM ai_sources s JOIN ai_source_revisions r ON r.id=s.current_revision_id WHERE s.id=?1 AND r.content_hash=?2 AND r.status='active')",params![id,digest],|r|r.get(0)).map_err(|e|e.to_string())?;
        if unchanged {
            let count: i64 = c
                .query_row(
                    "SELECT COUNT(*) FROM ai_chunks WHERE source_id=?1",
                    params![id],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            c.execute(
                "UPDATE ai_sources SET last_index_ts=?2,last_error='' WHERE id=?1",
                params![id, Utc::now().timestamp()],
            )
            .map_err(|e| e.to_string())?;
            return Ok(count as usize);
        }
        drop(c);
        let texts = parts.iter().map(|x| x.2.clone()).collect::<Vec<_>>();
        let vectors = if binding.model.trim().is_empty() {
            vec![Vec::new(); texts.len()]
        } else {
            router
                .embeddings(&binding.provider_id, secret, &binding.model, &texts)
                .map_err(|e| e.to_string())?
        };
        if vectors.len() != parts.len() {
            return Err("provider retornou quantidade inválida de embeddings".into());
        }
        let mut c = self.conn()?;
        let tx = c.transaction().map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO ai_source_revisions(source_id,content_hash,created_ts,status) VALUES(?1,?2,?3,'staging')",params![id,digest,Utc::now().timestamp()]).map_err(|e|e.to_string())?;
        let rev = tx.last_insert_rowid();
        for ((path, ordinal, text), vec) in parts.into_iter().zip(vectors) {
            let meta = serde_json::json!({"path":path.display().to_string(),"ordinal":ordinal});
            tx.execute("INSERT INTO ai_chunks(source_id,revision_id,account_scope,ordinal,text,embedding,metadata_json) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![id,rev,row.1,ordinal as i64,text,serde_json::to_string(&vec).unwrap_or_default(),meta.to_string()]).map_err(|e|e.to_string())?;
        }
        tx.execute(
            "UPDATE ai_source_revisions SET status='active' WHERE id=?1",
            params![rev],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM ai_chunks WHERE source_id=?1 AND revision_id<>?2",
            params![id, rev],
        )
        .map_err(|e| e.to_string())?;
        tx.execute(
            "UPDATE ai_source_revisions SET status='superseded' WHERE source_id=?1 AND id<>?2",
            params![id, rev],
        )
        .map_err(|e| e.to_string())?;
        tx.execute("UPDATE ai_sources SET current_revision_id=?2,last_index_ts=?3,last_error='' WHERE id=?1",params![id,rev,Utc::now().timestamp()]).map_err(|e|e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(texts.len())
    }

    pub fn search<F>(
        &self,
        query: &str,
        scopes: &[String],
        router: &ProviderRouter,
        binding: &ModelBinding,
        secret: F,
        limit: usize,
    ) -> Result<Vec<RagSearchItem>, String>
    where
        F: FnOnce(&str) -> Option<String>,
    {
        let c = self.conn()?;
        let scope_values = super::rag_scope::legacy_search_scopes(scopes);
        let placeholders = (0..scope_values.len())
            .map(|i| format!("?{}", i + 2))
            .collect::<Vec<_>>()
            .join(",");
        let fts = fts_query(query);
        let mut candidates: std::collections::HashMap<i64, (RagSearchItem, f32)> =
            std::collections::HashMap::new();
        if !fts.is_empty() {
            let sql=format!("SELECT ch.id,ch.source_id,ch.revision_id,ch.text,ch.metadata_json,bm25(ai_chunks_fts) score FROM ai_chunks_fts JOIN ai_chunks ch ON ch.id=ai_chunks_fts.rowid JOIN ai_sources s ON s.id=ch.source_id JOIN ai_collections c ON c.id=s.collection_id WHERE s.enabled=1 AND c.enabled=1 AND ai_chunks_fts MATCH ?1 AND ch.revision_id=s.current_revision_id AND lower(ch.account_scope) IN ({placeholders}) ORDER BY score LIMIT {}",limit.max(1)*4);
            let mut vals: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(fts)];
            for s in &scope_values {
                vals.push(Box::new(s.clone()));
            }
            let refs = vals.iter().map(|v| v.as_ref()).collect::<Vec<_>>();
            if let Ok(mut st) = c.prepare(&sql) {
                if let Ok(rows) = st.query_map(refs.as_slice(), |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, i64>(1)?,
                        r.get::<_, i64>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, String>(4)?,
                        r.get::<_, f64>(5)?,
                    ))
                }) {
                    for r in rows {
                        let r = r.map_err(|e| e.to_string())?;
                        let score = lexical_score(r.5);
                        candidates.insert(
                            r.0,
                            (
                                RagSearchItem {
                                    id: r.0,
                                    source_id: r.1,
                                    revision_id: r.2,
                                    text: r.3,
                                    score,
                                    metadata: serde_json::from_str(&r.4).unwrap_or(Value::Null),
                                },
                                score,
                            ),
                        );
                    }
                }
            }
        }
        if !binding.model.trim().is_empty() {
            let sec = secret(&binding.provider_id);
            if let Ok(vs) = router.embeddings(
                &binding.provider_id,
                sec.as_deref(),
                &binding.model,
                &[query.to_string()],
            ) {
                if let Some(qv) = vs.first() {
                    let sql=format!("SELECT ch.id,ch.source_id,ch.revision_id,ch.text,ch.embedding,ch.metadata_json FROM ai_chunks ch JOIN ai_sources s ON s.id=ch.source_id JOIN ai_collections c ON c.id=s.collection_id WHERE s.enabled=1 AND c.enabled=1 AND ch.revision_id=s.current_revision_id AND lower(ch.account_scope) IN ({})",(0..scope_values.len()).map(|i|format!("?{}",i+1)).collect::<Vec<_>>().join(","));
                    let refs = scope_values
                        .iter()
                        .map(|s| s as &dyn rusqlite::ToSql)
                        .collect::<Vec<_>>();
                    let mut st = c.prepare(&sql).map_err(|e| e.to_string())?;
                    let rows = st
                        .query_map(refs.as_slice(), |r| {
                            Ok((
                                r.get::<_, i64>(0)?,
                                r.get::<_, i64>(1)?,
                                r.get::<_, i64>(2)?,
                                r.get::<_, String>(3)?,
                                r.get::<_, String>(4)?,
                                r.get::<_, String>(5)?,
                            ))
                        })
                        .map_err(|e| e.to_string())?;
                    for r in rows {
                        let r = r.map_err(|e| e.to_string())?;
                        let vec: Vec<f32> = serde_json::from_str(&r.4).unwrap_or_default();
                        let sim = cos(qv, &vec);
                        if sim > 0.0 {
                            let lex = candidates.get(&r.0).map(|x| x.1).unwrap_or(0.0);
                            let hybrid = 0.65 * sim + 0.35 * lex;
                            candidates.insert(
                                r.0,
                                (
                                    RagSearchItem {
                                        id: r.0,
                                        source_id: r.1,
                                        revision_id: r.2,
                                        text: r.3,
                                        score: hybrid,
                                        metadata: serde_json::from_str(&r.5).unwrap_or(Value::Null),
                                    },
                                    hybrid,
                                ),
                            );
                        }
                    }
                }
            }
        }
        let mut out = candidates.into_values().map(|x| x.0).collect::<Vec<_>>();
        out.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        out.truncate(limit.max(1));
        Ok(out)
    }
}

fn walk_files(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(p) = stack.pop() {
        if let Ok(rd) = fs::read_dir(p) {
            for e in rd.flatten() {
                let p = e.path();
                if p.is_symlink() {
                    continue;
                }
                if p.is_dir() {
                    stack.push(p)
                } else if p.is_file() {
                    out.push(p)
                }
            }
        }
    }
    out
}
fn strip_markup(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => {
                in_tag = true;
                out.push(' ')
            }
            '>' => {
                in_tag = false;
                out.push(' ')
            }
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}
fn read_source(path: &Path) -> Result<String, String> {
    let meta = path.metadata().map_err(|e| e.to_string())?;
    if meta.len() > MAX_SOURCE_BYTES {
        return Err(format!("{} excede 25 MiB", path.display()));
    }
    let ext = path
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "txt" | "md" | "markdown" | "log" | "csv" | "json" | "rst" => Ok(fs::read_to_string(path)
            .map_err(|e| e.to_string())?
            .chars()
            .take(MAX_EXTRACTED_CHARS)
            .collect()),
        "html" | "htm" | "xml" => Ok(strip_markup(
            &fs::read_to_string(path).map_err(|e| e.to_string())?,
        )
        .chars()
        .take(MAX_EXTRACTED_CHARS)
        .collect()),
        "pdf" => Ok(crate::extraction::pdf_text(path)?
            .chars()
            .take(MAX_EXTRACTED_CHARS)
            .collect()),
        "docx" => {
            let f = fs::File::open(path).map_err(|e| e.to_string())?;
            let mut z = ZipArchive::new(f).map_err(|e| e.to_string())?;
            let x = z.by_name("word/document.xml").map_err(|e| e.to_string())?;
            if x.size() > crate::extraction::MAX_EXTRACTED_BYTES as u64 {
                return Err("O XML do DOCX excede 8 MiB. Divida o documento.".into());
            }
            let raw = crate::extraction::bounded_text(x)?;
            Ok(strip_markup(&raw)
                .chars()
                .take(MAX_EXTRACTED_CHARS)
                .collect())
        }
        _ => Err(format!("formato não suportado: {ext}")),
    }
}
fn chunks(text: &str) -> Vec<String> {
    let text = text.replace("\r\n", "\n").replace('\r', "\n");
    let chars = text.chars().collect::<Vec<_>>();
    let mut out = Vec::new();
    let mut start = 0usize;
    while start < chars.len() {
        let end = (start + 1800).min(chars.len());
        let piece = chars[start..end]
            .iter()
            .collect::<String>()
            .trim()
            .to_string();
        if !piece.is_empty() {
            out.push(piece);
        }
        if end == chars.len() {
            break;
        }
        start = end.saturating_sub(220);
    }
    out
}
fn fts_query(q: &str) -> String {
    q.split(|c: char| !c.is_alphanumeric() && c != '-' && c != '_')
        .filter(|x| x.chars().count() >= 3)
        .take(24)
        .map(|x| format!("\"{}\"", x.replace('"', "")))
        .collect::<Vec<_>>()
        .join(" OR ")
}
fn cos(a: &[f32], b: &[f32]) -> f32 {
    if a.is_empty() || a.len() != b.len() {
        return 0.0;
    }
    let dot = a.iter().zip(b).map(|(x, y)| x * y).sum::<f32>();
    let na = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if na == 0.0 || nb == 0.0 {
        0.0
    } else {
        dot / (na * nb)
    }
}

const SCHEMA: &str = r#"
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS ai_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_providers(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,endpoint TEXT NOT NULL DEFAULT '',enabled INTEGER NOT NULL DEFAULT 1,api_version TEXT NOT NULL DEFAULT '',project TEXT NOT NULL DEFAULT '',region TEXT NOT NULL DEFAULT '',chat_timeout_secs INTEGER NOT NULL DEFAULT 600);
CREATE TABLE IF NOT EXISTS ai_collections(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,account_scope TEXT NOT NULL DEFAULT '*',enabled INTEGER NOT NULL DEFAULT 1,created_ts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ai_sources(id INTEGER PRIMARY KEY AUTOINCREMENT,collection_id INTEGER NOT NULL,source TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'path',enabled INTEGER NOT NULL DEFAULT 1,current_revision_id INTEGER,last_index_ts INTEGER,last_error TEXT NOT NULL DEFAULT '',UNIQUE(collection_id,source),FOREIGN KEY(collection_id) REFERENCES ai_collections(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS ai_source_revisions(id INTEGER PRIMARY KEY AUTOINCREMENT,source_id INTEGER NOT NULL,content_hash TEXT NOT NULL,created_ts INTEGER NOT NULL,status TEXT NOT NULL,FOREIGN KEY(source_id) REFERENCES ai_sources(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS ai_chunks(id INTEGER PRIMARY KEY AUTOINCREMENT,source_id INTEGER NOT NULL,revision_id INTEGER NOT NULL,account_scope TEXT NOT NULL DEFAULT '*',ordinal INTEGER NOT NULL,text TEXT NOT NULL,embedding TEXT NOT NULL DEFAULT '[]',metadata_json TEXT NOT NULL DEFAULT '{}',FOREIGN KEY(source_id) REFERENCES ai_sources(id) ON DELETE CASCADE,FOREIGN KEY(revision_id) REFERENCES ai_source_revisions(id) ON DELETE CASCADE);
CREATE VIRTUAL TABLE IF NOT EXISTS ai_chunks_fts USING fts5(text,content='ai_chunks',content_rowid='id');
CREATE TRIGGER IF NOT EXISTS ai_chunks_ai AFTER INSERT ON ai_chunks BEGIN INSERT INTO ai_chunks_fts(rowid,text) VALUES(new.id,new.text); END;
CREATE TRIGGER IF NOT EXISTS ai_chunks_ad AFTER DELETE ON ai_chunks BEGIN INSERT INTO ai_chunks_fts(ai_chunks_fts,rowid,text) VALUES('delete',old.id,old.text); END;
CREATE TRIGGER IF NOT EXISTS ai_chunks_au AFTER UPDATE ON ai_chunks BEGIN INSERT INTO ai_chunks_fts(ai_chunks_fts,rowid,text) VALUES('delete',old.id,old.text); INSERT INTO ai_chunks_fts(rowid,text) VALUES(new.id,new.text); END;
CREATE TABLE IF NOT EXISTS ai_suggestions(id INTEGER PRIMARY KEY AUTOINCREMENT,message_key TEXT NOT NULL,account_scope TEXT NOT NULL DEFAULT '*',created_ts INTEGER NOT NULL,request_json TEXT NOT NULL,response_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_analyses(message_key TEXT PRIMARY KEY,account_scope TEXT NOT NULL DEFAULT '*',updated_ts INTEGER NOT NULL,response_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_tool_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,created_ts INTEGER NOT NULL,run_id TEXT NOT NULL,tool TEXT NOT NULL,decision TEXT NOT NULL,idempotency_key TEXT NOT NULL,detail_json TEXT NOT NULL DEFAULT '{}');
CREATE UNIQUE INDEX IF NOT EXISTS ai_tool_idempotency ON ai_tool_audit(idempotency_key) WHERE idempotency_key<>'';
CREATE TABLE IF NOT EXISTS ai_migration_log(key TEXT PRIMARY KEY,completed_ts INTEGER NOT NULL,detail TEXT NOT NULL DEFAULT '');
"#;

// FTS5 returns lower (more negative) BM25 for stronger matches. Normalize it
// monotonically to [0,1], preserving order when combining lexical/vector scores.
fn lexical_score(bm25: f64) -> f32 {
    let strength = (-bm25).max(0.0);
    (strength / (1.0 + strength)) as f32
}
#[cfg(test)]
mod ranking_tests {
    use super::*;
    #[test]
    fn lower_bm25_means_higher_lexical_score() {
        assert!(super::lexical_score(-10.0) > super::lexical_score(-1.0));
        assert!(super::lexical_score(-1.0) > super::lexical_score(-0.000001));
        assert_eq!(super::lexical_score(0.0), 0.0);
    }

    #[test]
    fn unchanged_source_keeps_revision_and_disabled_source_is_not_evidence() {
        let base = std::env::temp_dir().join(format!(
            "tcs-rag-083-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        let file = base.join("source.txt");
        fs::write(&file, "Synthetic policy alpha alpha alpha").unwrap();
        let store = AiStore::open(base.join("ai.db")).unwrap();
        store
            .add_source(file.to_str().unwrap(), "Synthetic", "1")
            .unwrap();
        let id = store.sources().unwrap()[0]["id"].as_i64().unwrap();
        let router = ProviderRouter::new(Vec::new()).unwrap();
        let binding = ModelBinding::default();
        store.index_source(id, &router, &binding, None).unwrap();
        let revision = || {
            store
                .conn()
                .unwrap()
                .query_row(
                    "SELECT current_revision_id FROM ai_sources WHERE id=?1",
                    [id],
                    |r| r.get::<_, i64>(0),
                )
                .unwrap()
        };
        let first = revision();
        store.index_source(id, &router, &binding, None).unwrap();
        assert_eq!(first, revision());
        assert!(!store
            .search("alpha", &["1".into()], &router, &binding, |_| None, 6)
            .unwrap()
            .is_empty());
        store
            .conn()
            .unwrap()
            .execute("UPDATE ai_sources SET enabled=0 WHERE id=?1", [id])
            .unwrap();
        assert!(store
            .search("alpha", &["1".into()], &router, &binding, |_| None, 6)
            .unwrap()
            .is_empty());
        store
            .conn()
            .unwrap()
            .execute("UPDATE ai_sources SET enabled=1 WHERE id=?1", [id])
            .unwrap();
        fs::write(&file, "Synthetic policy changed alpha").unwrap();
        store.index_source(id, &router, &binding, None).unwrap();
        assert_ne!(first, revision());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn unavailable_ai_keeps_invalid_database_untouched() {
        let path = std::env::temp_dir().join(format!(
            "tcs-invalid-ai-{}-{}.db",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::write(&path, b"synthetic invalid database").unwrap();
        assert!(AiStore::open(&path).is_err());
        let unavailable = AiStore::unavailable(&path);
        assert!(unavailable.runtime_config().is_err());
        assert_eq!(fs::read(&path).unwrap(), b"synthetic invalid database");
        fs::remove_file(path).unwrap();
    }
}
