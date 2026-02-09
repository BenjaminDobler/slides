use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Presentation {
    pub id: String,
    pub title: String,
    pub content: String,
    pub theme: String,
    pub user_id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePresentation {
    pub title: String,
    pub content: Option<String>,
    pub theme: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePresentation {
    pub title: Option<String>,
    pub content: Option<String>,
    pub theme: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Theme {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub css_content: String,
    pub is_default: bool,
    pub center_content: bool,
    pub user_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTheme {
    pub name: String,
    pub display_name: String,
    pub css_content: String,
    pub center_content: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTheme {
    pub display_name: Option<String>,
    pub css_content: Option<String>,
    pub center_content: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Media {
    pub id: String,
    pub filename: String,
    pub original_name: String,
    pub mime_type: String,
    pub size: i64,
    pub url: String,
    pub user_id: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct LayoutRule {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub description: Option<String>,
    pub priority: i32,
    pub enabled: bool,
    pub is_default: bool,
    pub user_id: Option<String>,
    pub conditions: String, // JSON string
    pub transform: String,  // JSON string
    pub css_content: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutRuleResponse {
    pub id: String,
    pub name: String,
    pub display_name: String,
    pub description: Option<String>,
    pub priority: i32,
    pub enabled: bool,
    pub is_default: bool,
    pub user_id: Option<String>,
    pub conditions: serde_json::Value,
    pub transform: serde_json::Value,
    pub css_content: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl From<LayoutRule> for LayoutRuleResponse {
    fn from(rule: LayoutRule) -> Self {
        Self {
            id: rule.id,
            name: rule.name,
            display_name: rule.display_name,
            description: rule.description,
            priority: rule.priority,
            enabled: rule.enabled,
            is_default: rule.is_default,
            user_id: rule.user_id,
            conditions: serde_json::from_str(&rule.conditions).unwrap_or(serde_json::Value::Null),
            transform: serde_json::from_str(&rule.transform).unwrap_or(serde_json::Value::Null),
            css_content: rule.css_content,
            created_at: rule.created_at,
            updated_at: rule.updated_at,
        }
    }
}

// AI Provider Config
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfig {
    pub id: String,
    pub provider_name: String,
    pub api_key_encrypted: String,
    pub model: Option<String>,
    pub base_url: Option<String>,
    pub user_id: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderConfigResponse {
    pub id: String,
    pub provider_name: String,
    pub model: Option<String>,
    pub base_url: Option<String>,
    pub has_key: bool,
}

impl From<AiProviderConfig> for AiProviderConfigResponse {
    fn from(config: AiProviderConfig) -> Self {
        Self {
            id: config.id,
            provider_name: config.provider_name,
            model: config.model,
            base_url: config.base_url,
            has_key: true,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAiProviderConfig {
    pub provider_name: String,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub base_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAiProviderConfig {
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub base_url: Option<String>,
}

// AI Request DTOs
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGenerateRequest {
    pub prompt: String,
    pub provider: String,
    pub context: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiImproveRequest {
    pub slide_content: String,
    pub provider: String,
    pub instruction: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSuggestStyleRequest {
    pub content: String,
    pub provider: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGenerateThemeRequest {
    pub description: String,
    pub provider: String,
    pub existing_css: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSpeakerNotesRequest {
    pub slide_content: String,
    pub provider: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGenerateDiagramRequest {
    pub description: String,
    pub provider: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRewriteRequest {
    pub slide_content: String,
    pub provider: String,
    pub audience: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiOutlineToSlidesRequest {
    pub outline: String,
    pub provider: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiVisualReviewRequest {
    pub slide_content: String,
    pub screenshot: String,
    pub provider: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiVisualImproveRequest {
    pub slide_content: String,
    pub screenshot: String,
    pub provider: String,
    pub instruction: Option<String>,
}
