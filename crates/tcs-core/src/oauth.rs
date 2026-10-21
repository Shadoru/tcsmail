use crate::{models::Account, secrets::SecretStore};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::Utc;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex, OnceLock},
    thread,
    time::Duration,
};
use url::Url;

// Microsoft desktop public-client application ID from the supplied Entra registration.
// This is intentionally public; NEVER ship a client_secret with the executable.
pub const MICROSOFT_CLIENT_ID: &str = "3ee22a21-a93b-458c-8602-dd8e2ddb65e9";
pub const MICROSOFT_AUTHORIZE: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
pub const MICROSOFT_TOKEN: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
// This client uses existing IMAP/SMTP transport, not Microsoft Graph.
// Microsoft Graph Mail.ReadWrite/Mail.Send grants are a DIFFERENT token resource.
pub const MICROSOFT_IMAP_SCOPE: &str = "https://outlook.office.com/IMAP.AccessAsUser.All";
pub const MICROSOFT_SMTP_SCOPE: &str = "https://outlook.office.com/SMTP.Send";
pub const MICROSOFT_MAIL_SCOPES: &str = "offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send";

pub const GOOGLE_CLIENT_ID: &str =
    "169826260257-cfn4rhifv0iunmlnbvsho51es5p1s98l.apps.googleusercontent.com";
