# Slides

A markdown-based presentation editor with AI-powered content and theme generation. Built as an Nx monorepo with Angular, Express, and PostgreSQL.

## Features

- Markdown editor with live slide preview (powered by Monaco Editor)
- Slide thumbnails with theme-aware rendering
- Resizable editor panes
- Mermaid diagram support with theme-aware styling
- Multiple built-in themes (Default, Dark, Minimal, Corporate, Creative)
- Custom theme creation (manual color picker + AI generation)
- AI assistant for generating slide content and styles (supports Anthropic, OpenAI, Ollama)
- Presentation mode
- Auto-save

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- npm

**For web version:**
- [Docker](https://www.docker.com/) (for PostgreSQL) or a local PostgreSQL instance

**For desktop version:**
- [Rust](https://rustup.rs/) (latest stable)

## Getting Started

### 1. Clone the repository

```sh
git clone https://github.com/BenjaminDobler/slides.git
cd slides
```

### 2. Install dependencies

```sh
npm install
```

### 3. Start PostgreSQL

Using Docker (recommended):

```sh
docker compose up -d
```

This starts a PostgreSQL 16 instance on port 5432 with user `postgres`, password `postgres`, and database `slides`.

Or use your own PostgreSQL instance.

### 4. Configure environment variables

Create a `.env` file in the project root:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/slides?schema=public
JWT_SECRET=your-secret-key
ENCRYPTION_KEY=a-32-character-encryption-key!!
```

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — Secret for signing JWT auth tokens
- `ENCRYPTION_KEY` — Used to encrypt stored AI provider API keys (must be 32 characters)

### 5. Run database migrations

```sh
npx prisma migrate deploy
```

### 6. Seed the database

This creates the built-in themes:

```sh
npx prisma db seed
```

### 7. Start the application

In two terminals (or use `&`):

```sh
# Terminal 1 — Backend (port 3333)
npx nx serve backend

# Terminal 2 — Frontend (port 4200)
npx nx serve frontend
```

Open [http://localhost:4200](http://localhost:4200) in your browser.

## Desktop App (Tauri)

The desktop version runs without authentication and uses a local SQLite database. No PostgreSQL or Docker required.

### Development

```sh
npm run desktop
```

This starts the frontend dev server and launches the Tauri app. Hot reload is enabled for the frontend.

### Build for Distribution

```sh
npm run desktop:build
```

Built packages are in `apps/desktop/src-tauri/target/release/bundle/`:
- **macOS**: `dmg/Slides_*.dmg`
- **Windows**: `msi/*.msi` and `nsis/*.exe`
- **Linux**: `deb/*.deb` and `appimage/*.AppImage`

### macOS Unsigned App Note

If you see "app is damaged" error on macOS, run:
```sh
xattr -cr /Applications/Slides.app
```

## Project Structure

```
slides/
  apps/
    backend/       # Express API server (web version)
    frontend/      # Angular application
    desktop/       # Tauri desktop app
      src-tauri/   # Rust backend for desktop
  libs/
    markdown-parser/  # Shared markdown-to-slides parser
    shared-types/     # Shared TypeScript interfaces
  prisma/
    schema.prisma  # Database schema (web version)
    seed.ts        # Theme seed data
    migrations/    # Prisma migrations
```

## Tech Stack

- **Frontend**: Angular 21, Monaco Editor, Mermaid.js
- **Backend (Web)**: Express, Prisma 7, PostgreSQL
- **Backend (Desktop)**: Rust, Axum, SQLite
- **Desktop**: Tauri 2
- **AI**: Anthropic, OpenAI, and Gemini provider support
- **Tooling**: Nx monorepo, TypeScript
