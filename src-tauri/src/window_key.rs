// SPDX-License-Identifier: MPL-2.0
//! Normalização comum aos comandos de abrir e fechar janelas nativas.
//! Preserva a regra histórica: filtra caracteres, limita a 96 e rejeita resultado vazio.

pub(crate) fn normalize_window_key(key: &str) -> Result<String, String> {
    let safe_key: String = key
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(96)
        .collect();
    if safe_key.is_empty() {
        return Err("identificador de janela inválido".into());
    }
    Ok(safe_key)
}

#[cfg(test)]
mod tests {
    use super::normalize_window_key;
    #[test]
    fn preserves_existing_filtering_behavior() {
        assert_eq!(normalize_window_key(" A/b_c-1 ").unwrap(), "Ab_c-1");
        assert!(normalize_window_key("⚡ / ").is_err());
    }
    #[test]
    fn caps_output_to_96_ascii_characters() {
        assert_eq!(normalize_window_key(&"a".repeat(120)).unwrap().len(), 96);
    }
}