// Desktop OAuth clients cannot keep this value confidential. Google nevertheless
// requires it for this installed client during token exchange/refresh. Never log it.
pub const GOOGLE_CLIENT_SECRET: &str = "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";
pub const GOOGLE_AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const GOOGLE_TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
pub const GOOGLE_REVOKE_ENDPOINT: &str = "https://oauth2.googleapis.com/revoke";
pub const GOOGLE_USERINFO_ENDPOINT: &str = "https://openidconnect.googleapis.com/v1/userinfo";
pub const GOOGLE_MAIL_SCOPE: &str = "https://mail.google.com/";
pub const GOOGLE_SCOPES: &str = "openid email https://mail.google.com/";

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GoogleOAuthAttempt {
    pub authorization_url: String,
    pub redirect_uri: String,
    pub state: String,
    #[serde(skip_serializing)]
    pub code_verifier: String,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GoogleTokenSet {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    #[serde(default)]
    pub refresh_token_expires_at: Option<i64>,
    #[serde(default)]
    pub scope: String,
    #[serde(default = "bearer")]
    pub token_type: String,
}

fn bearer() -> String {
    "Bearer".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GoogleIdentity {
    pub email: String,
    #[serde(default)]
    pub email_verified: bool,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub sub: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OAuthStatus {
    pub connected: bool,
    pub provider: String,
    pub expires_at: Option<i64>,
    pub refresh_token_expires_at: Option<i64>,
    pub needs_reconnect: bool,
    pub detail: String,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: i64,
    #[serde(default)]
    refresh_token_expires_in: Option<i64>,
    #[serde(default)]
    scope: String,
    #[serde(default = "bearer")]
    token_type: String,
}

#[derive(Debug, Deserialize)]
struct OAuthErrorBody {
    #[serde(default)]
    error: String,
    #[serde(default)]
    error_description: String,
}

fn random_urlsafe(bytes: usize) -> String {
    let mut raw = vec![0_u8; bytes];
    for chunk in raw.chunks_mut(32) {
        let r: [u8; 32] = rand::random();
        chunk.copy_from_slice(&r[..chunk.len()]);
    }
    URL_SAFE_NO_PAD.encode(raw)
}

pub fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub fn build_google_authorization(
    redirect_uri: &str,
    login_hint: Option<&str>,
) -> Result<GoogleOAuthAttempt, String> {
    let code_verifier = random_urlsafe(64);
    let state = random_urlsafe(32);
    build_google_authorization_with_values(redirect_uri, login_hint, code_verifier, state)
}

fn build_google_authorization_with_values(
    redirect_uri: &str,
    login_hint: Option<&str>,
    code_verifier: String,
    state: String,
) -> Result<GoogleOAuthAttempt, String> {
    if !(43..=128).contains(&code_verifier.len()) {
        return Err("PKCE code_verifier deve ter entre 43 e 128 caracteres".into());
    }
    let challenge = pkce_challenge(&code_verifier);
    let mut url = Url::parse(GOOGLE_AUTH_ENDPOINT).map_err(|e| e.to_string())?;
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("client_id", GOOGLE_CLIENT_ID)
            .append_pair("redirect_uri", redirect_uri)
            .append_pair("response_type", "code")
            .append_pair("scope", GOOGLE_SCOPES)
            .append_pair("code_challenge", &challenge)
            .append_pair("code_challenge_method", "S256")
            .append_pair("state", &state)
            .append_pair("access_type", "offline")
            .append_pair("include_granted_scopes", "true")
            // This function is only called for an explicit Add/Reconnect action. A durable
            // refresh token is required for IMAP IDLE/background sync, so consent is requested
            // here rather than later during automatic token refresh.
            .append_pair("prompt", "consent");
        if let Some(hint) = login_hint.map(str::trim).filter(|v| !v.is_empty()) {
            q.append_pair("login_hint", hint);
        }
    }
    Ok(GoogleOAuthAttempt {
        authorization_url: url.into(),
        redirect_uri: redirect_uri.to_string(),
        state,
        code_verifier,
    })
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(25))
        .user_agent("TCS-Mail/0.8.1")
        .build()
        .map_err(|e| format!("Falha ao preparar conexão OAuth: {e}"))
}

fn token_error(status: reqwest::StatusCode, body: &str) -> String {
    let parsed = serde_json::from_str::<OAuthErrorBody>(body).ok();
    if let Some(e) = parsed {
        if !e.error.is_empty() {
            let suffix = if e.error_description.is_empty() {
                String::new()
            } else {
                format!(": {}", e.error_description)
            };
            return format!("OAuth Google {} (HTTP {status}){suffix}", e.error);
        }
    }
    format!("OAuth Google falhou (HTTP {status})")
}

pub fn exchange_google_code(
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<GoogleTokenSet, String> {
    exchange_google_code_at(GOOGLE_TOKEN_ENDPOINT, code, code_verifier, redirect_uri)
}

fn exchange_google_code_at(
    endpoint: &str,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> Result<GoogleTokenSet, String> {
    let response = http_client()?
        .post(endpoint)
        .form(&[
            ("client_id", GOOGLE_CLIENT_ID),
            ("client_secret", GOOGLE_CLIENT_SECRET),
            ("code", code),
            ("code_verifier", code_verifier),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri),
        ])
        .send()
        .map_err(|e| format!("Não foi possível trocar o código OAuth: {e}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|e| format!("Resposta OAuth inválida: {e}"))?;
    if !status.is_success() {
        return Err(token_error(status, &body));
    }
    let token: TokenResponse =
        serde_json::from_str(&body).map_err(|e| format!("Resposta OAuth inválida: {e}"))?;
    let refresh_token = token
        .refresh_token
        .filter(|v| !v.is_empty())
        .unwrap_or_default();
    let now = Utc::now().timestamp();
    Ok(GoogleTokenSet {
        access_token: token.access_token,
        refresh_token,
        expires_at: now + token.expires_in.max(60),
        refresh_token_expires_at: token
            .refresh_token_expires_in
            .map(|seconds| now + seconds.max(0)),
        scope: token.scope,
        token_type: token.token_type,
    })
}

pub fn fetch_google_identity(access_token: &str) -> Result<GoogleIdentity, String> {
    fetch_google_identity_at(GOOGLE_USERINFO_ENDPOINT, access_token)
}

fn fetch_google_identity_at(endpoint: &str, access_token: &str) -> Result<GoogleIdentity, String> {
    let response = http_client()?
        .get(endpoint)
        .bearer_auth(access_token)
        .send()
        .map_err(|e| format!("Não foi possível confirmar a identidade Google: {e}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "Não foi possível confirmar a identidade Google (HTTP {status})"
        ));
    }
    let identity: GoogleIdentity = response
        .json()
        .map_err(|e| format!("Identidade Google inválida: {e}"))?;
    if identity.email.trim().is_empty() || !identity.email_verified {
        return Err("A conta Google não forneceu um e-mail verificado".into());
    }
    Ok(identity)
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0_u8;
    for (&x, &y) in a.iter().zip(b) {
        diff |= x ^ y;
    }
    diff == 0
}

pub fn parse_loopback_callback(target: &str, expected_state: &str) -> Result<String, String> {
    // Only accept an HTTP request target, not an absolute URL or authority.
    // Repeated OAuth parameters are ambiguous and must fail closed, rather
    // than silently accepting the last value in a HashMap collection.
    if !target.starts_with('/') || target.starts_with("//") || target.contains('#') {
        return Err("Callback OAuth inválido".into());
    }
    let url = Url::parse(&format!("http://127.0.0.1{target}"))
        .map_err(|_| "Callback OAuth inválido".to_string())?;
    if url.host_str() != Some("127.0.0.1") || url.path() != "/" {
        return Err("Callback OAuth inválido".into());
    }
    let mut params: HashMap<String, String> = HashMap::new();
    for (key, value) in url.query_pairs() {
        if params
            .insert(key.into_owned(), value.into_owned())
            .is_some()
        {
            return Err("Callback OAuth com parâmetro duplicado".into());
        }
    }
    if params.contains_key("error") && params.contains_key("code") {
        return Err("Callback OAuth ambíguo".into());
    }
    let returned_state = params.get("state").ok_or("Callback OAuth sem state")?;
    if !constant_time_eq(returned_state.as_bytes(), expected_state.as_bytes()) {
        return Err("Callback OAuth rejeitado: state não confere".into());
    }
    if let Some(error) = params.get("error") {
        let subtype = params
            .get("error_subtype")
            .map(String::as_str)
            .unwrap_or("");
        let description = params
            .get("error_description")
            .map(String::as_str)
            .unwrap_or("");
        let policy_blocked = error == "admin_policy_enforced"
            || subtype == "admin_policy_enforced"
            || description.contains("admin_policy_enforced");
        return Err(if policy_blocked {
            "A política do Google Workspace bloqueou a autorização do TCS Mail. Peça ao administrador do Workspace para permitir o aplicativo/escopo do Gmail.".into()
        } else {
            match error.as_str() {
                "access_denied" => "Autorização Google cancelada pelo usuário".into(),
                "org_internal" => "Esta conta não pode autorizar o aplicativo porque a política da organização Google restringe o acesso a usuários internos.".into(),
                _ if !description.trim().is_empty() => {
                    format!("Google retornou erro OAuth: {error} ({description})")
                }
                _ => format!("Google retornou erro OAuth: {error}"),
            }
        });
    }
    params
        .get("code")
        .filter(|v| !v.is_empty())
        .cloned()
        .ok_or_else(|| "Callback OAuth sem código de autorização".into())
}

pub fn google_secret_key(email: &str) -> String {
    format!("oauth:google:{}", email.trim().to_ascii_lowercase())
}

pub fn store_google_tokens(email: &str, tokens: &GoogleTokenSet) -> Result<(), String> {
    let json = serde_json::to_string(tokens).map_err(|e| e.to_string())?;
    SecretStore::store_secret(&google_secret_key(email), &json).map_err(|e| e.to_string())
}

pub fn load_google_tokens(email: &str) -> Result<GoogleTokenSet, String> {
    let raw = SecretStore::lookup_secret(&google_secret_key(email)).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| format!("Token OAuth salvo está corrompido: {e}"))
}

pub fn clear_google_tokens(email: &str) -> Result<(), String> {
    SecretStore::clear_secret(&google_secret_key(email)).map_err(|e| e.to_string())
}

fn refresh_locks() -> &'static Mutex<HashMap<String, Arc<Mutex<()>>>> {
    static LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();
    LOCKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn account_refresh_lock(email: &str) -> Arc<Mutex<()>> {
    let key = email.trim().to_ascii_lowercase();
    let mut locks = refresh_locks().lock().unwrap_or_else(|e| e.into_inner());
    locks
        .entry(key)
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

fn refresh_google_tokens_at(
    endpoint: &str,
    current: &GoogleTokenSet,
) -> Result<GoogleTokenSet, String> {
    let client = http_client()?;
    let mut last_network_error = None;
    for attempt in 0..3_u64 {
        let response = client
            .post(endpoint)
            .form(&[
                ("client_id", GOOGLE_CLIENT_ID),
                ("client_secret", GOOGLE_CLIENT_SECRET),
                ("refresh_token", current.refresh_token.as_str()),
                ("grant_type", "refresh_token"),
            ])
            .send();
        match response {
            Ok(response) => {
                let status = response.status();
                let body = response
                    .text()
                    .map_err(|e| format!("Resposta de renovação OAuth inválida: {e}"))?;
                if status.is_success() {
                    let token: TokenResponse = serde_json::from_str(&body)
                        .map_err(|e| format!("Resposta de renovação OAuth inválida: {e}"))?;
                    let now = Utc::now().timestamp();
                    return Ok(GoogleTokenSet {
                        access_token: token.access_token,
                        refresh_token: token
                            .refresh_token
                            .filter(|v| !v.is_empty())
                            .unwrap_or_else(|| current.refresh_token.clone()),
                        expires_at: now + token.expires_in.max(60),
                        refresh_token_expires_at: token
                            .refresh_token_expires_in
                            .map(|seconds| now + seconds.max(0))
                            .or(current.refresh_token_expires_at),
                        scope: if token.scope.is_empty() {
                            current.scope.clone()
                        } else {
                            token.scope
                        },
                        token_type: token.token_type,
                    });
                }
                if status == reqwest::StatusCode::TOO_MANY_REQUESTS
                    || status == reqwest::StatusCode::REQUEST_TIMEOUT
                {
                    last_network_error = Some(token_error(status, &body));
                } else if status.is_client_error() {
                    let err = token_error(status, &body);
                    if body.contains("invalid_grant") {
                        return Err(format!(
                            "{err}. A autorização expirou ou foi revogada; reconecte a conta Google."
                        ));
                    }
                    return Err(err);
                } else {
                    // Server-side/transient failures are safe to retry because refresh-token
                    // requests are idempotent with respect to message delivery.
                    last_network_error = Some(token_error(status, &body));
                }
            }
            Err(e) => last_network_error = Some(format!("Falha temporária ao renovar OAuth: {e}")),
        }
        if attempt < 2 {
            thread::sleep(Duration::from_millis(250 * (1_u64 << attempt)));
        }
    }
    Err(last_network_error.unwrap_or_else(|| "Falha temporária ao renovar OAuth".into()))
}

fn refresh_requires_reconnect(error: &str) -> bool {
    error.contains("invalid_grant")
        || error.contains("reconecte a conta Google")
        || error.contains("autorização expirou ou foi revogada")
}

fn persist_reconnect_required(email: &str, current: &GoogleTokenSet) {
    let now = Utc::now().timestamp();
    let invalid = GoogleTokenSet {
        access_token: String::new(),
        refresh_token: String::new(),
        expires_at: 0,
        refresh_token_expires_at: Some(now),
        scope: current.scope.clone(),
        token_type: current.token_type.clone(),
    };
    // The original OAuth error is more useful than a secondary keystore failure here.
    // Status will request reconnection whenever this best-effort marker can be persisted.
    let _ = store_google_tokens(email, &invalid);
}

pub fn valid_google_access_token(email: &str) -> Result<String, String> {
    let current = load_google_tokens(email)?;
    let now = Utc::now().timestamp();
    if current.expires_at > now + 90 {
        return Ok(current.access_token);
    }
    if current.refresh_token.is_empty()
        || current
            .refresh_token_expires_at
            .is_some_and(|expiry| expiry <= now)
    {
        persist_reconnect_required(email, &current);
        return Err(
            "A autorização Google expirou ou foi revogada; reconecte a conta Google.".into(),
        );
    }
    let lock = account_refresh_lock(email);
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());
    // A concurrent caller may already have refreshed while we waited.
    let current = load_google_tokens(email)?;
    if current.expires_at > Utc::now().timestamp() + 90 {
        return Ok(current.access_token);
    }
    let refreshed = match refresh_google_tokens_at(GOOGLE_TOKEN_ENDPOINT, &current) {
        Ok(tokens) => tokens,
        Err(error) => {
            if refresh_requires_reconnect(&error) {
                persist_reconnect_required(email, &current);
            }
            return Err(error);
        }
    };
    let access = refreshed.access_token.clone();
    store_google_tokens(email, &refreshed)?;
    Ok(access)
}

// Microsoft Outlook IMAP/SMTP OAuth is a separate resource and token namespace.
// Google OAuth code and credentials deliberately remain unchanged.
pub type MicrosoftTokenSet = GoogleTokenSet;

pub fn build_microsoft_authorization(
    redirect_uri: &str,
    login_hint: Option<&str>,
) -> Result<GoogleOAuthAttempt, String> {
    let verifier = random_urlsafe(64);
    let state = random_urlsafe(32);
    let mut url = Url::parse(MICROSOFT_AUTHORIZE).map_err(|e| e.to_string())?;
    if !redirect_uri.starts_with("http://localhost:") {
        return Err("Microsoft OAuth exige callback http://localhost com porta aleatória".into());
    }
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("client_id", MICROSOFT_CLIENT_ID)
            .append_pair("response_type", "code")
            .append_pair("redirect_uri", redirect_uri)
            .append_pair("response_mode", "query")
            .append_pair("scope", MICROSOFT_MAIL_SCOPES)
            .append_pair("code_challenge", &pkce_challenge(&verifier))
            .append_pair("code_challenge_method", "S256")
            .append_pair("state", &state)
            .append_pair("prompt", "select_account");
        if let Some(hint) = login_hint.map(str::trim).filter(|s| !s.is_empty()) {
            q.append_pair("login_hint", hint);
        }
    }
    Ok(GoogleOAuthAttempt {
        authorization_url: url.into(),
        redirect_uri: redirect_uri.into(),
        state,
        code_verifier: verifier,
    })
}

// Token exchanges are fixed-origin, so redirects are neither needed nor safe.
// Keep Google's existing client untouched until its own dedicated regression run.
fn microsoft_http_client() -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("TCS-Mail/0.8.2")
        .build()
        .map_err(|e| format!("Falha ao preparar conexão Microsoft OAuth: {e}"))
}

