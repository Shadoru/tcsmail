use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use thiserror::Error;

use crate::config::{ProviderConfig, ProviderKind};

#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("provider não encontrado: {0}")]
    NotFound(String),
    #[error("provider desativado: {0}")]
    Disabled(String),
    #[error("credencial ausente para provider {0}")]
    CredentialMissing(String),
    #[error("requisição ao provider falhou: {0}")]
    Http(String),
    #[error("resposta inválida do provider: {0}")]
    Invalid(String),
    #[error("operação não suportada pelo provider: {0}")]
    Unsupported(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProviderCapabilities {
    pub chat: bool,
    pub embeddings: bool,
    pub list_models: bool,
    pub structured_outputs: bool,
}

pub struct ProviderRouter {
    client: Client,
    providers: HashMap<String, ProviderConfig>,
}

impl ProviderRouter {
    pub fn new(providers: Vec<ProviderConfig>) -> Result<Self, ProviderError> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(600))
            .build()
            .map_err(|e| ProviderError::Http(e.to_string()))?;
        Ok(Self {
            client,
            providers: providers.into_iter().map(|p| (p.id.clone(), p)).collect(),
        })
    }

    pub fn capabilities(&self, id: &str) -> Result<ProviderCapabilities, ProviderError> {
        let p = self.provider(id)?;
        Ok(match p.kind {
            ProviderKind::Anthropic => ProviderCapabilities {
                chat: true,
                embeddings: false,
                list_models: false,
                structured_outputs: false,
            },
            ProviderKind::Gemini => ProviderCapabilities {
                chat: true,
                embeddings: true,
                list_models: true,
                structured_outputs: true,
            },
            ProviderKind::AwsBedrock | ProviderKind::VertexAi => ProviderCapabilities {
                chat: true,
                embeddings: true,
                list_models: false,
                structured_outputs: true,
            },
            _ => ProviderCapabilities {
                chat: true,
                embeddings: true,
                list_models: true,
                structured_outputs: true,
            },
        })
    }

    fn provider(&self, id: &str) -> Result<&ProviderConfig, ProviderError> {
        let p = self
            .providers
            .get(id)
            .ok_or_else(|| ProviderError::NotFound(id.into()))?;
        if !p.enabled {
            return Err(ProviderError::Disabled(id.into()));
        }
        Ok(p)
    }

    fn endpoint(p: &ProviderConfig, default: &str) -> String {
        if p.endpoint.trim().is_empty() {
            default.into()
        } else {
            p.endpoint.trim().trim_end_matches('/').into()
        }
    }
    fn bearer(headers: &mut HeaderMap, secret: &str) -> Result<(), ProviderError> {
        if secret.trim().is_empty() {
            return Err(ProviderError::CredentialMissing("bearer".into()));
        }
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", secret.trim()))
                .map_err(|e| ProviderError::Invalid(e.to_string()))?,
        );
        Ok(())
    }
    fn json_headers() -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        h
    }

    pub fn list_models(
        &self,
        id: &str,
        secret: Option<&str>,
    ) -> Result<Vec<String>, ProviderError> {
        let p = self.provider(id)?;
        match p.kind {
            ProviderKind::Anthropic | ProviderKind::AwsBedrock | ProviderKind::VertexAi => {
                Ok(Vec::new())
            }
            ProviderKind::Gemini => {
                let key = secret.unwrap_or("");
                if key.is_empty() {
                    return Err(ProviderError::CredentialMissing(p.id.clone()));
                }
                let base = Self::endpoint(p, "https://generativelanguage.googleapis.com");
                let v: Value = self
                    .client
                    .get(format!(
                        "{base}/v1beta/models?key={}",
                        urlencoding::encode(key)
                    ))
                    .send()
                    .map_err(|e| ProviderError::Http(e.to_string()))?
                    .error_for_status()
                    .map_err(|e| ProviderError::Http(e.to_string()))?
                    .json()
                    .map_err(|e| ProviderError::Invalid(e.to_string()))?;
                Ok(v.get("models")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(|m| m.get("name").and_then(Value::as_str))
                    .map(|s| s.trim_start_matches("models/").to_string())
                    .collect())
            }
            _ => {
                let base = Self::endpoint(
                    p,
                    if matches!(p.kind, ProviderKind::OpenAi) {
                        "https://api.openai.com"
                    } else {
                        "http://127.0.0.1:9292"
                    },
                );
                let base = base.trim_end_matches("/v1");
                let mut h = Self::json_headers();
                if !matches!(p.kind, ProviderKind::OpenAiCompatible)
                    || !secret.unwrap_or("").trim().is_empty()
                {
                    if let Some(s) = secret {
                        if !s.trim().is_empty() {
                            Self::bearer(&mut h, s)?;
                        }
                    }
                }
                let v: Value = self
                    .client
                    .get(format!("{base}/v1/models"))
                    .headers(h)
                    .send()
                    .map_err(|e| ProviderError::Http(e.to_string()))?
                    .error_for_status()
                    .map_err(|e| ProviderError::Http(e.to_string()))?
                    .json()
                    .map_err(|e| ProviderError::Invalid(e.to_string()))?;
                Ok(v.get("data")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(|m| m.get("id").and_then(Value::as_str))
                    .map(str::to_string)
                    .collect())
            }
        }
    }

    pub fn chat(
        &self,
        id: &str,
        secret: Option<&str>,
        model: &str,
        messages: &[ChatMessage],
        temperature: f32,
        structured_schema: Option<&Value>,
    ) -> Result<String, ProviderError> {
        let p = self.provider(id)?;
        if model.trim().is_empty() {
            return Err(ProviderError::Invalid("modelo vazio".into()));
        }
        let started = Instant::now();
        let result = self.chat_inner(p, secret, model, messages, temperature, structured_schema);
        match &result {
            Ok(text) => eprintln!(
                "[tcs-ai] chat success provider={} model={} duration_ms={} output_chars={}",
                p.id,
                model,
                started.elapsed().as_millis(),
                text.chars().count()
            ),
            Err(error) => eprintln!(
                "[tcs-ai] chat failure provider={} model={} duration_ms={} error_kind={}",
                p.id,
                model,
                started.elapsed().as_millis(),
                match error {
                    ProviderError::Http(_) => "http",
                    ProviderError::Invalid(_) => "invalid",
                    _ => "other",
                }
            ),
        }
        result
    }

    fn chat_inner(
        &self,
        p: &ProviderConfig,
        secret: Option<&str>,
        model: &str,
        messages: &[ChatMessage],
        temperature: f32,
        structured_schema: Option<&Value>,
    ) -> Result<String, ProviderError> {
        let timeout = Duration::from_secs(p.chat_timeout_secs.clamp(30, 1800));
        match p.kind {
            ProviderKind::Anthropic => {
                let key = secret.unwrap_or("");
                if key.is_empty() {
                    return Err(ProviderError::CredentialMissing(p.id.clone()));
                }
                let base = Self::endpoint(p, "https://api.anthropic.com");
                let mut h = Self::json_headers();
                h.insert(
                    HeaderName::from_static("x-api-key"),
                    HeaderValue::from_str(key)
                        .map_err(|e| ProviderError::Invalid(e.to_string()))?,
                );
                h.insert(
                    HeaderName::from_static("anthropic-version"),
                    HeaderValue::from_static("2023-06-01"),
                );
                let system = messages
                    .iter()
                    .filter(|m| m.role == "system")
                    .map(|m| m.content.as_str())
                    .collect::<Vec<_>>()
                    .join("\n\n");
                let msgs = messages
                    .iter()
                    .filter(|m| m.role != "system")
                    .map(|m| json!({"role":m.role,"content":m.content}))
                    .collect::<Vec<_>>();
                let v:Value=self.client.post(format!("{base}/v1/messages")).timeout(timeout).headers(h).json(&json!({"model":model,"max_tokens":4096,"temperature":temperature,"system":system,"messages":msgs})).send().map_err(|e|ProviderError::Http(e.to_string()))?.error_for_status().map_err(|e|ProviderError::Http(e.to_string()))?.json().map_err(|e|ProviderError::Invalid(e.to_string()))?;
                v.get("content")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .find_map(|x| x.get("text").and_then(Value::as_str))
                    .map(str::to_string)
                    .ok_or_else(|| ProviderError::Invalid("Anthropic sem conteúdo".into()))
            }
            ProviderKind::Gemini => {
                let key = secret.unwrap_or("");
                if key.is_empty() {
                    return Err(ProviderError::CredentialMissing(p.id.clone()));
                }
                let base = Self::endpoint(p, "https://generativelanguage.googleapis.com");
                let text = messages
                    .iter()
                    .map(|m| format!("{}: {}", m.role, m.content))
                    .collect::<Vec<_>>()
                    .join("\n\n");
                let v:Value=self.client.post(format!("{base}/v1beta/models/{}:generateContent?key={}",urlencoding::encode(model),urlencoding::encode(key))).timeout(timeout).json(&json!({"contents":[{"parts":[{"text":text}]}],"generationConfig":{"temperature":temperature}})).send().map_err(|e|ProviderError::Http(e.to_string()))?.error_for_status().map_err(|e|ProviderError::Http(e.to_string()))?.json().map_err(|e|ProviderError::Invalid(e.to_string()))?;
                v.pointer("/candidates/0/content/parts/0/text")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .ok_or_else(|| ProviderError::Invalid("Gemini sem conteúdo".into()))
            }
            ProviderKind::AzureOpenAi => {
                let key = secret.unwrap_or("");
                if key.is_empty() {
                    return Err(ProviderError::CredentialMissing(p.id.clone()));
                }
                let base = Self::endpoint(p, "");
                if base.is_empty() {
                    return Err(ProviderError::Invalid("endpoint Azure obrigatório".into()));
                }
                let api = if p.api_version.trim().is_empty() {
                    "2024-10-21"
                } else {
                    p.api_version.trim()
                };
                let mut h = Self::json_headers();
                h.insert(
                    HeaderName::from_static("api-key"),
                    HeaderValue::from_str(key)
                        .map_err(|e| ProviderError::Invalid(e.to_string()))?,
                );
                let mut payload = json!({"messages":messages,"temperature":temperature});
                if let Some(schema) = structured_schema {
                    payload["response_format"] = json!({"type":"json_schema","json_schema":schema});
                }
                let v: Value = self
                    .client
                    .post(format!(
                        "{base}/openai/deployments/{}/chat/completions?api-version={}",
                        urlencoding::encode(model),
                        urlencoding::encode(api)
                    ))
                    .timeout(timeout)
                    .headers(h)
                    .json(&payload)
                    .send()
                    .map_err(|e| ProviderError::Http(e.to_string()))?
                    .error_for_status()
                    .map_err(|e| ProviderError::Http(e.to_string()))?
                    .json()
                    .map_err(|e| ProviderError::Invalid(e.to_string()))?;
                v.pointer("/choices/0/message/content")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .ok_or_else(|| ProviderError::Invalid("Azure OpenAI sem conteúdo".into()))
            }
            ProviderKind::AwsBedrock | ProviderKind::VertexAi => {
                let token = secret.unwrap_or("");
                if token.is_empty() {
                    return Err(ProviderError::CredentialMissing(p.id.clone()));
                }
                let base = Self::endpoint(p, "");
                if base.is_empty() {
                    return Err(ProviderError::Invalid(
                        "endpoint/gateway do provider obrigatório".into(),
                    ));
                }
                let mut h = Self::json_headers();
                Self::bearer(&mut h, token)?;
                let mut payload =
                    json!({"model":model,"messages":messages,"temperature":temperature});
                if let Some(schema) = structured_schema {
                    payload["response_format"] = json!({"type":"json_schema","json_schema":schema});
                }
                let v: Value = self
                    .client
                    .post(format!("{base}/v1/chat/completions"))
                    .timeout(timeout)
                    .headers(h)
                    .json(&payload)
                    .send()
                    .map_err(|e| ProviderError::Http(e.to_string()))?
                    .error_for_status()
                    .map_err(|e| ProviderError::Http(e.to_string()))?
                    .json()
                    .map_err(|e| ProviderError::Invalid(e.to_string()))?;
                v.pointer("/choices/0/message/content")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .ok_or_else(|| ProviderError::Invalid("provider cloud sem conteúdo".into()))
            }
            _ => {
                let base = Self::endpoint(
                    p,
                    if matches!(p.kind, ProviderKind::OpenAi) {
                        "https://api.openai.com"
                    } else {
                        "http://127.0.0.1:9292"
                    },
                );
                let base = base.trim_end_matches("/v1");
                let mut h = Self::json_headers();
                if matches!(p.kind, ProviderKind::OpenAi | ProviderKind::Custom)
                    || !secret.unwrap_or("").trim().is_empty()
                {
                    if let Some(s) = secret {
                        if !s.trim().is_empty() {
                            Self::bearer(&mut h, s)?;
                        }
                    }
                }
                let mut payload =
                    json!({"model":model,"messages":messages,"temperature":temperature});
                if let Some(schema) = structured_schema {
                    payload["response_format"] = json!({"type":"json_schema","json_schema":schema});
                }
                let v: Value = self
                    .client
                    .post(format!("{base}/v1/chat/completions"))
                    .timeout(timeout)
                    .headers(h)
                    .json(&payload)
                    .send()
                    .map_err(|e| ProviderError::Http(e.to_string()))?
                    .error_for_status()
                    .map_err(|e| ProviderError::Http(e.to_string()))?
                    .json()
                    .map_err(|e| ProviderError::Invalid(e.to_string()))?;
                parse_chat_content(&v)
            }
        }
    }

    /// Cancellable chat transport for any configured HTTP chat provider. Dropping
    /// this future drops the in-flight reqwest request, independently of vendor.
    /// Remote providers may still continue server-side generation/billing.
    pub async fn chat_async(
        &self,
        id: &str,
        secret: Option<&str>,
        model: &str,
        messages: &[ChatMessage],
        temperature: f32,
        structured_schema: Option<&Value>,
    ) -> Result<String, ProviderError> {
        let p = self.provider(id)?;
        if model.trim().is_empty() {
            return Err(ProviderError::Invalid("modelo vazio".into()));
        }
        let timeout = Duration::from_secs(p.chat_timeout_secs.clamp(30, 1800));
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(timeout)
            .build()
            .map_err(|e| ProviderError::Http(e.to_string()))?;
        let mut headers = Self::json_headers();
        let (url, payload) = match p.kind {
            ProviderKind::Anthropic => {
                let key = secret
                    .filter(|s| !s.trim().is_empty())
                    .ok_or_else(|| ProviderError::CredentialMissing(p.id.clone()))?;
                headers.insert(
                    HeaderName::from_static("x-api-key"),
                    HeaderValue::from_str(key)
                        .map_err(|e| ProviderError::Invalid(e.to_string()))?,
                );
                headers.insert(
                    HeaderName::from_static("anthropic-version"),
                    HeaderValue::from_static("2023-06-01"),
                );
                let system = messages
                    .iter()
                    .filter(|m| m.role == "system")
                    .map(|m| m.content.as_str())
                    .collect::<Vec<_>>()
                    .join("\n\n");
                let msgs = messages
                    .iter()
                    .filter(|m| m.role != "system")
                    .map(|m| json!({"role":m.role,"content":m.content}))
                    .collect::<Vec<_>>();
                (
                    format!(
                        "{}/v1/messages",
                        Self::endpoint(p, "https://api.anthropic.com")
                    ),
                    json!({"model":model,"max_tokens":4096,"temperature":temperature,"system":system,"messages":msgs}),
                )
            }
            ProviderKind::Gemini => {
                let key = secret
                    .filter(|s| !s.trim().is_empty())
                    .ok_or_else(|| ProviderError::CredentialMissing(p.id.clone()))?;
                let text = messages
                    .iter()
                    .map(|m| format!("{}: {}", m.role, m.content))
                    .collect::<Vec<_>>()
                    .join("\n\n");
                (
                    format!(
                        "{}/v1beta/models/{}:generateContent?key={}",
                        Self::endpoint(p, "https://generativelanguage.googleapis.com"),
                        urlencoding::encode(model),
                        urlencoding::encode(key)
                    ),
                    json!({"contents":[{"parts":[{"text":text}]}],"generationConfig":{"temperature":temperature}}),
                )
            }
            ProviderKind::AzureOpenAi => {
                let key = secret
                    .filter(|s| !s.trim().is_empty())
                    .ok_or_else(|| ProviderError::CredentialMissing(p.id.clone()))?;
                let base = Self::endpoint(p, "");
                if base.is_empty() {
                    return Err(ProviderError::Invalid("endpoint Azure obrigatório".into()));
                }
                headers.insert(
                    HeaderName::from_static("api-key"),
                    HeaderValue::from_str(key)
                        .map_err(|e| ProviderError::Invalid(e.to_string()))?,
                );
                let api = if p.api_version.trim().is_empty() {
                    "2024-10-21"
                } else {
                    p.api_version.trim()
                };
                let mut payload = json!({"messages":messages,"temperature":temperature});
                if let Some(schema) = structured_schema {
                    payload["response_format"] = json!({"type":"json_schema","json_schema":schema});
                }
                (
                    format!(
                        "{base}/openai/deployments/{}/chat/completions?api-version={}",
                        urlencoding::encode(model),
                        urlencoding::encode(api)
                    ),
                    payload,
                )
            }
            ProviderKind::AwsBedrock | ProviderKind::VertexAi => {
                let token = secret
                    .filter(|s| !s.trim().is_empty())
                    .ok_or_else(|| ProviderError::CredentialMissing(p.id.clone()))?;
                let base = Self::endpoint(p, "");
                if base.is_empty() {
                    return Err(ProviderError::Invalid(
                        "endpoint/gateway obrigatório".into(),
                    ));
                }
                Self::bearer(&mut headers, token)?;
                let mut payload =
                    json!({"model":model,"messages":messages,"temperature":temperature});
                if let Some(schema) = structured_schema {
                    payload["response_format"] = json!({"type":"json_schema","json_schema":schema});
                }
                (format!("{base}/v1/chat/completions"), payload)
            }
            _ => {
                let base = Self::endpoint(
                    p,
                    if matches!(p.kind, ProviderKind::OpenAi) {
                        "https://api.openai.com"
                    } else {
                        "http://127.0.0.1:9292"
                    },
                );
                if let Some(key) = secret.filter(|s| !s.trim().is_empty()) {
                    Self::bearer(&mut headers, key)?;
                }
                let mut payload =
                    json!({"model":model,"messages":messages,"temperature":temperature});
                if let Some(schema) = structured_schema {
                    payload["response_format"] = json!({"type":"json_schema","json_schema":schema});
                }
                (
                    format!("{}/v1/chat/completions", base.trim_end_matches("/v1")),
                    payload,
                )
            }
        };
        let response = client
            .post(url)
            .headers(headers)
            .json(&payload)
            .send()
            .await
            .map_err(|e| ProviderError::Http(e.to_string()))?
            .error_for_status()
            .map_err(|e| ProviderError::Http(e.to_string()))?;
        let result: Value = response
            .json()
            .await
            .map_err(|e| ProviderError::Invalid(e.to_string()))?;
        match p.kind {
            ProviderKind::Anthropic => result
                .get("content")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .find_map(|part| part.get("text").and_then(Value::as_str))
                .map(str::to_string)
                .ok_or_else(|| ProviderError::Invalid("Anthropic sem conteúdo".into())),
            ProviderKind::Gemini => result
                .pointer("/candidates/0/content/parts/0/text")
                .and_then(Value::as_str)
                .map(str::to_string)
                .ok_or_else(|| ProviderError::Invalid("Gemini sem conteúdo".into())),
            _ => parse_chat_content(&result),
        }
    }

    pub fn embeddings(
        &self,
        id: &str,
        secret: Option<&str>,
        model: &str,
        input: &[String],
    ) -> Result<Vec<Vec<f32>>, ProviderError> {
        if input.is_empty() {
            return Ok(Vec::new());
        }
        let p = self.provider(id)?;
        match p.kind {
            ProviderKind::Anthropic => Err(ProviderError::Unsupported(
                "Anthropic não expõe embeddings neste adaptador".into(),
            )),
            ProviderKind::Gemini => {
                let key = secret.unwrap_or("");
                if key.is_empty() {
                    return Err(ProviderError::CredentialMissing(p.id.clone()));
                }
                let base = Self::endpoint(p, "https://generativelanguage.googleapis.com");
                let mut out = Vec::with_capacity(input.len());
                for text in input {
                    let v: Value = self
                        .client
                        .post(format!(
                            "{base}/v1beta/models/{}:embedContent?key={}",
                            urlencoding::encode(model),
                            urlencoding::encode(key)
                        ))
                        .json(&json!({"content":{"parts":[{"text":text}]}}))
                        .send()
                        .map_err(|e| ProviderError::Http(e.to_string()))?
                        .error_for_status()
                        .map_err(|e| ProviderError::Http(e.to_string()))?
                        .json()
                        .map_err(|e| ProviderError::Invalid(e.to_string()))?;
                    let vec = v
                        .pointer("/embedding/values")
                        .and_then(Value::as_array)
                        .ok_or_else(|| {
                            ProviderError::Invalid("Gemini embedding inválido".into())
                        })?;
                    let vec = parse_embedding_values(vec)?;
                    if out
                        .first()
                        .is_some_and(|first: &Vec<f32>| first.len() != vec.len())
                    {
                        return Err(ProviderError::Invalid(
                            "dimensões inconsistentes dos embeddings".into(),
                        ));
                    }
                    out.push(vec);
                }
                Ok(out)
            }
            ProviderKind::AzureOpenAi => {
                let key = secret.unwrap_or("");
                if key.is_empty() {
                    return Err(ProviderError::CredentialMissing(p.id.clone()));
                }
                let base = Self::endpoint(p, "");
                let api = if p.api_version.trim().is_empty() {
                    "2024-10-21"
                } else {
                    p.api_version.trim()
                };
                let mut h = Self::json_headers();
                h.insert(
                    HeaderName::from_static("api-key"),
                    HeaderValue::from_str(key)
                        .map_err(|e| ProviderError::Invalid(e.to_string()))?,
                );
                let v: Value = self
                    .client
                    .post(format!(
                        "{base}/openai/deployments/{}/embeddings?api-version={}",
                        urlencoding::encode(model),
                        urlencoding::encode(api)
                    ))
                    .headers(h)
                    .json(&json!({"input":input}))
                    .send()
                    .map_err(|e| ProviderError::Http(e.to_string()))?
                    .error_for_status()
                    .map_err(|e| ProviderError::Http(e.to_string()))?
                    .json()
                    .map_err(|e| ProviderError::Invalid(e.to_string()))?;
                parse_embeddings(&v)
            }
            _ => {
                let base = Self::endpoint(
                    p,
                    if matches!(p.kind, ProviderKind::OpenAi) {
                        "https://api.openai.com"
                    } else {
                        "http://127.0.0.1:9292"
                    },
                );
                let base = base.trim_end_matches("/v1");
                let mut h = Self::json_headers();
                if matches!(
                    p.kind,
                    ProviderKind::OpenAi
                        | ProviderKind::Custom
                        | ProviderKind::AwsBedrock
                        | ProviderKind::VertexAi
                ) || !secret.unwrap_or("").trim().is_empty()
                {
                    if let Some(s) = secret {
                        if !s.trim().is_empty() {
                            Self::bearer(&mut h, s)?;
                        }
                    }
                }
                let v: Value = self
                    .client
                    .post(format!("{base}/v1/embeddings"))
                    .headers(h)
                    .json(&json!({"model":model,"input":input}))
                    .send()
                    .map_err(|e| ProviderError::Http(e.to_string()))?
                    .error_for_status()
                    .map_err(|e| ProviderError::Http(e.to_string()))?
                    .json()
                    .map_err(|e| ProviderError::Invalid(e.to_string()))?;
                parse_embeddings(&v)
            }
        }
    }
}

