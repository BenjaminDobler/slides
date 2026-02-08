use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, StatusCode},
    response::Response,
    routing::{delete, get, post, put},
    Json, Router,
};
use serde_json::json;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::ai::{create_provider, GenerateOptions};
use crate::encryption::{decrypt, encrypt};
use crate::error::{AppError, AppResult};
use crate::models::*;
use crate::SharedState;

pub fn create_router(state: SharedState) -> Router {
    Router::new()
        // Presentations
        .route("/presentations", get(list_presentations))
        .route("/presentations", post(create_presentation))
        .route("/presentations/{id}", get(get_presentation))
        .route("/presentations/{id}", put(update_presentation))
        .route("/presentations/{id}", delete(delete_presentation))
        // Themes & Layout
        .route("/themes", get(list_themes))
        .route("/layout-rules", get(list_layout_rules))
        // Media
        .route("/media", get(list_media))
        .route("/media", post(upload_media))
        .route("/media/{id}", delete(delete_media))
        .route("/uploads/{filename}", get(serve_upload))
        // AI Config
        .route("/ai-config", get(list_ai_configs))
        .route("/ai-config", post(create_ai_config))
        .route("/ai-config/{id}", delete(delete_ai_config))
        // AI Operations
        .route("/ai/generate", post(ai_generate))
        .route("/ai/improve", post(ai_improve))
        .route("/ai/suggest-style", post(ai_suggest_style))
        .route("/ai/generate-theme", post(ai_generate_theme))
        .route("/ai/speaker-notes", post(ai_speaker_notes))
        .route("/ai/generate-diagram", post(ai_generate_diagram))
        .route("/ai/rewrite", post(ai_rewrite))
        .route("/ai/outline-to-slides", post(ai_outline_to_slides))
        .route("/ai/visual-review", post(ai_visual_review))
        .route("/ai/visual-improve", post(ai_visual_improve))
        .with_state(state)
}

async fn list_presentations(State(state): State<SharedState>) -> AppResult<Json<Vec<Presentation>>> {
    let state = state.read().await;
    let presentations = state.db.list_presentations().await?;
    Ok(Json(presentations))
}