fn microsoft_token_error(status: reqwest::StatusCode, body: &str) -> String {
    let detail = serde_json::from_str::<OAuthErrorBody>(body).ok();
    match detail {
        Some(v) if !v.error.is_empty() => format!(
            "Microsoft OAuth {} (HTTP {}): {}",
            v.error,
            status,
            v.error_description.chars().take(240).collect::<String>()
        ),
        _ => format!("Microsoft OAuth retornou HTTP {status}"),
    }
}

pub fn exchange_microsoft_code(
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<MicrosoftTokenSet, String> {
    let response = microsoft_http_client()?
        .post(MICROSOFT_TOKEN)
        .form(&[
            ("client_id", MICROSOFT_CLIENT_ID),
            ("grant_type", "authorization_code"),
            ("code", code),
            ("code_verifier", verifier),
            ("redirect_uri", redirect_uri),
            ("scope", MICROSOFT_MAIL_SCOPES),
        ])
        .send()
        .map_err(|e| format!("Troca OAuth Microsoft falhou: {e}"))?;
    let status = response.status();
    let body = response.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(microsoft_token_error(status, &body));
    }
    let token: TokenResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Resposta Microsoft OAuth inválida: {e}"))?;
    if token.access_token.is_empty() || token.refresh_token.as_deref().unwrap_or("").is_empty() {
        return Err("Microsoft não retornou access_token e refresh_token; verifique offline_access e consentimento".into());
    }
    verify_microsoft_scopes(&token.scope)?;
    let now = Utc::now().timestamp();
    Ok(MicrosoftTokenSet {
        access_token: token.access_token,
        refresh_token: token.refresh_token.unwrap_or_default(),
        expires_at: now + token.expires_in.max(60),
        refresh_token_expires_at: None,
        scope: token.scope,
        token_type: token.token_type,
    })
}

