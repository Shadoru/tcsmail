// SPDX-License-Identifier: MPL-2.0
//! Compatibility boundary for the existing local RAG search scopes.
//!
//! The wildcard is retained for backward compatibility. This function is NOT
//! an authorization decision: authorization must be enforced at the command/
//! caller boundary before any account-specific content is exposed.

pub(crate) fn legacy_search_scopes(scopes: &[String]) -> Vec<String> {
    let mut values = vec!["*".to_string()];
    for scope in scopes {
        let normalized = scope.trim().to_ascii_lowercase();
        if !normalized.is_empty() && !values.contains(&normalized) {
            values.push(normalized);
        }
    }
    values
}

#[cfg(test)]
mod tests {
    use super::legacy_search_scopes;

    #[test]
    fn preserves_global_scope_and_deduplicates() {
        let scopes = vec![" Account-A ".into(), "account-a".into(), "".into()];
        assert_eq!(legacy_search_scopes(&scopes), vec!["*", "account-a"]);
    }

    #[test]
    fn retains_legacy_non_ascii_casing_behavior() {
        let scopes = vec!["ÄCCOUNT".into()];
        assert_eq!(legacy_search_scopes(&scopes), vec!["*", "Äccount"]);
    }
}
