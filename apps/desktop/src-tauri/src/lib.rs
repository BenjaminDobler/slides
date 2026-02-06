// Library crate for Tauri
pub mod ai;
pub mod api;
pub mod db;
pub mod encryption;
pub mod error;
pub mod mcp;
pub mod models;

use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct AppState {
    pub db: db::Database,
    pub uploads_dir: PathBuf,
}

pub type SharedState = Arc<RwLock<AppState>>;
