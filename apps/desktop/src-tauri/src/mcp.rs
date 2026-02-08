use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::sse::{Event, Sse},
    routing::{get, post},
    Json, Router,
};
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;

use crate::models::{CreatePresentation, UpdatePresentation};
use crate::SharedState;

const SLIDE_FORMAT_GUIDE: &str = r#"
Slides are written in Markdown. Each slide is separated by a line containing only "---".

Supported markdown features:
- Standard markdown: headings (#, ##, ###), bold, italic, lists, links, images, tables, code blocks
- Code syntax highlighting: use fenced code blocks with a language identifier
- Mermaid diagrams: use a fenced code block with "mermaid" as the language
- Image captions: an image followed by *italic text* on the next line renders as a figure with caption

AUTOMATIC LAYOUTS:
The system automatically detects content patterns and applies the best layout. Just write clean markdown:
- A slide with only a heading (+ optional subtitle) -> centered hero layout
- A slide with heading + text + one image -> side-by-side (text left, image right)
- A slide with heading + multiple images -> heading on top, image grid below
- A slide with cards + images -> cards on left, image on right
No special directives needed - just write the content naturally.

Card grid layout:
- Create a bullet list where every item starts with **Title:** description
- These are automatically rendered as styled card boxes
- IMPORTANT: Use MAXIMUM 3-4 cards per slide. More cards will be too narrow and unreadable.
- If you have more items, split them across multiple slides.
  Example:
    - **Feature A:** Description of feature A
    - **Feature B:** Description of feature B
    - **Feature C:** Description of feature C

Speaker notes:
- Wrap notes in <!-- notes --> and <!-- /notes --> directives
- These are only visible in presenter view, not on the slide itself
  Example:
    <!-- notes -->
    Remember to mention the demo here.
    <!-- /notes -->

Manual layout directives (optional override):
- Two-column layout: wrap content in <!-- columns --> and <!-- split --> directives.
  Only use this if the automatic layout doesn't achieve what you want.
  Example:
    <!-- columns -->
    Left column content (text, images, etc.)

    <!-- split -->
    Right column content

Best practices:
- Keep slides focused: one main idea per slide
- Card grids: maximum 3-4 cards per slide (more will be too narrow)
- Use multiple slides instead of cramming too much content
- Lists: 4-6 bullet points maximum per slide
- Let the automatic layouts do the work - just write natural markdown
"#;

// Session state for MCP connections
type Sessions = Arc<RwLock<HashMap<String, mpsc::Sender<String>>>>;

#[derive(Clone)]
struct McpState {
    sessions: Sessions,
    app_state: SharedState,
}

#[derive(Debug, Deserialize)]
struct SessionParams {
    #[serde(rename = "sessionId")]
    session_id: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

impl JsonRpcResponse {
    fn success(id: Option<Value>, result: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(result),
            error: None,
        }
    }

    fn error(id: Option<Value>, code: i32, message: String) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(JsonRpcError {
                code,
                message,
                data: None,
            }),
        }
    }
}

pub fn create_router(state: SharedState) -> Router {
    let mcp_state = McpState {
        sessions: Arc::new(RwLock::new(HashMap::new())),
        app_state: state,
    };

    Router::new()
        .route("/sse", get(sse_handler))
        .route("/message", post(message_handler))
        .with_state(mcp_state)
}

async fn sse_handler(
    State(state): State<McpState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let session_id = Uuid::new_v4().to_string();
    let (tx, mut rx) = mpsc::channel::<String>(100);

    // Store the sender in sessions
    {
        let mut sessions = state.sessions.write().await;
        sessions.insert(session_id.clone(), tx);
    }

    let session_id_clone = session_id.clone();
    let sessions_clone = state.sessions.clone();

    // Create the SSE stream
    let stream = async_stream::stream! {
        // Send the endpoint event first
        let endpoint_url = format!("/mcp/message?sessionId={}", session_id_clone);
        yield Ok::<_, Infallible>(Event::default().event("endpoint").data(endpoint_url));

        // Forward messages from the channel
        while let Some(message) = rx.recv().await {
            yield Ok(Event::default().event("message").data(message));
        }

        // Clean up session when stream ends
        let mut sessions = sessions_clone.write().await;
        sessions.remove(&session_id_clone);
    };

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(30))
            .text("ping"),
    )
}

