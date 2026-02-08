use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Default)]
pub struct GenerateOptions {
    pub system_prompt: Option<String>,
    pub model: Option<String>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub image_base64: Option<String>,
    pub image_mime_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub display_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
}

#[async_trait]
pub trait AIProvider: Send + Sync {
    async fn generate_content(&self, prompt: &str, options: GenerateOptions) -> AppResult<String>;
    async fn list_models(&self) -> AppResult<Vec<ModelInfo>>;
}

// Anthropic Provider
pub struct AnthropicProvider {
    api_key: String,
    base_url: String,
    default_model: String,
    client: Client,
}

impl AnthropicProvider {
    pub fn new(api_key: String, base_url: Option<String>, model: Option<String>) -> Self {
        Self {
            api_key,
            base_url: base_url.unwrap_or_else(|| "https://api.anthropic.com".to_string()),
            default_model: model.unwrap_or_else(|| "claude-sonnet-4-20250514".to_string()),
            client: Client::new(),
        }
    }
}

#[derive(Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    system: String,
    messages: Vec<AnthropicMessage>,
}

#[derive(Serialize)]
struct AnthropicMessage {
    role: String,
    content: Vec<AnthropicContent>,
}

#[derive(Serialize)]
#[serde(tag = "type")]
enum AnthropicContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { source: AnthropicImageSource },
}

#[derive(Serialize)]
struct AnthropicImageSource {
    #[serde(rename = "type")]
    source_type: String,
    media_type: String,
    data: String,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicResponseContent>,
}

#[derive(Deserialize)]
struct AnthropicResponseContent {
    #[serde(rename = "type")]
    content_type: String,
    text: Option<String>,
}

#[derive(Deserialize)]
struct AnthropicModelsResponse {
    data: Vec<AnthropicModel>,
}

#[derive(Deserialize)]
struct AnthropicModel {
    id: String,
    display_name: String,
    created_at: Option<String>,
}

#[async_trait]
impl AIProvider for AnthropicProvider {
    async fn generate_content(&self, prompt: &str, options: GenerateOptions) -> AppResult<String> {
        let mut content = Vec::new();

        if let Some(image_data) = &options.image_base64 {
            content.push(AnthropicContent::Image {
                source: AnthropicImageSource {
                    source_type: "base64".to_string(),
                    media_type: options.image_mime_type.clone().unwrap_or_else(|| "image/png".to_string()),
                    data: image_data.clone(),
                },
            });
        }

        content.push(AnthropicContent::Text { text: prompt.to_string() });

        let request = AnthropicRequest {
            model: options.model.unwrap_or_else(|| self.default_model.clone()),
            max_tokens: options.max_tokens.unwrap_or(2000),
            system: options.system_prompt.unwrap_or_else(|| {
                "You are a presentation assistant that generates markdown slides separated by ---.".to_string()
            }),
            messages: vec![AnthropicMessage {
                role: "user".to_string(),
                content,
            }],
        };

        let response = self
            .client
            .post(format!("{}/v1/messages", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("HTTP request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "Anthropic API error ({}): {}",
                status, body
            )));
        }

        let result: AnthropicResponse = response
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to parse response: {}", e)))?;

        Ok(result
            .content
            .into_iter()
            .filter_map(|c| if c.content_type == "text" { c.text } else { None })
            .collect::<Vec<_>>()
            .join(""))
    }

    async fn list_models(&self) -> AppResult<Vec<ModelInfo>> {
        let response = self
            .client
            .get(format!("{}/v1/models", self.base_url))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("HTTP request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "Anthropic API error ({}): {}",
                status, body
            )));
        }

        let result: AnthropicModelsResponse = response
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to parse response: {}", e)))?;

        Ok(result
            .data
            .into_iter()
            .map(|m| ModelInfo {
                id: m.id,
                display_name: m.display_name,
                created_at: m.created_at,
            })
            .collect())
    }
}

// OpenAI Provider
pub struct OpenAIProvider {
    api_key: String,
    base_url: String,
    default_model: String,
    client: Client,
}

