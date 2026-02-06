// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::RwLock;
use tracing_subscriber;

use slides_desktop_lib::{api, db, mcp, AppState};

fn main() {
    tracing_subscriber::fmt::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Start the backend server in a separate thread
            tauri::async_runtime::spawn(async move {
                if let Err(e) = start_backend(app_handle).await {
                    tracing::error!("Failed to start backend: {}", e);
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn start_backend(app_handle: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Get app data directory for database storage
    let app_data_dir = app_handle.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data_dir)?;
    let db_path = app_data_dir.join("slides.db");
    let database_url = format!("sqlite:{}?mode=rwc", db_path.display());
    tracing::info!("Using database at: {}", database_url);

    // Create uploads directory
    let uploads_dir = app_data_dir.join("uploads");
    std::fs::create_dir_all(&uploads_dir)?;
    tracing::info!("Using uploads directory at: {}", uploads_dir.display());

    // Initialize database
    let db = db::Database::new_with_url(&database_url).await?;
    db.migrate().await?;

    let state = Arc::new(RwLock::new(AppState { db, uploads_dir }));

    // Create the API router
    let api_router = api::create_router(state.clone());

    // Create the MCP SSE router
    let mcp_router = mcp::create_router(state.clone());

    // Combine routers
    let app = axum::Router::new()
        .nest("/api", api_router)
        .nest("/mcp", mcp_router)
        .layer(
            tower_http::cors::CorsLayer::new()
                .allow_origin(tower_http::cors::Any)
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any),
        );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:3332").await?;
    tracing::info!("Backend server running on http://127.0.0.1:3332");
    tracing::info!("MCP SSE endpoint available at http://127.0.0.1:3332/mcp/sse");

    axum::serve(listener, app).await?;

    Ok(())
}
