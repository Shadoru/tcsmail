use crate::{config::AiRuntimeConfig, rag::AiStore};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

impl AiStore {
    /// Account, local row, content, prompt/configuration and RAG snapshot are all
    /// part of the key. RFC Message-ID is not an account-isolated identifier.
    pub fn analysis_cache_key(
        &self,
        account_id: i64,
        local_id: i64,
        content: &Value,
        config: &AiRuntimeConfig,
    ) -> Result<String, String> {
        let rag = if config.rag_enabled {
            let c = self.conn()?;
            let mut st = c.prepare("SELECT c.id,c.account_scope,c.enabled,s.id,s.enabled,s.current_revision_id FROM ai_collections c LEFT JOIN ai_sources s ON s.collection_id=c.id ORDER BY c.id,s.id").map_err(|e| e.to_string())?;
            let rows = st
                .query_map([], |r| {
                    Ok(json!([
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, i64>(2)?,
                        r.get::<_, Option<i64>>(3)?,
                        r.get::<_, Option<i64>>(4)?,
                        r.get::<_, Option<i64>>(5)?
                    ]))
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        } else {
            Vec::new()
        };
        let value = json!({"prompt_version":"analysis-0.8.3-v1", "account_id":account_id,
            "local_id":local_id, "content":content, "configuration":config,
            "providers":self.providers()?, "rag_snapshot":rag});
        Ok(format!(
            "analysis-v2:{:x}",
            Sha256::digest(value.to_string().as_bytes())
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temporary() -> AiStore {
        let p = std::env::temp_dir().join(format!(
            "tcs-analysis-cache-{}-{}.sqlite",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        AiStore::open(p).unwrap()
    }
    #[test]
    fn cache_isolated_by_account_row_content_locale_and_models() {
        let s = temporary();
        let cfg = AiRuntimeConfig::default();
        let content =
            json!({"message_id":"same@example.invalid","body":"original","locale":"pt-BR"});
        let original = s.analysis_cache_key(1, 1, &content, &cfg).unwrap();
        assert_eq!(
            original,
            s.analysis_cache_key(1, 1, &content, &cfg).unwrap()
        );
        assert_ne!(
            original,
            s.analysis_cache_key(2, 1, &content, &cfg).unwrap()
        );
        assert_ne!(
            original,
            s.analysis_cache_key(1, 2, &content, &cfg).unwrap()
        );
        assert_ne!(
            original,
            s.analysis_cache_key(1, 1, &json!({"body":"changed"}), &cfg)
                .unwrap()
        );
        let mut changed = cfg.clone();
        changed.fast.model = "other-model".into();
        assert_ne!(
            original,
            s.analysis_cache_key(1, 1, &content, &changed).unwrap()
        );
        let _ = std::fs::remove_file(s.path());
    }
    #[test]
    fn rag_changes_and_scope_changes_invalidate_cache() {
        let s = temporary();
        let cfg = AiRuntimeConfig {
            rag_enabled: true,
            ..AiRuntimeConfig::default()
        };
        let original = s.analysis_cache_key(1, 1, &Value::Null, &cfg).unwrap();
        s.add_collection("Synthetic", "1").unwrap();
        let with_collection = s.analysis_cache_key(1, 1, &Value::Null, &cfg).unwrap();
        assert_ne!(original, with_collection);
        s.conn()
            .unwrap()
            .execute(
                "UPDATE ai_collections SET account_scope='2' WHERE name='Synthetic'",
                [],
            )
            .unwrap();
        assert_ne!(
            with_collection,
            s.analysis_cache_key(1, 1, &Value::Null, &cfg).unwrap()
        );
        let _ = std::fs::remove_file(s.path());
    }
}