impl OpenAIProvider {
    pub fn new(api_key: String, base_url: Option<String>, model: Option<String>) -> Self {
        Self {
            api_key,
            base_url: base_url.unwrap_or_else(|| "https://api.openai.com".to_string()),
            default_model: model.unwrap_or_else(|| "gpt-4o".to_string()),
            client: Client::new(),
        }
    }
}

#[derive(Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    max_tokens: u32,
    temperature: f32,
}

#[derive(Serialize)]
struct OpenAIMessage {
    role: String,
    content: serde_json::Value,
}

#[derive(Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
}

#[derive(Deserialize)]
struct OpenAIChoice {
    message: OpenAIMessageResponse,
}

#[derive(Deserialize)]
struct OpenAIMessageResponse {
    content: Option<String>,
}

#[derive(Deserialize)]
struct OpenAIModelsResponse {
    data: Vec<OpenAIModel>,
}

#[derive(Deserialize)]
struct OpenAIModel {
    id: String,
    created: Option<i64>,
}

#[async_trait]
impl AIProvider for OpenAIProvider {
    async fn generate_content(&self, prompt: &str, options: GenerateOptions) -> AppResult<String> {
        let mut user_content = vec![serde_json::json!({ "type": "text", "text": prompt })];

        if let Some(image_data) = &options.image_base64 {
            let mime = options.image_mime_type.as_deref().unwrap_or("image/png");
            user_content.push(serde_json::json!({
                "type": "image_url",
                "image_url": { "url": format!("data:{};base64,{}", mime, image_data) }
            }));
        }

        let request = OpenAIRequest {
            model: options.model.unwrap_or_else(|| self.default_model.clone()),
            messages: vec![
                OpenAIMessage {
                    role: "system".to_string(),
                    content: serde_json::json!(options.system_prompt.unwrap_or_else(|| {
                        "You are a presentation assistant that generates markdown slides separated by ---.".to_string()
                    })),
                },
                OpenAIMessage {
                    role: "user".to_string(),
                    content: serde_json::json!(user_content),
                },
            ],
            max_tokens: options.max_tokens.unwrap_or(2000),
            temperature: options.temperature.unwrap_or(0.7),
        };

        let response = self
            .client
            .post(format!("{}/v1/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("HTTP request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "OpenAI API error ({}): {}",
                status, body
            )));
        }

        let result: OpenAIResponse = response
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to parse response: {}", e)))?;

        Ok(result
            .choices
            .first()
            .and_then(|c| c.message.content.clone())
            .unwrap_or_default())
    }

    async fn list_models(&self) -> AppResult<Vec<ModelInfo>> {
        let response = self
            .client
            .get(format!("{}/v1/models", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("HTTP request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "OpenAI API error ({}): {}",
                status, body
            )));
        }

        let result: OpenAIModelsResponse = response
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to parse response: {}", e)))?;

        // Filter to only include chat models (gpt-*)
        Ok(result
            .data
            .into_iter()
            .filter(|m| m.id.starts_with("gpt-") || m.id.starts_with("o1") || m.id.starts_with("o3"))
            .map(|m| {
                let created_at = m.created.map(|ts| {
                    chrono::DateTime::from_timestamp(ts, 0)
                        .map(|dt| dt.to_rfc3339())
                        .unwrap_or_default()
                });
                ModelInfo {
                    display_name: m.id.clone(),
                    id: m.id,
                    created_at,
                }
            })
            .collect())
    }
}

// Gemini Provider
pub struct GeminiProvider {
    api_key: String,
    base_url: String,
    default_model: String,
    client: Client,
}

impl GeminiProvider {
    pub fn new(api_key: String, base_url: Option<String>, model: Option<String>) -> Self {
        Self {
            api_key,
            base_url: base_url.unwrap_or_else(|| "https://generativelanguage.googleapis.com".to_string()),
            default_model: model.unwrap_or_else(|| "gemini-2.0-flash".to_string()),
            client: Client::new(),
        }
    }
}

#[derive(Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(rename = "systemInstruction", skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiSystemInstruction>,
    #[serde(rename = "generationConfig")]
    generation_config: GeminiGenerationConfig,
}