async fn message_handler(
    State(state): State<McpState>,
    Query(params): Query<SessionParams>,
    Json(request): Json<JsonRpcRequest>,
) -> StatusCode {
    let session_id = params.session_id;

    // Get the sender for this session
    let sender = {
        let sessions = state.sessions.read().await;
        sessions.get(&session_id).cloned()
    };

    let Some(sender) = sender else {
        tracing::error!("Session {} not found", session_id);
        return StatusCode::NOT_FOUND;
    };

    // Process the request
    let response = process_request(&state, request).await;

    // Send response if there is one (notifications don't need responses)
    if let Some(response) = response {
        let response_json = serde_json::to_string(&response).unwrap_or_default();
        if sender.send(response_json).await.is_err() {
            tracing::error!("Failed to send response to session {}", session_id);
            return StatusCode::INTERNAL_SERVER_ERROR;
        }
    }

    StatusCode::ACCEPTED
}

async fn process_request(state: &McpState, request: JsonRpcRequest) -> Option<JsonRpcResponse> {
    let id = request.id.clone();

    // Handle notifications (no id means no response expected)
    if id.is_none() && request.method == "notifications/initialized" {
        return None;
    }

    let result = match request.method.as_str() {
        "initialize" => handle_initialize(&request.params).await,
        "tools/list" => handle_tools_list().await,
        "tools/call" => handle_tools_call(state, &request.params).await,
        _ => Err((-32601, format!("Method not found: {}", request.method))),
    };

    Some(match result {
        Ok(value) => JsonRpcResponse::success(id, value),
        Err((code, message)) => JsonRpcResponse::error(id, code, message),
    })
}

async fn handle_initialize(_params: &Value) -> Result<Value, (i32, String)> {
    Ok(json!({
        "protocolVersion": "2024-11-05",
        "capabilities": {
            "tools": {}
        },
        "serverInfo": {
            "name": "slides",
            "version": "1.0.0"
        }
    }))
}

