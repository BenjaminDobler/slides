use axum::{
    extract::{Path, State},
    routing::{delete, get, post, put},
    Json, Router,
};

use crate::error::AppResult;
use crate::models::*;
use crate::SharedState;

pub fn create_router(state: SharedState) -> Router {
    Router::new()
        .route("/presentations", get(list_presentations))
        .route("/presentations", post(create_presentation))
        .route("/presentations/{id}", get(get_presentation))
        .route("/presentations/{id}", put(update_presentation))
        .route("/presentations/{id}", delete(delete_presentation))
        .route("/themes", get(list_themes))
        .route("/layout-rules", get(list_layout_rules))
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
