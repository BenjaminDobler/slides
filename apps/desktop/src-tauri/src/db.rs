use chrono::Utc;
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::*;

pub struct Database {
    pool: Pool<Sqlite>,
}

impl Database {
    pub async fn new() -> AppResult<Self> {
        let database_url = std::env::var("DATABASE_URL")
            .unwrap_or_else(|_| "sqlite:slides.db?mode=rwc".to_string());

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&database_url)
            .await?;

        Ok(Self { pool })
    }

    pub async fn migrate(&self) -> AppResult<()> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS presentations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                theme TEXT NOT NULL DEFAULT 'default',
                user_id TEXT NOT NULL DEFAULT 'local',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS themes (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                css_content TEXT NOT NULL,
                is_default INTEGER NOT NULL DEFAULT 0,
                user_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS media (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                url TEXT NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'local',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS layout_rules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                description TEXT,
                priority INTEGER NOT NULL DEFAULT 100,
                enabled INTEGER NOT NULL DEFAULT 1,
                is_default INTEGER NOT NULL DEFAULT 0,
                user_id TEXT,
                conditions TEXT NOT NULL,
                transform TEXT NOT NULL,
                css_content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ai_provider_configs (
                id TEXT PRIMARY KEY,
                provider_name TEXT NOT NULL,
                api_key_encrypted TEXT NOT NULL,
                model TEXT,
                base_url TEXT,
                user_id TEXT NOT NULL DEFAULT 'local',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(user_id, provider_name)
            );
            "#,
        )
        .execute(&self.pool)
        .await?;

        // Seed default themes if none exist
        self.seed_defaults().await?;

        Ok(())
    }

    async fn seed_defaults(&self) -> AppResult<()> {
        let theme_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM themes")
            .fetch_one(&self.pool)
            .await?;

        if theme_count.0 == 0 {
            self.seed_themes().await?;
        }

        let rule_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM layout_rules")
            .fetch_one(&self.pool)
            .await?;

        if rule_count.0 == 0 {
            self.seed_layout_rules().await?;
        }

        Ok(())
    }

    async fn seed_themes(&self) -> AppResult<()> {
        let themes = vec![
            ("default", "Default", r#"
.slide-content[data-theme="default"], [data-theme="default"] .slide-content, [data-theme="default"] .slide {
  --slide-bg: #ffffff; --slide-text: #333333; --slide-heading: #1a1a1a; --slide-accent: #0066cc;
  background: var(--slide-bg); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="default"] h1, [data-theme="default"] h2, [data-theme="default"] h3 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading);
}
"#, true),
            ("dark", "Dark Mode", r#"
.slide-content[data-theme="dark"], [data-theme="dark"] .slide-content, [data-theme="dark"] .slide {
  --slide-bg: #1e1e2e; --slide-text: #cdd6f4; --slide-heading: #cba6f7; --slide-accent: #89b4fa;
  background: var(--slide-bg); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="dark"] h1, [data-theme="dark"] h2, [data-theme="dark"] h3 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading);
}
"#, false),
        ];

        for (name, display_name, css, is_default) in themes {
            let now = Utc::now().to_rfc3339();
            sqlx::query(
                "INSERT INTO themes (id, name, display_name, css_content, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(Uuid::new_v4().to_string())
            .bind(name)
            .bind(display_name)
            .bind(css)
            .bind(is_default)
            .bind(&now)
            .bind(&now)
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }

    async fn seed_layout_rules(&self) -> AppResult<()> {
        let rules = vec![
            (
                "hero",
                "Hero",
                "Centered title slide with optional subtitle",
                20,
                r#"{"hasHeading":true,"imageCount":{"eq":0},"hasCards":false,"hasList":false,"hasCodeBlock":false,"hasBlockquote":false,"textParagraphCount":{"lte":1}}"#,
                r#"{"type":"wrap","options":{"className":"layout-hero"}}"#,
                r#".slide-content .layout-hero { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; height: 100%; }"#,
            ),
            (
                "text-image",
                "Text + Image",
                "Text on the left, single image on the right",
                50,
                r#"{"hasHeading":true,"imageCount":{"eq":1}}"#,
                r#"{"type":"split-two","options":{"className":"layout-text-image","leftSelector":"text","rightSelector":"media","leftClassName":"layout-body","rightClassName":"layout-media"}}"#,
                r#".slide-content .layout-text-image { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: center; height: 100%; }"#,
            ),
        ];

        for (name, display_name, description, priority, conditions, transform, css) in rules {
            let now = Utc::now().to_rfc3339();
            sqlx::query(
                "INSERT INTO layout_rules (id, name, display_name, description, priority, enabled, is_default, conditions, transform, css_content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?)"
            )
            .bind(Uuid::new_v4().to_string())
            .bind(name)
            .bind(display_name)
            .bind(description)
            .bind(priority)
            .bind(conditions)
            .bind(transform)
            .bind(css)
            .bind(&now)
            .bind(&now)
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }

    // Presentations
    pub async fn list_presentations(&self) -> AppResult<Vec<Presentation>> {
        let presentations = sqlx::query_as::<_, Presentation>(
            "SELECT id, title, content, theme, user_id, created_at, updated_at FROM presentations ORDER BY updated_at DESC"
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(presentations)
    }

    pub async fn get_presentation(&self, id: &str) -> AppResult<Presentation> {
        sqlx::query_as::<_, Presentation>(
            "SELECT id, title, content, theme, user_id, created_at, updated_at FROM presentations WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Presentation {} not found", id)))
    }

    pub async fn create_presentation(&self, data: CreatePresentation) -> AppResult<Presentation> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let content = data.content.unwrap_or_default();
        let theme = data.theme.unwrap_or_else(|| "default".to_string());

        sqlx::query(
            "INSERT INTO presentations (id, title, content, theme, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'local', ?, ?)"
        )
        .bind(&id)
        .bind(&data.title)
        .bind(&content)
        .bind(&theme)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.get_presentation(&id).await
    }

    pub async fn update_presentation(&self, id: &str, data: UpdatePresentation) -> AppResult<Presentation> {
        let existing = self.get_presentation(id).await?;
        let now = Utc::now();

        let title = data.title.unwrap_or(existing.title);
        let content = data.content.unwrap_or(existing.content);
        let theme = data.theme.unwrap_or(existing.theme);

        sqlx::query("UPDATE presentations SET title = ?, content = ?, theme = ?, updated_at = ? WHERE id = ?")
            .bind(&title)
            .bind(&content)
            .bind(&theme)
            .bind(now)
            .bind(id)
            .execute(&self.pool)
            .await?;

        self.get_presentation(id).await
    }

    pub async fn delete_presentation(&self, id: &str) -> AppResult<()> {
        let result = sqlx::query("DELETE FROM presentations WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(format!("Presentation {} not found", id)));
        }

        Ok(())
    }

    // Themes
    pub async fn list_themes(&self) -> AppResult<Vec<Theme>> {
        let themes = sqlx::query_as::<_, Theme>(
            "SELECT id, name, display_name, css_content, is_default, user_id, created_at, updated_at FROM themes ORDER BY is_default DESC, name"
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(themes)
    }

    // Layout Rules
    pub async fn list_layout_rules(&self) -> AppResult<Vec<LayoutRule>> {
        let rules = sqlx::query_as::<_, LayoutRule>(
            "SELECT id, name, display_name, description, priority, enabled, is_default, user_id, conditions, transform, css_content, created_at, updated_at FROM layout_rules ORDER BY priority"
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rules)
    }

    // AI Provider Configs
    pub async fn list_ai_provider_configs(&self) -> AppResult<Vec<AiProviderConfig>> {
        let configs = sqlx::query_as::<_, AiProviderConfig>(
            "SELECT id, provider_name, api_key_encrypted, model, base_url, user_id, created_at, updated_at FROM ai_provider_configs WHERE user_id = 'local' ORDER BY provider_name"
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(configs)
    }

    pub async fn get_ai_provider_config(&self, provider_name: &str) -> AppResult<Option<AiProviderConfig>> {
        let config = sqlx::query_as::<_, AiProviderConfig>(
            "SELECT id, provider_name, api_key_encrypted, model, base_url, user_id, created_at, updated_at FROM ai_provider_configs WHERE user_id = 'local' AND provider_name = ?"
        )
        .bind(provider_name)
        .fetch_optional(&self.pool)
        .await?;
        Ok(config)
    }

    pub async fn upsert_ai_provider_config(&self, data: CreateAiProviderConfig, api_key_encrypted: String) -> AppResult<AiProviderConfig> {
        let now = Utc::now();

        // Check if exists
        let existing = self.get_ai_provider_config(&data.provider_name).await?;

        if let Some(existing) = existing {
            // Update
            sqlx::query(
                "UPDATE ai_provider_configs SET api_key_encrypted = ?, model = ?, base_url = ?, updated_at = ? WHERE id = ?"
            )
            .bind(&api_key_encrypted)
            .bind(&data.model)
            .bind(&data.base_url)
            .bind(now)
            .bind(&existing.id)
            .execute(&self.pool)
            .await?;

            Ok(AiProviderConfig {
                id: existing.id,
                provider_name: data.provider_name,
                api_key_encrypted,
                model: data.model,
                base_url: data.base_url,
                user_id: "local".to_string(),
                created_at: existing.created_at,
                updated_at: now,
            })
        } else {
            // Insert
            let id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO ai_provider_configs (id, provider_name, api_key_encrypted, model, base_url, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'local', ?, ?)"
            )
            .bind(&id)
            .bind(&data.provider_name)
            .bind(&api_key_encrypted)
            .bind(&data.model)
            .bind(&data.base_url)
            .bind(now)
            .bind(now)
            .execute(&self.pool)
            .await?;

            Ok(AiProviderConfig {
                id,
                provider_name: data.provider_name,
                api_key_encrypted,
                model: data.model,
                base_url: data.base_url,
                user_id: "local".to_string(),
                created_at: now,
                updated_at: now,
            })
        }
    }

    pub async fn delete_ai_provider_config(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM ai_provider_configs WHERE id = ? AND user_id = 'local'")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