async fn handle_tools_list() -> Result<Value, (i32, String)> {
    let tools = vec![
        json!({
            "name": "list_presentations",
            "description": "List all presentations for the authenticated user",
            "inputSchema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {},
            }
        }),
        json!({
            "name": "get_presentation",
            "description": "Get a presentation by ID, including its full markdown content",
            "inputSchema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "Presentation ID" }
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "create_presentation",
            "description": format!("Create a new presentation. Content is Markdown with slides separated by \"---\". {}", SLIDE_FORMAT_GUIDE),
            "inputSchema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "Presentation title" },
                    "content": { "type": "string", "description": "Markdown content with slides separated by ---. Supports headings, lists, code blocks, mermaid diagrams, <!-- columns -->/<!-- split --> for two-column layouts, and **Title:** description lists for card grids." },
                    "theme": { "type": "string", "description": "Theme name (default: \"default\"). Use list_themes to see available themes." }
                },
                "required": ["title", "content"]
            }
        }),
        json!({
            "name": "update_presentation",
            "description": "Update an existing presentation (title, content, or theme). Content follows the same Markdown slide format as create_presentation.",
            "inputSchema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "Presentation ID" },
                    "title": { "type": "string", "description": "New title" },
                    "content": { "type": "string", "description": "New full markdown content (replaces existing). Uses same format: slides separated by ---, supports layout directives." },
                    "theme": { "type": "string", "description": "New theme name. Use list_themes to see available themes." }
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "delete_presentation",
            "description": "Delete a presentation by ID",
            "inputSchema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "Presentation ID" }
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "list_themes",
            "description": "List all available presentation themes",
            "inputSchema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {},
            }
        }),
        json!({
            "name": "add_slides",
            "description": "Append new slides to the end of an existing presentation. The slides are added after a --- separator.",
            "inputSchema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "Presentation ID" },
                    "slides": { "type": "string", "description": "Markdown for the new slides to append. Multiple slides separated by ---. Supports all layout directives: <!-- columns -->/<!-- split -->, **Title:** card lists, ```mermaid diagrams, and <!-- notes -->." }
                },
                "required": ["id", "slides"]
            }
        }),
        json!({
            "name": "list_media",
            "description": "List all media files in the media library. Returns an array of media items with id, filename, originalName, mimeType, size, url, and createdAt.",
            "inputSchema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {},
            }
        }),
        json!({
            "name": "upload_media",
            "description": "Upload a media file to the media library from a local file path or a URL. Returns the media metadata and a markdown image snippet for use in slides.",
            "inputSchema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "source": { "type": "string", "description": "Local file path or URL (http/https) of the media file to upload" },
                    "filename": { "type": "string", "description": "Optional custom filename override. If not provided, the original filename is used." }
                },
                "required": ["source"]
            }
        }),
        json!({
            "name": "delete_media",
            "description": "Delete a media file from the media library by its ID",
            "inputSchema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "Media file ID" }
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "list_layout_rules",
            "description": "List all layout rules. Layout rules define how slide content is automatically arranged (e.g., hero layout, text+image split, image grid). Rules are checked in priority order; the first matching rule is applied.",
            "inputSchema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {},
            }
        }),
        json!({
            "name": "create_layout_rule",
            "description": "Create a custom layout rule. A rule has conditions (when to apply), a transform (how to rearrange HTML), and CSS (styling for the layout classes).",
            "inputSchema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "name": { "type": "string", "description": "Unique rule name (slug format, e.g. \"my-layout\")" },
                    "displayName": { "type": "string", "description": "Human-readable name" },
                    "description": { "type": "string", "description": "Description of what this rule does" },
                    "priority": { "type": "number", "description": "Priority (lower = checked first, default: 100)" },
                    "conditions": { "type": "string", "description": "JSON string of LayoutConditions object. Fields: hasHeading (bool), imageCount ({eq/gte/lte/gt: number}), figureCount, h3Count, textParagraphCount, hasCards (bool), hasList (bool), hasCodeBlock (bool), hasBlockquote (bool). All optional, AND logic." },
                    "transform": { "type": "string", "description": "JSON string of LayoutTransform object. Type is one of: \"wrap\", \"split-two\", \"split-top-bottom\", \"group-by-heading\". Each type has specific options." },
                    "cssContent": { "type": "string", "description": "CSS rules for the layout classes used by the transform" }
                },
                "required": ["name", "displayName", "conditions", "transform", "cssContent"]
            }
        }),
        json!({
            "name": "delete_layout_rule",
            "description": "Delete a custom layout rule by ID. Default (built-in) rules cannot be deleted.",
            "inputSchema": {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "Layout rule ID" }
                },
                "required": ["id"]
            }
        }),
    ];

    Ok(json!({ "tools": tools }))
}

async fn handle_tools_call(state: &McpState, params: &Value) -> Result<Value, (i32, String)> {
    let name = params
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or((-32602, "Missing tool name".to_string()))?;

    let arguments = params.get("arguments").cloned().unwrap_or(json!({}));

    let result = match name {
        "list_presentations" => tool_list_presentations(state).await,
        "get_presentation" => tool_get_presentation(state, &arguments).await,
        "create_presentation" => tool_create_presentation(state, &arguments).await,
        "update_presentation" => tool_update_presentation(state, &arguments).await,
        "delete_presentation" => tool_delete_presentation(state, &arguments).await,
        "list_themes" => tool_list_themes(state).await,
        "add_slides" => tool_add_slides(state, &arguments).await,
        "list_media" => tool_list_media(state).await,
        "upload_media" => tool_upload_media(state, &arguments).await,
        "delete_media" => tool_delete_media(state, &arguments).await,
        "list_layout_rules" => tool_list_layout_rules(state).await,
        "create_layout_rule" => tool_create_layout_rule(state, &arguments).await,
        "delete_layout_rule" => tool_delete_layout_rule(state, &arguments).await,
        _ => Err((-32602, format!("Unknown tool: {}", name))),
    }?;

    Ok(json!({
        "content": [{
            "type": "text",
            "text": result
        }]
    }))
}

