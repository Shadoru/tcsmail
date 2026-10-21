use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::policy::{decide, PolicyDecision, ToolPolicy};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolRequest {
    pub tool: String,
    #[serde(default)]
    pub arguments: Value,
    #[serde(default)]
    pub idempotency_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatedToolRequest {
    pub request: ToolRequest,
    pub decision: PolicyDecision,
}

pub fn gate(policy: &ToolPolicy, request: ToolRequest) -> GatedToolRequest {
    let decision = decide(policy, &request.tool);
    GatedToolRequest { request, decision }
}
