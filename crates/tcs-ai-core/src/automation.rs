use crate::{
    policy::ToolPolicy,
    tools::{gate, GatedToolRequest, ToolRequest},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashSet, VecDeque};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutomationProposal {
    pub run_id: String,
    pub step: usize,
    pub gated: GatedToolRequest,
    pub shadow_mode: bool,
}

pub struct AutomationGuard {
    seen: HashSet<String>,
    recent: VecDeque<String>,
    max_steps: usize,
}

impl AutomationGuard {
    pub fn new(max_steps: usize) -> Self {
        Self {
            seen: HashSet::new(),
            recent: VecDeque::new(),
            max_steps: max_steps.max(1),
        }
    }
    pub fn accept(&mut self, key: &str) -> Result<(), String> {
        if key.trim().is_empty() {
            return Err("idempotency_key obrigatória".into());
        }
        if self.seen.contains(key) {
            return Err("ação duplicada bloqueada por idempotência".into());
        }
        if self.recent.len() >= self.max_steps {
            return Err("limite de passos atingido; possível loop de automação".into());
        }
        self.seen.insert(key.into());
        self.recent.push_back(key.into());
        Ok(())
    }
}

pub fn propose(
    run_id: &str,
    step: usize,
    policy: &ToolPolicy,
    tool: &str,
    arguments: Value,
    idempotency_key: &str,
) -> Result<AutomationProposal, String> {
    let request = ToolRequest {
        tool: tool.into(),
        arguments,
        idempotency_key: idempotency_key.into(),
    };
    let gated = gate(policy, request);
    Ok(AutomationProposal {
        run_id: run_id.into(),
        step,
        gated,
        shadow_mode: policy.shadow_mode,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shadow_never_sends() {
        let p = ToolPolicy::default();
        let x = propose("r", 0, &p, "mail.send", Value::Null, "k").unwrap();
        assert!(!x.gated.decision.allowed);
    }
    #[test]
    fn duplicate_is_blocked() {
        let mut g = AutomationGuard::new(3);
        g.accept("a").unwrap();
        assert!(g.accept("a").is_err());
    }
}
