use axum::{
    extract::State,
    response::sse::{Event, Sse},
    routing::get,
    Router,
};
use futures::stream::{self, Stream};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::time::Duration;

use crate::SharedState;

#[derive(Debug, Serialize, Deserialize)]
struct McpServerInfo {
    name: String,
    version: String,
    capabilities: McpCapabilities,
}

#[derive(Debug, Serialize, Deserialize)]
struct McpCapabilities {
    tools: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct McpTool {
    name: String,
    description: String,
    #[serde(rename = "inputSchema")]
    input_schema: serde_json::Value,
}

pub fn create_router(state: SharedState) -> Router {
    Router::new()
        .route("/sse", get(sse_handler))
        .with_state(state)
}

async fn sse_handler(
    State(_state): State<SharedState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let server_info = McpServerInfo {
        name: "slides".to_string(),
        version: "1.0.0".to_string(),
        capabilities: McpCapabilities { tools: true },
    };

    let tools = vec![
        McpTool {
            name: "list_presentations".to_string(),
            description: "List all presentations".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        McpTool {
            name: "get_presentation".to_string(),
            description: "Get a presentation by ID".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "Presentation ID" }
                },
                "required": ["id"]
            }),
        },
        McpTool {
            name: "create_presentation".to_string(),
            description: "Create a new presentation".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "Presentation title" },
                    "content": { "type": "string", "description": "Markdown content" },
                    "theme": { "type": "string", "description": "Theme name" }
                },
                "required": ["title"]
            }),
        },
        McpTool {
            name: "update_presentation".to_string(),
            description: "Update an existing presentation".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "Presentation ID" },
                    "title": { "type": "string", "description": "New title" },
                    "content": { "type": "string", "description": "New content" },
                    "theme": { "type": "string", "description": "New theme" }
                },
                "required": ["id"]
            }),
        },
        McpTool {
            name: "delete_presentation".to_string(),
            description: "Delete a presentation".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "Presentation ID" }
                },
                "required": ["id"]
            }),
        },
        McpTool {
            name: "list_themes".to_string(),
            description: "List available themes".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
    ];

    // Send initial connection event with server info
    let stream = stream::once(async move {
        let init_message = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "initialize",
            "params": {
                "serverInfo": server_info,
                "tools": tools
            }
        });
        Ok::<_, Infallible>(Event::default().data(init_message.to_string()))
    });

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(30))
            .text("ping"),
    )
}