async fn get_presentation(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> AppResult<Json<Presentation>> {
    let state = state.read().await;
    let presentation = state.db.get_presentation(&id).await?;
    Ok(Json(presentation))
}

async fn create_presentation(
    State(state): State<SharedState>,
    Json(data): Json<CreatePresentation>,
) -> AppResult<Json<Presentation>> {
    let state = state.read().await;
    let presentation = state.db.create_presentation(data).await?;
    Ok(Json(presentation))
}

async fn update_presentation(
    State(state): State<SharedState>,
    Path(id): Path<String>,
    Json(data): Json<UpdatePresentation>,
) -> AppResult<Json<Presentation>> {
    let state = state.read().await;
    let presentation = state.db.update_presentation(&id, data).await?;
    Ok(Json(presentation))
}

async fn delete_presentation(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> AppResult<()> {
    let state = state.read().await;
    state.db.delete_presentation(&id).await?;
    Ok(())
}

async fn list_themes(State(state): State<SharedState>) -> AppResult<Json<Vec<Theme>>> {
    let state = state.read().await;
    let themes = state.db.list_themes().await?;
    Ok(Json(themes))
}

async fn list_layout_rules(State(state): State<SharedState>) -> AppResult<Json<Vec<LayoutRuleResponse>>> {
    let state = state.read().await;
    let rules = state.db.list_layout_rules().await?;
    let responses: Vec<LayoutRuleResponse> = rules.into_iter().map(Into::into).collect();
    Ok(Json(responses))
}

// Media handlers
async fn list_media(State(state): State<SharedState>) -> AppResult<Json<Vec<Media>>> {
    let state = state.read().await;
    let media = state.db.list_media().await?;
    Ok(Json(media))
}

async fn upload_media(
    State(state): State<SharedState>,
    mut multipart: Multipart,
) -> AppResult<Json<Media>> {
    // Get uploads directory from state
    let uploads_dir = {
        let state = state.read().await;
        state.uploads_dir.clone()
    };

    // Ensure uploads directory exists
    fs::create_dir_all(&uploads_dir).await.map_err(|e| {
        AppError::Internal(format!("Failed to create uploads directory: {}", e))
    })?;

    // Process the multipart form
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        AppError::BadRequest(format!("Failed to read multipart field: {}", e))
    })? {
        let name = field.name().unwrap_or("").to_string();
        if name != "file" {
            continue;
        }

        let original_name = field.file_name().unwrap_or("upload").to_string();
        let content_type = field.content_type().unwrap_or("application/octet-stream").to_string();

        // Validate mime type (only allow image, video, audio)
        if !content_type.starts_with("image/")
            && !content_type.starts_with("video/")
            && !content_type.starts_with("audio/") {
            return Err(AppError::BadRequest("Only image, video, and audio files are allowed".to_string()));
        }

        // Read the file data
        let data = field.bytes().await.map_err(|e| {
            AppError::BadRequest(format!("Failed to read file data: {}", e))
        })?;

        let size = data.len() as i64;

        // Generate unique filename
        let ext = std::path::Path::new(&original_name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin");
        let unique_name = format!("{}-{}.{}",
            chrono::Utc::now().timestamp_millis(),
            Uuid::new_v4().to_string().split('-').next().unwrap_or("x"),
            ext
        );

        // Write file to disk
        let file_path = uploads_dir.join(&unique_name);
        let mut file = fs::File::create(&file_path).await.map_err(|e| {
            AppError::Internal(format!("Failed to create file: {}", e))
        })?;
        file.write_all(&data).await.map_err(|e| {
            AppError::Internal(format!("Failed to write file: {}", e))
        })?;

        // Create database record
        let url = format!("/api/uploads/{}", unique_name);
        let state = state.read().await;
        let media = state.db.create_media(
            unique_name,
            original_name,
            content_type,
            size,
            url,
        ).await?;

        return Ok(Json(media));
    }

    Err(AppError::BadRequest("No file provided".to_string()))
}

async fn delete_media(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    let uploads_dir = {
        let state = state.read().await;
        state.uploads_dir.clone()
    };

    let state_read = state.read().await;
    let media = state_read.db.delete_media(&id).await?;

    if let Some(media) = media {
        // Delete file from disk
        let file_path = uploads_dir.join(&media.filename);
        if file_path.exists() {
            let _ = fs::remove_file(file_path).await;
        }
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(AppError::NotFound("Media not found".to_string()))
    }
}

async fn serve_upload(
    State(state): State<SharedState>,
    Path(filename): Path<String>,
) -> Result<Response, AppError> {
    let uploads_dir = {
        let state = state.read().await;
        state.uploads_dir.clone()
    };

    let file_path = uploads_dir.join(&filename);

    if !file_path.exists() {
        return Err(AppError::NotFound("File not found".to_string()));
    }

    let data = fs::read(&file_path).await.map_err(|e| {
        AppError::Internal(format!("Failed to read file: {}", e))
    })?;

    // Determine content type from extension
    let content_type = match file_path.extension().and_then(|e| e.to_str()) {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ogg") => "audio/ogg",
        _ => "application/octet-stream",
    };

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "public, max-age=31536000")
        .body(Body::from(data))
        .unwrap())
}

// AI Config handlers
async fn list_ai_configs(State(state): State<SharedState>) -> AppResult<Json<Vec<AiProviderConfigResponse>>> {
    let state = state.read().await;
    let configs = state.db.list_ai_provider_configs().await?;
    let responses: Vec<AiProviderConfigResponse> = configs.into_iter().map(Into::into).collect();
    Ok(Json(responses))
}