pub fn verify_microsoft_scopes(scopes: &str) -> Result<(), String> {
    for expected in [MICROSOFT_IMAP_SCOPE, MICROSOFT_SMTP_SCOPE] {
        if !scopes.split_whitespace().any(|v| v.eq_ignore_ascii_case(expected)) {
            return Err(format!("Permissão Microsoft não concedida: {expected}. No Entra, adicione as permissões delegadas Office 365 Exchange Online IMAP.AccessAsUser.All e SMTP.Send; tokens do Microsoft Graph não servem para IMAP/SMTP."));
        }
    }
    Ok(())
}

fn microsoft_secret_key(email: &str) -> String {
    format!("oauth:microsoft:outlook:{}", email.trim().to_ascii_lowercase())
}

pub fn store_microsoft_tokens(email: &str, tokens: &MicrosoftTokenSet) -> Result<(), String> {
    let value = serde_json::to_string(tokens).map_err(|e| e.to_string())?;
    SecretStore::store_secret(&microsoft_secret_key(email), &value).map_err(|e| e.to_string())
}
pub fn load_microsoft_tokens(email: &str) -> Result<MicrosoftTokenSet, String> {
    let raw = SecretStore::lookup_secret(&microsoft_secret_key(email)).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| format!("Token Microsoft armazenado inválido: {e}"))
}
pub fn clear_microsoft_tokens(email: &str) -> Result<(), String> {
    SecretStore::clear_secret(&microsoft_secret_key(email)).map_err(|e| e.to_string())
}