// Tool implementations

async fn tool_list_presentations(state: &McpState) -> Result<String, (i32, String)> {
    let app_state = state.app_state.read().await;
    let presentations = app_state
        .db
        .list_presentations()
        .await
        .map_err(|e| (-32000, e.to_string()))?;
    serde_json::to_string_pretty(&presentations).map_err(|e| (-32000, e.to_string()))
}

async fn tool_get_presentation(state: &McpState, args: &Value) -> Result<String, (i32, String)> {
    let id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or((-32602, "Missing required parameter: id".to_string()))?;

    let app_state = state.app_state.read().await;
    let presentation = app_state
        .db
        .get_presentation(id)
        .await
        .map_err(|e| (-32000, e.to_string()))?;
    serde_json::to_string_pretty(&presentation).map_err(|e| (-32000, e.to_string()))
}

async fn tool_create_presentation(state: &McpState, args: &Value) -> Result<String, (i32, String)> {
    let title = args
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or((-32602, "Missing required parameter: title".to_string()))?;

    let content = args.get("content").and_then(|v| v.as_str()).map(String::from);
    let theme = args.get("theme").and_then(|v| v.as_str()).map(String::from);

    let data = CreatePresentation {
        title: title.to_string(),
        content,
        theme,
    };

    let app_state = state.app_state.read().await;
    let presentation = app_state
        .db
        .create_presentation(data)
        .await
        .map_err(|e| (-32000, e.to_string()))?;
    serde_json::to_string_pretty(&presentation).map_err(|e| (-32000, e.to_string()))
}

async fn tool_update_presentation(state: &McpState, args: &Value) -> Result<String, (i32, String)> {
    let id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or((-32602, "Missing required parameter: id".to_string()))?;

    let title = args.get("title").and_then(|v| v.as_str()).map(String::from);
    let content = args.get("content").and_then(|v| v.as_str()).map(String::from);
    let theme = args.get("theme").and_then(|v| v.as_str()).map(String::from);

    let data = UpdatePresentation {
        title,
        content,
        theme,
    };

    let app_state = state.app_state.read().await;
    let presentation = app_state
        .db
        .update_presentation(id, data)
        .await
        .map_err(|e| (-32000, e.to_string()))?;
    serde_json::to_string_pretty(&presentation).map_err(|e| (-32000, e.to_string()))
}

async fn tool_delete_presentation(state: &McpState, args: &Value) -> Result<String, (i32, String)> {
    let id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or((-32602, "Missing required parameter: id".to_string()))?;

    let app_state = state.app_state.read().await;
    app_state
        .db
        .delete_presentation(id)
        .await
        .map_err(|e| (-32000, e.to_string()))?;
    Ok(format!("Presentation {} deleted successfully.", id))
}

async fn tool_list_themes(state: &McpState) -> Result<String, (i32, String)> {
    let app_state = state.app_state.read().await;
    let themes = app_state
        .db
        .list_themes()
        .await
        .map_err(|e| (-32000, e.to_string()))?;
    serde_json::to_string_pretty(&themes).map_err(|e| (-32000, e.to_string()))
}

