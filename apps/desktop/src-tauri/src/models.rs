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
    pub user_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
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