async fn create_ai_config(
    State(state): State<SharedState>,
    Json(data): Json<CreateAiProviderConfig>,
) -> AppResult<Json<AiProviderConfigResponse>> {
    // Validate: need either API key or base URL
    if data.api_key.is_none() && data.base_url.is_none() {
        return Err(AppError::BadRequest("apiKey or baseUrl required".to_string()));
    }

    // Use placeholder when using proxy without API key
    let effective_api_key = data.api_key.clone().unwrap_or_else(|| "not-needed".to_string());
    let api_key_encrypted = encrypt(&effective_api_key)?;

    let state = state.read().await;
    let config = state.db.upsert_ai_provider_config(data, api_key_encrypted).await?;
    Ok(Json(config.into()))
}

async fn delete_ai_config(
    State(state): State<SharedState>,
    Path(id): Path<String>,
) -> AppResult<()> {
    let state = state.read().await;
    state.db.delete_ai_provider_config(&id).await?;
    Ok(())
}

// AI Operation helpers
const SLIDE_FORMAT_GUIDE: &str = r#"
SUPPORTED MARKDOWN SYNTAX:
- Standard markdown: headings (#, ##, ###), bold, italic, lists, links, images, code blocks, tables
- Slide separator: a line containing only '---' separates slides
- Card grid layout: a list where every item starts with **Title:** description renders as a styled card grid
- Mermaid diagrams: use ```mermaid code blocks (flowchart, sequenceDiagram, pie, graph, etc.)
- Speaker notes: wrap in <!-- notes --> and <!-- /notes --> (not shown in presentation)
- Image captions: an image followed by *italic text* on the next line renders as a figure with caption

AUTOMATIC LAYOUTS:
The system automatically detects content patterns and applies the best layout. Just write clean markdown:
- A slide with only a heading (+ optional subtitle) → centered hero layout
- A slide with heading + text + one image → side-by-side (text left, image right)
- A slide with heading + multiple images → heading on top, image grid below
- A slide with cards + images → cards on left, image on right
No special directives needed — just write the content naturally.

EXAMPLE - Card grid:
- **Feature A:** Description of feature A
- **Feature B:** Description of feature B
- **Feature C:** Description of feature C

EXAMPLE - Image with caption:
![Photo](https://example.com/photo.jpg)
*A beautiful sunset over the mountains*
"#;

async fn get_provider_for_request(state: &SharedState, provider_name: &str) -> AppResult<Box<dyn crate::ai::AIProvider>> {
    let state = state.read().await;
    let config = state
        .db
        .get_ai_provider_config(provider_name)
        .await?
        .ok_or_else(|| AppError::BadRequest(format!("No {} configuration found. Add your API key in settings.", provider_name)))?;

    let api_key = decrypt(&config.api_key_encrypted)?;
    create_provider(provider_name, api_key, config.base_url, config.model)
}

async fn ai_generate(
    State(state): State<SharedState>,
    Json(data): Json<AiGenerateRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let provider = get_provider_for_request(&state, &data.provider).await?;

    let system_prompt = format!(
        "You are a presentation assistant. Generate markdown slides separated by '---'.\n\
        Each slide should be concise. Use the full range of supported layout features when appropriate.\n\n\
        {}\n{}",
        SLIDE_FORMAT_GUIDE,
        data.context.map(|c| format!("\nContext about the presentation:\n{}", c)).unwrap_or_default()
    );

    let content = provider
        .generate_content(&data.prompt, GenerateOptions {
            system_prompt: Some(system_prompt),
            ..Default::default()
        })
        .await?;

    Ok(Json(json!({ "content": content })))
}

async fn ai_improve(
    State(state): State<SharedState>,
    Json(data): Json<AiImproveRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let provider = get_provider_for_request(&state, &data.provider).await?;

    let prompt = format!(
        "Improve this slide content{}:\n\n{}\n\nReturn only the improved markdown.",
        data.instruction.map(|i| format!(" ({})", i)).unwrap_or_default(),
        data.slide_content
    );

    let content = provider
        .generate_content(&prompt, GenerateOptions {
            system_prompt: Some("You are a presentation design expert. Return only markdown.".to_string()),
            ..Default::default()
        })
        .await?;

    Ok(Json(json!({ "content": content })))
}

async fn ai_suggest_style(
    State(state): State<SharedState>,
    Json(data): Json<AiSuggestStyleRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let provider = get_provider_for_request(&state, &data.provider).await?;

    let prompt = format!(
        "Given this presentation content, suggest which theme would work best and why. \
        Available themes: default, dark, minimal, corporate, creative.\n\n{}",
        data.content
    );

    let suggestion = provider
        .generate_content(&prompt, GenerateOptions {
            system_prompt: Some("You are a presentation design expert. Be concise.".to_string()),
            ..Default::default()
        })
        .await?;

    Ok(Json(json!({ "suggestion": suggestion })))
}

async fn ai_generate_theme(
    State(state): State<SharedState>,
    Json(data): Json<AiGenerateThemeRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let provider = get_provider_for_request(&state, &data.provider).await?;

    let system_prompt = format!(
        r#"You are a CSS theme designer for a presentation slide application.
Generate a complete CSS theme following this exact pattern. The theme name should be a kebab-case identifier derived from the description.

IMPORTANT: Return ONLY a JSON object with these fields: name, displayName, cssContent. No markdown, no explanation.

The cssContent must follow this selector pattern (replace THEME_NAME with your chosen name):

.slide-content[data-theme="THEME_NAME"], [data-theme="THEME_NAME"] .slide-content, [data-theme="THEME_NAME"] .slide {{
  --slide-bg: #...; --slide-text: #...; --slide-heading: #...; --slide-accent: #...;
  background: var(--slide-bg); color: var(--slide-text); font-family: '...', sans-serif;
}}
[data-theme="THEME_NAME"] h1, [data-theme="THEME_NAME"] h2, [data-theme="THEME_NAME"] h3 {{
  font-family: '...', sans-serif; color: var(--slide-heading);
}}
{}"#,
        data.existing_css.map(|c| format!("\nHere is an existing theme CSS for reference:\n{}", c)).unwrap_or_default()
    );

    let result = provider
        .generate_content(&format!("Create a theme: {}", data.description), GenerateOptions {
            system_prompt: Some(system_prompt),
            ..Default::default()
        })
        .await?;

    // Parse JSON from response
    let json_match = result
        .find('{')
        .and_then(|start| result.rfind('}').map(|end| &result[start..=end]));

    match json_match {
        Some(json_str) => {
            let parsed: serde_json::Value = serde_json::from_str(json_str)
                .map_err(|_| AppError::Internal("AI returned invalid theme format".to_string()))?;
            Ok(Json(parsed))
        }
        None => Err(AppError::Internal("AI returned invalid theme format".to_string())),
    }
}

async fn ai_speaker_notes(
    State(state): State<SharedState>,
    Json(data): Json<AiSpeakerNotesRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let provider = get_provider_for_request(&state, &data.provider).await?;

    let prompt = format!("Generate concise speaker notes for this slide:\n\n{}", data.slide_content);

    let notes = provider
        .generate_content(&prompt, GenerateOptions {
            system_prompt: Some(
                "You are a presentation coach. Generate concise, helpful speaker notes. \
                Return only the notes text, no markdown formatting or headers.".to_string()
            ),
            ..Default::default()
        })
        .await?;

    Ok(Json(json!({ "notes": notes })))
}

async fn ai_generate_diagram(
    State(state): State<SharedState>,
    Json(data): Json<AiGenerateDiagramRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let provider = get_provider_for_request(&state, &data.provider).await?;

    let prompt = format!("Create a mermaid diagram for: {}", data.description);

    let result = provider
        .generate_content(&prompt, GenerateOptions {
            system_prompt: Some(
                "You are a diagram expert. Return ONLY valid mermaid diagram syntax. \
                No markdown code fences, no explanation — just the mermaid code starting \
                with the diagram type (graph, sequenceDiagram, flowchart, etc.).".to_string()
            ),
            ..Default::default()
        })
        .await?;

    // Strip any accidental code fences
    let mermaid = result
        .trim()
        .trim_start_matches("```mermaid")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    Ok(Json(json!({ "mermaid": mermaid })))
}

