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