async fn tool_add_slides(state: &McpState, args: &Value) -> Result<String, (i32, String)> {
    let id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or((-32602, "Missing required parameter: id".to_string()))?;

    let slides = args
        .get("slides")
        .and_then(|v| v.as_str())
        .ok_or((-32602, "Missing required parameter: slides".to_string()))?;

    let app_state = state.app_state.read().await;

    // Get existing presentation
    let presentation = app_state
        .db
        .get_presentation(id)
        .await
        .map_err(|e| (-32000, e.to_string()))?;

    // Append new slides
    let new_content = format!("{}\n\n---\n\n{}", presentation.content.trim_end(), slides);

    let data = UpdatePresentation {
        title: None,
        content: Some(new_content),
        theme: None,
    };

    let updated = app_state
        .db
        .update_presentation(id, data)
        .await
        .map_err(|e| (-32000, e.to_string()))?;
    serde_json::to_string_pretty(&updated).map_err(|e| (-32000, e.to_string()))
}

async fn tool_list_media(state: &McpState) -> Result<String, (i32, String)> {
    let app_state = state.app_state.read().await;
    let media = app_state
        .db
        .list_media()
        .await
        .map_err(|e| (-32000, e.to_string()))?;
    serde_json::to_string_pretty(&media).map_err(|e| (-32000, e.to_string()))
}

async fn tool_upload_media(state: &McpState, args: &Value) -> Result<String, (i32, String)> {
    let source = args
        .get("source")
        .and_then(|v| v.as_str())
        .ok_or((-32602, "Missing required parameter: source".to_string()))?;

    let custom_filename = args.get("filename").and_then(|v| v.as_str());

    let (data, filename, mime_type) = if source.starts_with("http://") || source.starts_with("https://") {
        // Download from URL
        let response = reqwest::get(source)
            .await
            .map_err(|e| (-32000, format!("Failed to download: {}", e)))?;

        if !response.status().is_success() {
            return Err((-32000, format!("Failed to download: {}", response.status())));
        }

        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.split(';').next().unwrap_or(s).trim().to_string())
            .unwrap_or_else(|| "application/octet-stream".to_string());

        let url_path = url::Url::parse(source)
            .ok()
            .and_then(|u| u.path_segments().and_then(|s| s.last().map(String::from)))
            .unwrap_or_else(|| "download".to_string());

        let name = custom_filename.map(String::from).unwrap_or(url_path);

        let bytes = response
            .bytes()
            .await
            .map_err(|e| (-32000, format!("Failed to read response: {}", e)))?;

        (bytes.to_vec(), name, content_type)
    } else {
        // Read from local file
        let path = std::path::Path::new(source);
        let data = tokio::fs::read(path)
            .await
            .map_err(|e| (-32000, format!("Failed to read file: {}", e)))?;

        let name = custom_filename
            .map(String::from)
            .unwrap_or_else(|| {
                path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("upload")
                    .to_string()
            });

        let mime_type = get_mime_type(&name);

        (data, name, mime_type)
    };

    // Validate mime type
    if !mime_type.starts_with("image/")
        && !mime_type.starts_with("video/")
        && !mime_type.starts_with("audio/")
    {
        return Err((-32602, "Only image, video, and audio files are allowed".to_string()));
    }

    let app_state = state.app_state.read().await;
    let uploads_dir = app_state.uploads_dir.clone();

    // Generate unique filename
    let ext = std::path::Path::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    let unique_name = format!(
        "{}-{}.{}",
        chrono::Utc::now().timestamp_millis(),
        uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("x"),
        ext
    );

    // Write file to disk
    let file_path = uploads_dir.join(&unique_name);
    tokio::fs::write(&file_path, &data)
        .await
        .map_err(|e| (-32000, format!("Failed to write file: {}", e)))?;

    // Create database record
    let url = format!("/api/uploads/{}", unique_name);
    let media = app_state
        .db
        .create_media(
            unique_name,
            filename.clone(),
            mime_type,
            data.len() as i64,
            url.clone(),
        )
        .await
        .map_err(|e| (-32000, e.to_string()))?;

    // Add markdown snippet to response
    let markdown_snippet = format!("![{}]({})", media.original_name, media.url);
    let response = json!({
        "id": media.id,
        "filename": media.filename,
        "originalName": media.original_name,
        "mimeType": media.mime_type,
        "size": media.size,
        "url": media.url,
        "createdAt": media.created_at,
        "markdownSnippet": markdown_snippet
    });

    serde_json::to_string_pretty(&response).map_err(|e| (-32000, e.to_string()))
}

