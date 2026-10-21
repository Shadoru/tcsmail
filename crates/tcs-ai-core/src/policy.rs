use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPolicy {
    pub allow_read_mail: bool,
    pub allow_search_knowledge: bool,
    pub allow_create_draft: bool,
    pub allow_modify_draft: bool,
    pub allow_send_mail: bool,
    pub require_confirmation_for_send: bool,
    pub shadow_mode: bool,
}

impl Default for ToolPolicy {
    fn default() -> Self {
        Self {
            allow_read_mail: true,
            allow_search_knowledge: true,
            allow_create_draft: true,
            allow_modify_draft: true,
            allow_send_mail: false,
            require_confirmation_for_send: true,
            shadow_mode: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyDecision {
    pub allowed: bool,
    pub requires_confirmation: bool,
    pub reason: String,
}

pub fn decide(policy: &ToolPolicy, tool: &str) -> PolicyDecision {
    let (allowed, confirm, reason) = match tool {
        "mail.read" => (policy.allow_read_mail, false, "leitura permitida"),
        "knowledge.search" => (policy.allow_search_knowledge, false, "consulta permitida"),
        "draft.create" => (
            policy.allow_create_draft,
            false,
            "criação de rascunho permitida",
        ),
        "draft.modify" => (
            policy.allow_modify_draft,
            false,
            "alteração de rascunho permitida",
        ),
        "mail.send" if policy.shadow_mode => (false, true, "shadow mode nunca envia e-mail"),
        "mail.send" => (
            policy.allow_send_mail,
            policy.require_confirmation_for_send,
            "envio sujeito à política determinística",
        ),
        _ => (false, false, "ferramenta não autorizada"),
    };
    PolicyDecision {
        allowed,
        requires_confirmation: confirm,
        reason: reason.into(),
    }
}