#[derive(Serialize)]
struct GeminiSystemInstruction {
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
#[serde(untagged)]
enum GeminiPart {
    Text { text: String },
    Image { inline_data: GeminiInlineData },
}

#[derive(Serialize)]
struct GeminiInlineData {
    mime_type: String,
    data: String,
}

#[derive(Serialize)]
struct GeminiGenerationConfig {
    temperature: f32,
    #[serde(rename = "maxOutputTokens")]
    max_output_tokens: u32,
}

#[derive(Deserialize)]
struct GeminiResponse {
    candidates: Vec<GeminiCandidate>,
}

#[derive(Deserialize)]
struct GeminiCandidate {
    content: GeminiCandidateContent,
}

#[derive(Deserialize)]
struct GeminiCandidateContent {
    parts: Vec<GeminiResponsePart>,
}

#[derive(Deserialize)]
struct GeminiResponsePart {
    text: Option<String>,
}

#[derive(Deserialize)]
struct GeminiModelsResponse {
    models: Vec<GeminiModel>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiModel {
    name: String,
    display_name: Option<String>,
}

#[async_trait]
impl AIProvider for GeminiProvider {
    async fn generate_content(&self, prompt: &str, options: GenerateOptions) -> AppResult<String> {
        let model = options.model.as_deref().unwrap_or(&self.default_model);

        let mut parts = vec![GeminiPart::Text { text: prompt.to_string() }];

        if let Some(image_data) = &options.image_base64 {
            parts.push(GeminiPart::Image {
                inline_data: GeminiInlineData {
                    mime_type: options.image_mime_type.clone().unwrap_or_else(|| "image/png".to_string()),
                    data: image_data.clone(),
                },
            });
        }

        let system_instruction = options.system_prompt.map(|s| GeminiSystemInstruction {
            parts: vec![GeminiPart::Text { text: s }],
        });

        let request = GeminiRequest {
            contents: vec![GeminiContent {
                role: "user".to_string(),
                parts,
            }],
            system_instruction,
            generation_config: GeminiGenerationConfig {
                temperature: options.temperature.unwrap_or(0.7),
                max_output_tokens: options.max_tokens.unwrap_or(2000),
            },
        };

        let response = self
            .client
            .post(format!(
                "{}/v1beta/models/{}:generateContent?key={}",
                self.base_url, model, self.api_key
            ))
            .header("content-type", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("HTTP request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "Gemini API error ({}): {}",
                status, body
            )));
        }

        let result: GeminiResponse = response
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to parse response: {}", e)))?;

        Ok(result
            .candidates
            .first()
            .map(|c| {
                c.content
                    .parts
                    .iter()
                    .filter_map(|p| p.text.clone())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default())
    }

    async fn list_models(&self) -> AppResult<Vec<ModelInfo>> {
        let response = self
            .client
            .get(format!(
                "{}/v1beta/models?key={}",
                self.base_url, self.api_key
            ))
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("HTTP request failed: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Internal(format!(
                "Gemini API error ({}): {}",
                status, body
            )));
        }

        let result: GeminiModelsResponse = response
            .json()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to parse response: {}", e)))?;

        // Filter to only include generative models (gemini-*)
        Ok(result
            .models
            .into_iter()
            .filter(|m| m.name.contains("gemini"))
            .map(|m| {
                // name is like "models/gemini-1.5-pro", extract just the model id
                let id = m.name.strip_prefix("models/").unwrap_or(&m.name).to_string();
                ModelInfo {
                    display_name: m.display_name.unwrap_or_else(|| id.clone()),
                    id,
                    created_at: None,
                }
            })
            .collect())
    }
}

// Provider Factory
pub fn create_provider(provider_name: &str, api_key: String, base_url: Option<String>, model: Option<String>) -> AppResult<Box<dyn AIProvider>> {
    match provider_name {
        "anthropic" => Ok(Box::new(AnthropicProvider::new(api_key, base_url, model))),
        "openai" => Ok(Box::new(OpenAIProvider::new(api_key, base_url, model))),
        "gemini" => Ok(Box::new(GeminiProvider::new(api_key, base_url, model))),
        _ => Err(AppError::BadRequest(format!("Unknown AI provider: {}", provider_name))),
    }
}