fn parse_embedding_values(values: &[Value]) -> Result<Vec<f32>, ProviderError> {
    if values.is_empty() {
        return Err(ProviderError::Invalid("embedding vazio".into()));
    }
    values
        .iter()
        .map(|value| {
            let number = value.as_f64().ok_or_else(|| {
                ProviderError::Invalid("embedding contém valor não numérico".into())
            })?;
            let coordinate = number as f32;
            if !coordinate.is_finite() {
                return Err(ProviderError::Invalid(
                    "embedding contém valor não finito".into(),
                ));
            }
            Ok(coordinate)
        })
        .collect()
}

fn parse_embeddings(v: &Value) -> Result<Vec<Vec<f32>>, ProviderError> {
    let rows = v
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| ProviderError::Invalid("embeddings sem data".into()))?;
    if rows.is_empty() {
        return Err(ProviderError::Invalid("embeddings vazios".into()));
    }
    let mut ordered = Vec::with_capacity(rows.len());
    for (position, row) in rows.iter().enumerate() {
        // A few compatible local servers omit `index` and preserve input order.
        let index = match row.get("index") {
            Some(value) => value
                .as_u64()
                .and_then(|n| usize::try_from(n).ok())
                .ok_or_else(|| ProviderError::Invalid("índice de embedding inválido".into()))?,
            None => position,
        };
        let values = row
            .get("embedding")
            .and_then(Value::as_array)
            .ok_or_else(|| ProviderError::Invalid("embedding inválido".into()))?;
        ordered.push((index, parse_embedding_values(values)?));
    }
    ordered.sort_by_key(|(index, _)| *index);
    let dimension = ordered[0].1.len();
    for (expected, (index, embedding)) in ordered.iter().enumerate() {
        if *index != expected {
            return Err(ProviderError::Invalid(
                "índices de embeddings duplicados ou ausentes".into(),
            ));
        }
        if embedding.len() != dimension {
            return Err(ProviderError::Invalid(
                "dimensões inconsistentes dos embeddings".into(),
            ));
        }
    }
    Ok(ordered
        .into_iter()
        .map(|(_, embedding)| embedding)
        .collect())
}

