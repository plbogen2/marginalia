# Marginalia

Marginalia is a focused, web-based markdown editor designed for fiction writing with integrated Git/GitHub version control.

## Features
*   **Focus-Oriented Writing:** Distraction-free mode to collapse the file sidebar and preview panels.
*   **Live Markdown Preview:** Real-time side-by-side rendering of your document text.
*   **Word & Page Count Estimators:** Word counters with estimation formulas for paperback or hardback pages.
*   **Git & GitHub Version Control:** Commit, push, and pull directly from the header toolbar. Displays remote sync statuses.
*   **Git Auto-Identity Configurator:** Automatically configures local Git `user.name` and `user.email` properties on commit if they are unset, pulling from active GitHub accounts in Hosted Mode and local OS profiles in Local Mode.
*   **Interactive AI Editor Panel:** Developmental, Line, Copy, or Proofreader personas using Gemini. Supports multi-turn follow-up chats.
*   **Context Selector Tree:** Select individual chapters or check entire directory folders (which recursively parses nested markdown files) to use as AI prompt context.
*   **Apply Suggestion Diff Cards:** Inline comparison cards for proposed text changes with red/green highlights and click-to-apply patches.
*   **SQLite-Backed AI Cache:** Chat history and applied checkbox states are persisted per-chapter/persona across page refreshes.
*   **OSS Markdown Linter & Formatting:** Integrated David Anson's `markdownlint` library on the backend to flag structural issues (heading jumps, missing image alt text, trailing whitespace) with a dedicated "Format" document button in the header.
*   **Spelling & Grammar Check Cache:** Employs MD5-hashed paragraph caching for LanguageTool spelling and grammar checks in SQLite, speeding up checks and avoiding API throttling.
*   **Spelling context menus:** Right-click context menus with custom dictionaries, spell suggestions, and "Replace All" actions.
*   **Prose-First Gemini Model Selector:** Dynamically queries model selection list, filtering out legacy models, image/video generators (Imagen, Veo), and utility models while retaining active releases and experimental previews.
*   **Workspace Manager:** Switch workspaces or clone git repositories seamlessly.

## Setup & Running
1.  Ensure you have **Node.js (v22+)** installed.
2.  Run the startup script from the root directory:
    ```bash
    ./run.sh
    ```
3.  Open your browser and navigate to:
    **`http://localhost:5173`**

## Architecture
*   **Frontend:** React + TypeScript + Vite.
*   **Backend:** Express + Node's built-in SQLite database (`node:sqlite`).
*   **VCS:** Local `git` CLI wrappers.

## Hosting & Deployment

The easiest way to host Marginalia is using **Docker** and **Docker Compose**, which packages the Node runtime, Git CLI client, and compiled static assets into a single container.

### 1. Self-Hosting via Docker Compose
Build and run the application locally or on a VPS (DigitalOcean, GCE, etc.):

```bash
docker-compose up -d --build
```

This will:
*   Spin up the Express server on port **`3000`** (accessible at `http://localhost:3000`).
*   Mount a persistent docker volume `marginalia_data` at `/root/.marginalia` to persist your SQLite database and cloned git repositories.
*   Mount your local SSH configs (`~/.ssh`) in read-only mode so Git operations in Marginalia can authenticate with GitHub using your host machine's SSH keys.

### 2. Deploying to PaaS (Railway, Render, Fly.io)
You can link your repository directly to a PaaS:
1.  **Configure Nixpacks/Buildpacks:** Ensure the platform installs the **`git`** system package.
2.  **Mount Persistent Volume:** Attach a persistent disk volume (e.g. 1GB) and mount it to `/root/.marginalia`.
3.  **Environment Variables:**
    *   Set `DB_DIR=/root/.marginalia`.
    *   Set `PORT=3000`.
    *   Set `SESSION_SECRET` to a long random secret key.
    *   (Optional) Set `GEMINI_API_KEY` to pre-seed the LLM key.