async fn tool_delete_media(state: &McpState, args: &Value) -> Result<String, (i32, String)> {
    let id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or((-32602, "Missing required parameter: id".to_string()))?;

    let app_state = state.app_state.read().await;
    let uploads_dir = app_state.uploads_dir.clone();

    let media = app_state
        .db
        .delete_media(id)
        .await
        .map_err(|e| (-32000, e.to_string()))?;

    if let Some(media) = media {
        // Delete file from disk
        let file_path = uploads_dir.join(&media.filename);
        if file_path.exists() {
            let _ = tokio::fs::remove_file(file_path).await;
        }
        Ok(format!("Media {} deleted successfully.", id))
    } else {
        Err((-32000, "Media not found".to_string()))
    }
}

async fn tool_list_layout_rules(state: &McpState) -> Result<String, (i32, String)> {
    let app_state = state.app_state.read().await;
    let rules = app_state
        .db
        .list_layout_rules()
        .await
        .map_err(|e| (-32000, e.to_string()))?;

    // Convert to response format with parsed JSON fields
    let responses: Vec<crate::models::LayoutRuleResponse> =
        rules.into_iter().map(Into::into).collect();
    serde_json::to_string_pretty(&responses).map_err(|e| (-32000, e.to_string()))
}

async fn tool_create_layout_rule(state: &McpState, args: &Value) -> Result<String, (i32, String)> {
    let name = args
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or((-32602, "Missing required parameter: name".to_string()))?;

    let display_name = args
        .get("displayName")
        .and_then(|v| v.as_str())
        .ok_or((-32602, "Missing required parameter: displayName".to_string()))?;

    let description = args.get("description").and_then(|v| v.as_str());
    let priority = args.get("priority").and_then(|v| v.as_i64()).unwrap_or(100) as i32;

    let conditions = args
        .get("conditions")
        .and_then(|v| v.as_str())
        .ok_or((-32602, "Missing required parameter: conditions".to_string()))?;

    let transform = args
        .get("transform")
        .and_then(|v| v.as_str())
        .ok_or((-32602, "Missing required parameter: transform".to_string()))?;

    let css_content = args
        .get("cssContent")
        .and_then(|v| v.as_str())
        .ok_or((-32602, "Missing required parameter: cssContent".to_string()))?;

    // Validate JSON strings
    serde_json::from_str::<Value>(conditions)
        .map_err(|e| (-32602, format!("Invalid conditions JSON: {}", e)))?;
    serde_json::from_str::<Value>(transform)
        .map_err(|e| (-32602, format!("Invalid transform JSON: {}", e)))?;

    let app_state = state.app_state.read().await;
    let rule = app_state
        .db
        .create_layout_rule(
            name.to_string(),
            display_name.to_string(),
            description.map(String::from),
            priority,
            conditions.to_string(),
            transform.to_string(),
            css_content.to_string(),
        )
        .await
        .map_err(|e| (-32000, e.to_string()))?;

    let response: crate::models::LayoutRuleResponse = rule.into();
    serde_json::to_string_pretty(&response).map_err(|e| (-32000, e.to_string()))
}

async fn tool_delete_layout_rule(state: &McpState, args: &Value) -> Result<String, (i32, String)> {
    let id = args
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or((-32602, "Missing required parameter: id".to_string()))?;

    let app_state = state.app_state.read().await;
    app_state
        .db
        .delete_layout_rule(id)
        .await
        .map_err(|e| (-32000, e.to_string()))?;
    Ok(format!("Layout rule {} deleted successfully.", id))
}

fn get_mime_type(filename: &str) -> String {
    let ext = std::path::Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "tiff" | "tif" => "image/tiff",
        "avif" => "image/avif",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "ogg" => "video/ogg",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        "aac" => "audio/aac",
        _ => "application/octet-stream",
    }
    .to_string()
}
