use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    OpenAiCompatible,
    OpenAi,
    Anthropic,
    Gemini,
    AzureOpenAi,
    AwsBedrock,
    VertexAi,
    Custom,
}

impl ProviderKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::OpenAiCompatible => "openai_compatible",
            Self::OpenAi => "openai",
            Self::Anthropic => "anthropic",
            Self::Gemini => "gemini",
            Self::AzureOpenAi => "azure_openai",
            Self::AwsBedrock => "aws_bedrock",
            Self::VertexAi => "vertex_ai",
            Self::Custom => "custom",
        }
    }
    pub fn parse(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "openai" => Self::OpenAi,
            "anthropic" => Self::Anthropic,
            "gemini" => Self::Gemini,
            "azure_openai" | "azure" => Self::AzureOpenAi,
            "aws_bedrock" | "bedrock" => Self::AwsBedrock,
            "vertex_ai" | "vertex" => Self::VertexAi,
            "custom" => Self::Custom,
            _ => Self::OpenAiCompatible,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub kind: ProviderKind,
    pub endpoint: String,
    pub enabled: bool,
    #[serde(default)]
    pub api_version: String,
    #[serde(default)]
    pub project: String,
    #[serde(default)]
    pub region: String,
    #[serde(default = "default_chat_timeout_secs")]
    pub chat_timeout_secs: u64,
}

pub fn default_chat_timeout_secs() -> u64 {
    600
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            id: "local".into(),
            name: "OpenAI-compatible local".into(),
            kind: ProviderKind::OpenAiCompatible,
            endpoint: "http://127.0.0.1:9292".into(),
            enabled: true,
            api_version: String::new(),
            project: String::new(),
            region: String::new(),
            chat_timeout_secs: default_chat_timeout_secs(),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ModelRole {
    Fast,
    Advanced,
    Embedding,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelBinding {
    pub provider_id: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiRuntimeConfig {
    pub enabled: bool,
    pub rag_enabled: bool,
    pub fast: ModelBinding,
    pub advanced: ModelBinding,
    pub embedding: ModelBinding,
    pub analysis_scope: String,
    pub preanalyze_received: bool,
    pub shadow_mode: bool,
}

impl Default for AiRuntimeConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            rag_enabled: false,
            fast: ModelBinding::default(),
            advanced: ModelBinding::default(),
            embedding: ModelBinding::default(),
            analysis_scope: "none".into(),
            preanalyze_received: false,
            shadow_mode: true,
        }
    }
}