async fn ai_rewrite(
    State(state): State<SharedState>,
    Json(data): Json<AiRewriteRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let provider = get_provider_for_request(&state, &data.provider).await?;

    let prompt = format!(
        "Rewrite this slide content for a {} audience:\n\n{}\n\nReturn only the rewritten markdown.",
        data.audience, data.slide_content
    );

    let content = provider
        .generate_content(&prompt, GenerateOptions {
            system_prompt: Some(format!(
                "You are a presentation expert. Rewrite slide content for the specified audience \
                while preserving the structure. Return only markdown.\n\n{}",
                SLIDE_FORMAT_GUIDE
            )),
            ..Default::default()
        })
        .await?;

    Ok(Json(json!({ "content": content })))
}

async fn ai_outline_to_slides(
    State(state): State<SharedState>,
    Json(data): Json<AiOutlineToSlidesRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let provider = get_provider_for_request(&state, &data.provider).await?;

    let prompt = format!("Convert this outline into a full presentation:\n\n{}", data.outline);

    let content = provider
        .generate_content(&prompt, GenerateOptions {
            system_prompt: Some(format!(
                "You are a presentation assistant. Convert the outline into well-structured \
                markdown slides separated by '---'. Make each slide focused and visually appealing. \
                Use the full range of layout features when appropriate. Return only the markdown.\n\n{}",
                SLIDE_FORMAT_GUIDE
            )),
            ..Default::default()
        })
        .await?;

    Ok(Json(json!({ "content": content })))
}