pub fn valid_microsoft_access_token(email: &str) -> Result<String, String> {
    let current = load_microsoft_tokens(email)?;
    if current.expires_at > Utc::now().timestamp() + 90 {
        return Ok(current.access_token);
    }
    if current.refresh_token.is_empty() {
        return Err("Refresh token Microsoft ausente; reconecte a conta".into());
    }
    // Independent key prevents concurrent refresh from mixing Google/Microsoft credentials.
    let lock = account_refresh_lock(&microsoft_secret_key(email));
    let _guard = lock.lock().unwrap_or_else(|e| e.into_inner());
    let latest = load_microsoft_tokens(email)?;
    if latest.expires_at > Utc::now().timestamp() + 90 {
        return Ok(latest.access_token);
    }
    let response = microsoft_http_client()?
        .post(MICROSOFT_TOKEN)
        .form(&[
            ("client_id", MICROSOFT_CLIENT_ID),
            ("grant_type", "refresh_token"),
            ("refresh_token", latest.refresh_token.as_str()),
            ("scope", MICROSOFT_MAIL_SCOPES),
        ])
        .send()
        .map_err(|e| format!("Não foi possível renovar OAuth Microsoft: {e}"))?;
    let status = response.status();
    let body = response.text().map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("{}. Reconecte a conta se a permissão foi revogada.", microsoft_token_error(status, &body)));
    }
    let token: TokenResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Resposta de renovação Microsoft inválida: {e}"))?;
    verify_microsoft_scopes(&token.scope)?;
    if token.access_token.is_empty() {
        return Err("Microsoft devolveu token de acesso vazio".into());
    }
    let refreshed = MicrosoftTokenSet {
        access_token: token.access_token,
        refresh_token: token.refresh_token.filter(|x| !x.is_empty())
            .unwrap_or(latest.refresh_token),
        expires_at: Utc::now().timestamp() + token.expires_in.max(60),
        refresh_token_expires_at: None,
        scope: token.scope,
        token_type: token.token_type,
    };
    let result = refreshed.access_token.clone();
    store_microsoft_tokens(email, &refreshed)?;
    Ok(result)
}

pub fn microsoft_oauth_status(account: &Account) -> OAuthStatus {
    if !account.auth_method.eq_ignore_ascii_case("oauth2")
        || !account.oauth_provider.eq_ignore_ascii_case("microsoft") {
        return OAuthStatus { connected: false, provider: String::new(), expires_at: None,
            refresh_token_expires_at: None, needs_reconnect: false,
            detail: "Conta não utiliza OAuth Microsoft".into() };
    }
    match load_microsoft_tokens(&account.email) {
        Ok(t) => OAuthStatus { connected: !t.refresh_token.is_empty(),
            provider: "microsoft".into(), expires_at: Some(t.expires_at),
            refresh_token_expires_at: None, needs_reconnect: t.refresh_token.is_empty(),
            detail: if t.refresh_token.is_empty() { "Reconecte a conta Microsoft".into() }
                else { "Microsoft OAuth (IMAP/SMTP)".into() } },
        Err(_) => OAuthStatus { connected: false, provider: "microsoft".into(),
            expires_at: None, refresh_token_expires_at: None, needs_reconnect: true,
            detail: "Credenciais Microsoft ausentes; reconecte".into() },
    }
}