fn parse_chat_content(v: &Value) -> Result<String, ProviderError> {
    let content = v
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if !content.is_empty() {
        return Ok(content.to_string());
    }
    let finish = v
        .pointer("/choices/0/finish_reason")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    Err(ProviderError::Invalid(format!("Resposta sem conteúdo final (finish_reason={finish}). O modelo pode ter usado todos os tokens em raciocínio; aumente o limite no servidor ou escolha outro modelo.")))
}

#[cfg(test)]
mod ai_transport_regression_tests {
    use super::*;
    #[test]
    fn no_reasoning_leak() {
        let v = json!({"choices":[{"finish_reason":"length","message":{"content":"","reasoning_content":"segredo"}}]});
        let e = parse_chat_content(&v).unwrap_err().to_string();
        assert!(e.contains("length"));
        assert!(!e.contains("segredo"));
    }
    #[test]
    fn content_only() {
        let v = json!({"choices":[{"finish_reason":"stop","message":{"content":"OK","reasoning_content":"segredo"}}]});
        assert_eq!(parse_chat_content(&v).unwrap(), "OK");
    }
    #[test]
    fn default_timeout_is_bounded() {
        let cfg = ProviderConfig::default();
        assert_eq!(cfg.chat_timeout_secs, 600);
        assert_eq!(0_u64.clamp(30, 1800), 30);
    }
}