async fn ai_visual_review(
    State(state): State<SharedState>,
    Json(data): Json<AiVisualReviewRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let provider = get_provider_for_request(&state, &data.provider).await?;

    let prompt = format!(
        r#"Here is a screenshot of a presentation slide and its markdown source.

Markdown source:
```
{}
```

Please review this slide visually. Comment on:
- Layout and spacing issues (text overflow, cramped cards, poor alignment)
- Content density (too much text for one slide?)
- Readability and visual hierarchy
- Suggestions for improvement

Be specific and actionable."#,
        data.slide_content
    );

    let review = provider
        .generate_content(&prompt, GenerateOptions {
            system_prompt: Some(
                "You are a presentation design expert. Review the slide screenshot and provide \
                specific, actionable feedback. Be concise.".to_string()
            ),
            image_base64: Some(data.screenshot),
            image_mime_type: Some("image/png".to_string()),
            max_tokens: Some(1500),
            ..Default::default()
        })
        .await?;

    Ok(Json(json!({ "review": review })))
}

async fn ai_visual_improve(
    State(state): State<SharedState>,
    Json(data): Json<AiVisualImproveRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let provider = get_provider_for_request(&state, &data.provider).await?;

    let prompt = format!(
        r#"Here is a screenshot of a presentation slide and its markdown source.

Markdown source:
```
{}
```

{}Improve this slide. If the content is too dense, split it into multiple slides separated by '---'.
Fix any visual issues you see in the screenshot (overflow, cramped layout, poor hierarchy).

{}

Return ONLY the improved markdown, nothing else."#,
        data.slide_content,
        data.instruction.map(|i| format!("Instruction: {}\n\n", i)).unwrap_or_default(),
        SLIDE_FORMAT_GUIDE
    );

    let content = provider
        .generate_content(&prompt, GenerateOptions {
            system_prompt: Some(
                "You are a presentation design expert. Improve the slide content based on the visual screenshot. \
                Return only markdown. If the slide is too dense, split into multiple slides separated by ---.".to_string()
            ),
            image_base64: Some(data.screenshot),
            image_mime_type: Some("image/png".to_string()),
            max_tokens: Some(3000),
            ..Default::default()
        })
        .await?;

    Ok(Json(json!({ "content": content })))
}