#[cfg(test)]
mod microsoft_oauth_tests {
    use super::*;
    #[test]
    fn microsoft_authorization_uses_public_pkce_and_outlook_resource() {
        let a = build_microsoft_authorization("http://localhost:37897", Some("user@outlook.com")).unwrap();
        let u = Url::parse(&a.authorization_url).unwrap();
        let p: std::collections::HashMap<_, _> = u.query_pairs().into_owned().collect();
        assert_eq!(p.get("client_id").map(String::as_str), Some(MICROSOFT_CLIENT_ID));
        assert_eq!(p.get("code_challenge_method").map(String::as_str), Some("S256"));
        assert_eq!(p.get("code_challenge"), Some(&pkce_challenge(&a.code_verifier)));
        assert_eq!(p.get("redirect_uri").map(String::as_str), Some("http://localhost:37897"));
        assert!(!p.contains_key("client_secret"));
        assert!(p["scope"].contains(MICROSOFT_IMAP_SCOPE));
        assert!(!p["scope"].contains("graph.microsoft.com"));
    }
    #[test]
    fn rejects_graph_only_tokens_and_missing_smtp_scope() {
        assert!(verify_microsoft_scopes("Mail.ReadWrite Mail.Send").is_err());
        assert!(verify_microsoft_scopes(MICROSOFT_IMAP_SCOPE).is_err());
        assert!(verify_microsoft_scopes(MICROSOFT_MAIL_SCOPES).is_ok());
    }
    #[test]
    fn google_and_microsoft_secrets_are_disjoint() {
        assert_ne!(google_secret_key("a@outlook.com"), microsoft_secret_key("a@outlook.com"));
    }
}

/// Resolve the short-lived credential used by the transport layer. Password accounts return
/// the existing OS-keystore password; Google OAuth accounts return a valid access token.
pub fn mail_auth_secret(account: &Account) -> Result<String, String> {
    if account.auth_method.eq_ignore_ascii_case("oauth2") {
        match account.oauth_provider.to_ascii_lowercase().as_str() {
            "google" => valid_google_access_token(&account.email),
            "microsoft" => valid_microsoft_access_token(&account.email),
            provider => Err(format!("Provedor OAuth não suportado: {provider}")),
        }
    } else {
        SecretStore::lookup_password(&account.email).map_err(|e| e.to_string())
    }
}

pub fn google_oauth_status(account: &Account) -> OAuthStatus {
    if !account.auth_method.eq_ignore_ascii_case("oauth2")
        || !account.oauth_provider.eq_ignore_ascii_case("google")
    {
        return OAuthStatus {
            connected: false,
            provider: String::new(),
            expires_at: None,
            refresh_token_expires_at: None,
            needs_reconnect: false,
            detail: "Conta usa autenticação convencional".into(),
        };
    }
    match load_google_tokens(&account.email) {
        Ok(tokens) => {
            let now = Utc::now().timestamp();
            let refresh_expired = tokens
                .refresh_token_expires_at
                .is_some_and(|expiry| expiry <= now);
            let missing_refresh = tokens.refresh_token.is_empty();
            OAuthStatus {
                connected: !refresh_expired && !missing_refresh,
                provider: "google".into(),
                expires_at: Some(tokens.expires_at),
                refresh_token_expires_at: tokens.refresh_token_expires_at,
                needs_reconnect: refresh_expired || missing_refresh,
                detail: if refresh_expired {
                    "Autorização Google expirada; reconecte a conta".into()
                } else if missing_refresh {
                    "Refresh token ausente; reconecte a conta Google".into()
                } else {
                    "Conectado com Google OAuth 2.0".into()
                },
            }
        }
        Err(_) => OAuthStatus {
            connected: false,
            provider: "google".into(),
            expires_at: None,
            refresh_token_expires_at: None,
            needs_reconnect: true,
            detail: "Credenciais OAuth não encontradas no armazenamento seguro".into(),
        },
    }
}

fn revoke_google_token_at(endpoint: &str, token: &str) -> Result<(), String> {
    let response = http_client()?
        .post(endpoint)
        .form(&[("token", token)])
        .send()
        .map_err(|e| format!("Não foi possível revogar no Google: {e}"))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "Google recusou a revogação (HTTP {})",
            response.status()
        ))
    }
}