#[cfg(test)]
mod provider_embedding_validation_tests {
    use super::*;
    #[test]
    fn preserves_index_order_and_local_unindexed_servers() {
        let indexed =
            json!({"data":[{"index":1,"embedding":[3.0,4.0]},{"index":0,"embedding":[1.0,2.0]}]});
        assert_eq!(
            parse_embeddings(&indexed).unwrap(),
            vec![vec![1.0, 2.0], vec![3.0, 4.0]]
        );
        let unindexed = json!({"data":[{"embedding":[1.0,2.0]},{"embedding":[3.0,4.0]}]});
        assert_eq!(parse_embeddings(&unindexed).unwrap().len(), 2);
    }
    #[test]
    fn rejects_invalid_coordinates_and_shape() {
        for data in [
            json!({"data":[{"index":0,"embedding":[1.0,"bad"]}]}),
            json!({"data":[{"index":0,"embedding":[]}]}),
            json!({"data":[{"index":0,"embedding":[1.0]},{"index":0,"embedding":[2.0]}]}),
            json!({"data":[{"index":0,"embedding":[1.0]},{"index":1,"embedding":[2.0,3.0]}]}),
            json!({"data":[{"index":2,"embedding":[1.0]}]}),
        ] {
            assert!(parse_embeddings(&data).is_err(), "{data}");
        }
    }
}
