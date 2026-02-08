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
        Self::new_with_url(&database_url).await
    }

    pub async fn new_with_url(database_url: &str) -> AppResult<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(database_url)
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
                center_content INTEGER NOT NULL DEFAULT 1,
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

        // Run migrations for schema updates
        self.run_migrations().await?;

        // Seed default themes if none exist
        self.seed_defaults().await?;

        Ok(())
    }

    async fn run_migrations(&self) -> AppResult<()> {
        // Add center_content column to themes if it doesn't exist
        // SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we check first
        let columns: Vec<(String,)> = sqlx::query_as(
            "SELECT name FROM pragma_table_info('themes') WHERE name = 'center_content'"
        )
        .fetch_all(&self.pool)
        .await?;

        if columns.is_empty() {
            sqlx::query("ALTER TABLE themes ADD COLUMN center_content INTEGER NOT NULL DEFAULT 1")
                .execute(&self.pool)
                .await?;
        }

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
        // (name, display_name, css, is_default, center_content)
        let themes = vec![
            ("default", "Default", r#"
.slide-content[data-theme="default"], [data-theme="default"] .slide-content, [data-theme="default"] .slide {
  --slide-bg: #ffffff; --slide-text: #333333; --slide-heading: #1a1a1a; --slide-accent: #0066cc;
  background: var(--slide-bg); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="default"] h1, [data-theme="default"] h2, [data-theme="default"] h3 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading);
}
[data-theme="default"] code { background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 3px; }
[data-theme="default"] a { color: var(--slide-accent); }
"#, true, true),
            ("dark", "Dark Mode", r#"
.slide-content[data-theme="dark"], [data-theme="dark"] .slide-content, [data-theme="dark"] .slide {
  --slide-bg: #1e1e2e; --slide-text: #cdd6f4; --slide-heading: #cba6f7; --slide-accent: #89b4fa;
  background: var(--slide-bg); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="dark"] h1, [data-theme="dark"] h2, [data-theme="dark"] h3 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading);
}
[data-theme="dark"] code { background: #313244; padding: 0.2em 0.4em; border-radius: 3px; color: #a6e3a1; }
[data-theme="dark"] a { color: var(--slide-accent); }
"#, false, true),
            ("minimal", "Minimal", r#"
.slide-content[data-theme="minimal"], [data-theme="minimal"] .slide-content, [data-theme="minimal"] .slide {
  --slide-bg: #fafafa; --slide-text: #222; --slide-heading: #000; --slide-accent: #555;
  background: var(--slide-bg); color: var(--slide-text); font-family: 'Inter', sans-serif; padding: 4rem;
}
[data-theme="minimal"] h1 { font-size: 3rem; font-weight: 300; letter-spacing: -0.02em; }
[data-theme="minimal"] h2 { font-size: 2rem; font-weight: 300; }
[data-theme="minimal"] code { background: #eee; padding: 0.2em 0.4em; border-radius: 3px; }
"#, false, true),
            ("corporate", "Corporate", r#"
.slide-content[data-theme="corporate"], [data-theme="corporate"] .slide-content, [data-theme="corporate"] .slide {
  --slide-bg: #ffffff; --slide-text: #2c3e50; --slide-heading: #1a365d; --slide-accent: #2b6cb0;
  background: var(--slide-bg); color: var(--slide-text); font-family: 'Inter', sans-serif;
  border-top: 4px solid var(--slide-accent);
}
[data-theme="corporate"] h1, [data-theme="corporate"] h2 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading); border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem;
}
[data-theme="corporate"] code { background: #edf2f7; padding: 0.2em 0.4em; border-radius: 3px; }
"#, false, true),
            ("creative", "Creative", r#"
.slide-content[data-theme="creative"], [data-theme="creative"] .slide-content, [data-theme="creative"] .slide {
  --slide-bg: #0f0c29; --slide-text: #e0e0e0; --slide-heading: #f857a6; --slide-accent: #ff5858;
  background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="creative"] h1, [data-theme="creative"] h2 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading);
  background: linear-gradient(90deg, #f857a6, #ff5858); -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
[data-theme="creative"] code { background: rgba(255,255,255,0.1); padding: 0.2em 0.4em; border-radius: 3px; }
[data-theme="creative"] a { color: var(--slide-accent); }
"#, false, true),
            ("ocean", "Ocean", r#"
.slide-content[data-theme="ocean"], [data-theme="ocean"] .slide-content, [data-theme="ocean"] .slide {
  --slide-bg: #0b1929; --slide-text: #b2c8df; --slide-heading: #5eead4; --slide-accent: #38bdf8;
  background: linear-gradient(180deg, #0b1929 0%, #0d2137 100%); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="ocean"] h1, [data-theme="ocean"] h2, [data-theme="ocean"] h3 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading);
}
[data-theme="ocean"] code { background: rgba(56,189,248,0.1); padding: 0.2em 0.4em; border-radius: 3px; color: #7dd3fc; }
[data-theme="ocean"] a { color: var(--slide-accent); }
[data-theme="ocean"] blockquote { border-left: 3px solid #5eead4; padding-left: 1rem; color: #7dd3fc; }
"#, false, true),
            ("sunset", "Sunset", r#"
.slide-content[data-theme="sunset"], [data-theme="sunset"] .slide-content, [data-theme="sunset"] .slide {
  --slide-bg: #1c1017; --slide-text: #e8d5ce; --slide-heading: #fb923c; --slide-accent: #f472b6;
  background: linear-gradient(135deg, #1c1017 0%, #2a1520 50%, #1e1422 100%); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="sunset"] h1, [data-theme="sunset"] h2, [data-theme="sunset"] h3 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading);
}
[data-theme="sunset"] h1 { background: linear-gradient(90deg, #fb923c, #f472b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
[data-theme="sunset"] code { background: rgba(251,146,60,0.12); padding: 0.2em 0.4em; border-radius: 3px; color: #fdba74; }
[data-theme="sunset"] a { color: var(--slide-accent); }
"#, false, true),
            ("forest", "Forest", r#"
.slide-content[data-theme="forest"], [data-theme="forest"] .slide-content, [data-theme="forest"] .slide {
  --slide-bg: #0f1a0f; --slide-text: #c8d6c0; --slide-heading: #4ade80; --slide-accent: #86efac;
  background: linear-gradient(180deg, #0f1a0f 0%, #162016 100%); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="forest"] h1, [data-theme="forest"] h2, [data-theme="forest"] h3 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading);
}
[data-theme="forest"] code { background: rgba(74,222,128,0.1); padding: 0.2em 0.4em; border-radius: 3px; color: #86efac; }
[data-theme="forest"] a { color: var(--slide-accent); }
[data-theme="forest"] strong { color: #bbf7d0; }
"#, false, true),
            ("noir", "Noir", r#"
.slide-content[data-theme="noir"], [data-theme="noir"] .slide-content, [data-theme="noir"] .slide {
  --slide-bg: #0a0a0a; --slide-text: #a3a3a3; --slide-heading: #fafafa; --slide-accent: #e5e5e5;
  background: var(--slide-bg); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="noir"] h1, [data-theme="noir"] h2, [data-theme="noir"] h3 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading); font-weight: 700; letter-spacing: -0.02em;
}
[data-theme="noir"] h1 { font-size: 3.2rem; }
[data-theme="noir"] code { background: #1a1a1a; padding: 0.2em 0.4em; border-radius: 3px; color: #d4d4d4; }
[data-theme="noir"] a { color: var(--slide-accent); text-decoration: underline; }
[data-theme="noir"] blockquote { border-left: 3px solid #404040; padding-left: 1rem; color: #d4d4d4; }
"#, false, true),
            ("lavender", "Lavender", r#"
.slide-content[data-theme="lavender"], [data-theme="lavender"] .slide-content, [data-theme="lavender"] .slide {
  --slide-bg: #faf5ff; --slide-text: #4a3563; --slide-heading: #7c3aed; --slide-accent: #a78bfa;
  background: var(--slide-bg); color: var(--slide-text); font-family: 'Inter', sans-serif;
}
[data-theme="lavender"] h1, [data-theme="lavender"] h2, [data-theme="lavender"] h3 {
  font-family: 'Poppins', sans-serif; color: var(--slide-heading);
}
[data-theme="lavender"] code { background: #ede9fe; padding: 0.2em 0.4em; border-radius: 3px; color: #6d28d9; }
[data-theme="lavender"] a { color: var(--slide-accent); }
[data-theme="lavender"] blockquote { border-left: 3px solid #c4b5fd; padding-left: 1rem; }
"#, false, true),
            ("cyberpunk", "Cyberpunk", r#"
.slide-content[data-theme="cyberpunk"], [data-theme="cyberpunk"] .slide-content, [data-theme="cyberpunk"] .slide {
  --slide-bg: #0a0014; --slide-text: #d4d4d8; --slide-heading: #e4ff1a; --slide-accent: #06b6d4;
  background: var(--slide-bg); color: var(--slide-text); font-family: 'JetBrains Mono', 'Fira Code', monospace;
}
[data-theme="cyberpunk"] h1, [data-theme="cyberpunk"] h2, [data-theme="cyberpunk"] h3 {
  color: var(--slide-heading); text-transform: uppercase; letter-spacing: 0.05em;
}
[data-theme="cyberpunk"] h1 { text-shadow: 0 0 20px rgba(228,255,26,0.3); }
[data-theme="cyberpunk"] code { background: rgba(6,182,212,0.12); padding: 0.2em 0.4em; border-radius: 3px; color: #22d3ee; }
[data-theme="cyberpunk"] a { color: var(--slide-accent); }
[data-theme="cyberpunk"] strong { color: #e4ff1a; }
"#, false, true),
        ];

        for (name, display_name, css, is_default, center_content) in themes {
            let now = Utc::now().to_rfc3339();
            sqlx::query(
                "INSERT INTO themes (id, name, display_name, css_content, is_default, center_content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .bind(Uuid::new_v4().to_string())
            .bind(name)
            .bind(display_name)
            .bind(css)
            .bind(is_default)
            .bind(center_content)
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
                "sections",
                "Sections",
                "Groups content by h3 headings into equal columns",
                10,
                r#"{"h3Count":{"gte":2},"imageCount":{"eq":0},"hasCards":false}"#,
                r#"{"type":"group-by-heading","options":{"headingLevel":3,"containerClassName":"layout-sections","columnClassName":"layout-section-col"}}"#,
                r#".slide-content .layout-sections { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 2rem; flex: 1; min-height: 0; }
.slide-content .layout-section-col h3 { margin-top: 0; }
.slide-content .layout-section-col ul, .slide-content .layout-section-col ol { padding-left: 1.2em; }"#,
            ),
            (
                "hero",
                "Hero",
                "Centered title slide with optional subtitle",
                20,
                r#"{"hasHeading":true,"imageCount":{"eq":0},"hasCards":false,"hasList":false,"hasCodeBlock":false,"hasBlockquote":false,"textParagraphCount":{"lte":1}}"#,
                r#"{"type":"wrap","options":{"className":"layout-hero"}}"#,
                r#".slide-content .layout-hero { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; height: 100%; }
.slide-content .layout-hero h1 { font-size: 3rem; }
.slide-content .layout-hero h2 { font-size: 2.2rem; }"#,
            ),
            (
                "cards-image",
                "Cards + Image",
                "Card grid on the left, image on the right",
                30,
                r#"{"hasCards":true,"imageCount":{"gt":0}}"#,
                r#"{"type":"split-two","options":{"className":"layout-cards-image","leftSelector":"cards","rightSelector":"media","leftClassName":"layout-cards-side","rightClassName":"layout-media-side"}}"#,
                r#".slide-content .layout-cards-image { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: start; height: 100%; }
.slide-content .layout-media-side img, .slide-content .layout-media-side figure img { width: 100%; height: auto; border-radius: 8px; display: block; }"#,
            ),
            (
                "image-grid",
                "Image Grid",
                "Text on top, multiple images in a grid below",
                40,
                r#"{"hasHeading":true,"imageCount":{"gte":2}}"#,
                r#"{"type":"split-top-bottom","options":{"className":"layout-image-grid","bottomSelector":"media"}}"#,
                r#".slide-content .layout-image-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin: 1rem 0; }
.slide-content .layout-image-grid img { width: 100%; height: auto; border-radius: 8px; display: block; }
.slide-content .layout-image-grid figure { margin: 0; }"#,
            ),
            (
                "image-text",
                "Image + Text",
                "Image on the left, text on the right (when image comes first in markdown)",
                45,
                r#"{"hasHeading":true,"imageCount":{"eq":1},"mediaBeforeText":true}"#,
                r#"{"type":"split-two","options":{"className":"layout-image-text","leftSelector":"media","rightSelector":"text","leftClassName":"layout-media","rightClassName":"layout-body"}}"#,
                r#".slide-content .layout-image-text { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: center; height: 100%; }
.slide-content .layout-image-text .layout-media img, .slide-content .layout-image-text .layout-media figure img { width: 100%; height: auto; border-radius: 8px; display: block; }"#,
            ),
            (
                "text-image",
                "Text + Image",
                "Text on the left, single image on the right",
                50,
                r#"{"hasHeading":true,"imageCount":{"eq":1}}"#,
                r#"{"type":"split-two","options":{"className":"layout-text-image","leftSelector":"text","rightSelector":"media","leftClassName":"layout-body","rightClassName":"layout-media"}}"#,
                r#".slide-content .layout-text-image { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; align-items: center; height: 100%; }
.slide-content .layout-media img, .slide-content .layout-media figure img { width: 100%; height: auto; border-radius: 8px; display: block; }"#,
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
            "SELECT id, name, display_name, css_content, is_default, center_content, user_id, created_at, updated_at FROM themes ORDER BY is_default DESC, name"
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

    pub async fn get_ai_provider_config_by_id(&self, id: &str) -> AppResult<Option<AiProviderConfig>> {
        let config = sqlx::query_as::<_, AiProviderConfig>(
            "SELECT id, provider_name, api_key_encrypted, model, base_url, user_id, created_at, updated_at FROM ai_provider_configs WHERE id = ? AND user_id = 'local'"
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(config)
    }

    pub async fn update_ai_provider_config(
        &self,
        id: &str,
        model: Option<String>,
        base_url: Option<String>,
        api_key_encrypted: Option<String>,
    ) -> AppResult<AiProviderConfig> {
        let existing = self.get_ai_provider_config_by_id(id).await?
            .ok_or_else(|| AppError::NotFound("AI config not found".to_string()))?;

        let now = Utc::now();
        let new_model = model.or(existing.model);
        let new_base_url = base_url.or(existing.base_url);
        let new_api_key = api_key_encrypted.unwrap_or(existing.api_key_encrypted);

        sqlx::query(
            "UPDATE ai_provider_configs SET api_key_encrypted = ?, model = ?, base_url = ?, updated_at = ? WHERE id = ?"
        )
        .bind(&new_api_key)
        .bind(&new_model)
        .bind(&new_base_url)
        .bind(now)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(AiProviderConfig {
            id: existing.id,
            provider_name: existing.provider_name,
            api_key_encrypted: new_api_key,
            model: new_model,
            base_url: new_base_url,
            user_id: existing.user_id,
            created_at: existing.created_at,
            updated_at: now,
        })
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

    // Media
    pub async fn list_media(&self) -> AppResult<Vec<Media>> {
        let media = sqlx::query_as::<_, Media>(
            "SELECT id, filename, original_name, mime_type, size, url, user_id, created_at FROM media WHERE user_id = 'local' ORDER BY created_at DESC"
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(media)
    }

    pub async fn get_media(&self, id: &str) -> AppResult<Option<Media>> {
        let media = sqlx::query_as::<_, Media>(
            "SELECT id, filename, original_name, mime_type, size, url, user_id, created_at FROM media WHERE id = ? AND user_id = 'local'"
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(media)
    }

    pub async fn create_media(&self, filename: String, original_name: String, mime_type: String, size: i64, url: String) -> AppResult<Media> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        sqlx::query(
            "INSERT INTO media (id, filename, original_name, mime_type, size, url, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, 'local', ?)"
        )
        .bind(&id)
        .bind(&filename)
        .bind(&original_name)
        .bind(&mime_type)
        .bind(size)
        .bind(&url)
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok(Media {
            id,
            filename,
            original_name,
            mime_type,
            size,
            url,
            user_id: "local".to_string(),
            created_at: now,
        })
    }

    pub async fn delete_media(&self, id: &str) -> AppResult<Option<Media>> {
        let media = self.get_media(id).await?;
        if media.is_some() {
            sqlx::query("DELETE FROM media WHERE id = ? AND user_id = 'local'")
                .bind(id)
                .execute(&self.pool)
                .await?;
        }
        Ok(media)
    }

    // Layout Rules
    pub async fn create_layout_rule(
        &self,
        name: String,
        display_name: String,
        description: Option<String>,
        priority: i32,
        conditions: String,
        transform: String,
        css_content: String,
    ) -> AppResult<LayoutRule> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();

        sqlx::query(
            "INSERT INTO layout_rules (id, name, display_name, description, priority, enabled, is_default, user_id, conditions, transform, css_content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, 'local', ?, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(&name)
        .bind(&display_name)
        .bind(&description)
        .bind(priority)
        .bind(&conditions)
        .bind(&transform)
        .bind(&css_content)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok(LayoutRule {
            id,
            name,
            display_name,
            description,
            priority,
            enabled: true,
            is_default: false,
            user_id: Some("local".to_string()),
            conditions,
            transform,
            css_content,
            created_at: now,
            updated_at: now,
        })
    }

    pub async fn delete_layout_rule(&self, id: &str) -> AppResult<()> {
        // Only delete non-default rules
        let result = sqlx::query("DELETE FROM layout_rules WHERE id = ? AND is_default = 0")
            .bind(id)
            .execute(&self.pool)
            .await?;

        if result.rows_affected() == 0 {
            return Err(AppError::BadRequest("Cannot delete default layout rule or rule not found".to_string()));
        }

        Ok(())
    }
}