pub fn revoke_google_tokens(email: &str) -> Result<(), String> {
    let tokens = load_google_tokens(email)?;
    let token = if tokens.refresh_token.is_empty() {
        tokens.access_token
    } else {
        tokens.refresh_token
    };
    let remote = revoke_google_token_at(GOOGLE_REVOKE_ENDPOINT, &token);
    // Local logout must still be possible when Google is temporarily unreachable. The caller
    // receives the remote failure, but the local credential is removed regardless.
    let local = clear_google_tokens(email);
    remote.and(local)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::mpsc,
    };

    #[test]
    fn pkce_s256_matches_rfc_7636_example() {
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            pkce_challenge(verifier),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn authorization_url_contains_pkce_state_and_required_scopes() {
        let attempt = build_google_authorization_with_values(
            "http://127.0.0.1:45678",
            Some("user@example.com"),
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~".into(),
            "state-123".into(),
        )
        .unwrap();
        let u = Url::parse(&attempt.authorization_url).unwrap();
        let q: HashMap<_, _> = u.query_pairs().into_owned().collect();
        assert_eq!(
            q.get("client_id").map(String::as_str),
            Some(GOOGLE_CLIENT_ID)
        );
        assert_eq!(
            q.get("code_challenge_method").map(String::as_str),
            Some("S256")
        );
        assert_eq!(q.get("state").map(String::as_str), Some("state-123"));
        assert!(q.get("scope").unwrap().contains(GOOGLE_MAIL_SCOPE));
        assert!(q.get("scope").unwrap().contains("openid"));
        assert!(q.get("scope").unwrap().contains("email"));
        assert_eq!(
            q.get("login_hint").map(String::as_str),
            Some("user@example.com")
        );
        assert_eq!(q.get("access_type").map(String::as_str), Some("offline"));
        assert_eq!(
            q.get("include_granted_scopes").map(String::as_str),
            Some("true")
        );
        assert_eq!(q.get("prompt").map(String::as_str), Some("consent"));
    }

    fn request_form_value(raw: &str, key: &str) -> Option<String> {
        let body = raw
            .split_once("\r\n\r\n")
            .map(|(_, body)| body)
            .unwrap_or(raw);
        url::form_urlencoded::parse(body.as_bytes())
            .find(|(name, _)| name.as_ref() == key)
            .map(|(_, value)| value.into_owned())
    }

    fn mock_server(status: &str, body: &str) -> (String, mpsc::Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let (tx, rx) = mpsc::channel();
        let status = status.to_string();
        let body = body.to_string();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0_u8; 8192];
            let n = stream.read(&mut buf).unwrap();
            // Capturar a requisição é opcional para cada teste. Alguns testes
            // só precisam da resposta HTTP e descartam o Receiver; nesse caso,
            // a ausência de consumidor não pode derrubar o servidor simulado.
            let _ = tx.send(String::from_utf8_lossy(&buf[..n]).to_string());
            let response = format!(
                "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).unwrap();
        });
        (format!("http://{addr}"), rx)
    }

    fn mock_sequence_server(
        responses: Vec<(&'static str, &'static str)>,
    ) -> (String, mpsc::Receiver<usize>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            for (index, (status, body)) in responses.into_iter().enumerate() {
                let (mut stream, _) = listener.accept().unwrap();
                let mut buf = [0_u8; 8192];
                let _ = stream.read(&mut buf).unwrap();
                let response = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(response.as_bytes()).unwrap();
                tx.send(index + 1).unwrap();
            }
        });
        (format!("http://{addr}"), rx)
    }

    #[test]
    fn code_exchange_sends_verifier_and_desktop_client_secret() {
        let (endpoint, request) = mock_server(
            "200 OK",
            r#"{"access_token":"access","refresh_token":"refresh","expires_in":3600,"scope":"openid email https://mail.google.com/","token_type":"Bearer"}"#,
        );
        let token =
            exchange_google_code_at(&endpoint, "code1", "verifier1", "http://127.0.0.1:1").unwrap();
        assert_eq!(token.refresh_token, "refresh");
        let raw = request.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(raw.contains("code_verifier=verifier1"));
        assert!(raw.contains("client_id="));
        assert!(raw.contains("client_secret="));
        assert_eq!(
            request_form_value(&raw, "client_secret").as_deref(),
            Some(GOOGLE_CLIENT_SECRET)
        );
    }

    #[test]
    fn refresh_preserves_old_refresh_token_when_google_omits_new_one() {
        let (endpoint, _) = mock_server(
            "200 OK",
            r#"{"access_token":"new-access","expires_in":3600,"scope":"https://mail.google.com/","token_type":"Bearer"}"#,
        );
        let current = GoogleTokenSet {
            access_token: "old".into(),
            refresh_token: "keep-me".into(),
            expires_at: 0,
            refresh_token_expires_at: None,
            scope: GOOGLE_MAIL_SCOPE.into(),
            token_type: "Bearer".into(),
        };
        let updated = refresh_google_tokens_at(&endpoint, &current).unwrap();
        assert_eq!(updated.access_token, "new-access");
        assert_eq!(updated.refresh_token, "keep-me");
    }

    #[test]
    fn refresh_sends_desktop_client_secret() {
        let (endpoint, request) = mock_server(
            "200 OK",
            r#"{"access_token":"new-access","expires_in":3600,"scope":"https://mail.google.com/","token_type":"Bearer"}"#,
        );
        let current = GoogleTokenSet {
            access_token: "old".into(),
            refresh_token: "keep-me".into(),
            expires_at: 0,
            refresh_token_expires_at: None,
            scope: GOOGLE_MAIL_SCOPE.into(),
            token_type: "Bearer".into(),
        };
        let _ = refresh_google_tokens_at(&endpoint, &current).unwrap();
        let raw = request.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(raw.contains("client_secret="));
        assert_eq!(
            request_form_value(&raw, "client_secret").as_deref(),
            Some(GOOGLE_CLIENT_SECRET)
        );
    }

    #[test]
    fn refresh_retries_rate_limit_before_succeeding() {
        let (endpoint, requests) = mock_sequence_server(vec![
            (
                "429 Too Many Requests",
                r#"{"error":"rate_limit_exceeded"}"#,
            ),
            (
                "200 OK",
                r#"{"access_token":"after-retry","expires_in":3600,"scope":"https://mail.google.com/","token_type":"Bearer"}"#,
            ),
        ]);
        let current = GoogleTokenSet {
            access_token: "old".into(),
            refresh_token: "refresh".into(),
            expires_at: 0,
            refresh_token_expires_at: None,
            scope: GOOGLE_MAIL_SCOPE.into(),
            token_type: "Bearer".into(),
        };
        let updated = refresh_google_tokens_at(&endpoint, &current).unwrap();
        assert_eq!(updated.access_token, "after-retry");
        assert_eq!(requests.recv_timeout(Duration::from_secs(2)).unwrap(), 1);
        assert_eq!(requests.recv_timeout(Duration::from_secs(2)).unwrap(), 2);
    }

    #[test]
    fn refresh_invalid_grant_requests_reconnection() {
        let (endpoint, _) = mock_server(
            "400 Bad Request",
            r#"{"error":"invalid_grant","error_description":"Token has been expired or revoked"}"#,
        );
        let current = GoogleTokenSet {
            access_token: "old".into(),
            refresh_token: "expired".into(),
            expires_at: 0,
            refresh_token_expires_at: None,
            scope: GOOGLE_MAIL_SCOPE.into(),
            token_type: "Bearer".into(),
        };
        let err = refresh_google_tokens_at(&endpoint, &current)
            .err()
            .expect("a renovação com invalid_grant deve falhar");
        assert!(err.contains("reconecte"));
    }

    #[test]
    fn loopback_callback_validates_state_and_code() {
        assert_eq!(
            parse_loopback_callback("/?code=abc&state=good", "good").unwrap(),
            "abc"
        );
        assert!(parse_loopback_callback("/?code=abc&state=bad", "good")
            .unwrap_err()
            .contains("state"));
        assert!(
            parse_loopback_callback("/?error=access_denied&state=good", "good")
                .unwrap_err()
                .contains("cancelada")
        );
    }

    #[test]
    fn loopback_callback_rejects_duplicate_and_ambiguous_parameters() {
        for target in [
            "/?code=one&code=two&state=good",
            "/?code=one&state=bad&state=good",
            "/?code=one&state=good&state=good",
            "/?error=access_denied&code=one&state=good",
            "//evil.example/?code=one&state=good",
            "https://evil.example/?code=one&state=good",
            "/other?code=one&state=good",
            "/?code=one&state=good#fragment",
        ] {
            assert!(
                parse_loopback_callback(target, "good").is_err(),
                "ambiguous OAuth callback accepted: {target}"
            );
        }
        assert_eq!(
            parse_loopback_callback("/?code=one&state=good&unused=value", "good").unwrap(),
            "one"
        );
    }

    #[test]
    fn loopback_callback_reports_workspace_policy_errors() {
        let admin = parse_loopback_callback(
            "/?error=access_denied&error_subtype=admin_policy_enforced&state=good",
            "good",
        )
        .unwrap_err();
        assert!(admin.contains("Google Workspace"));
        assert!(admin.contains("administrador"));

        let internal =
            parse_loopback_callback("/?error=org_internal&state=good", "good").unwrap_err();
        assert!(internal.contains("organização Google"));
    }

    #[test]
    fn invalid_grant_is_classified_as_reconnect_required() {
        assert!(refresh_requires_reconnect(
            "OAuth: invalid_grant. A autorização expirou ou foi revogada; reconecte a conta Google."
        ));
        assert!(!refresh_requires_reconnect(
            "Falha temporária ao renovar OAuth"
        ));
    }

    #[test]
    fn refresh_lock_is_shared_only_by_the_same_account() {
        let a1 = account_refresh_lock("User@Example.com");
        let a2 = account_refresh_lock("user@example.com");
        let b = account_refresh_lock("other@example.com");
        assert!(Arc::ptr_eq(&a1, &a2));
        assert!(!Arc::ptr_eq(&a1, &b));
    }

    #[test]
    fn revocation_posts_the_token_to_the_endpoint() {
        let (endpoint, request) = mock_server("200 OK", "{}");
        revoke_google_token_at(&endpoint, "refresh-secret").unwrap();
        let raw = request.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(raw.starts_with("POST "));
        assert!(raw.contains("token=refresh-secret"));
    }
}
