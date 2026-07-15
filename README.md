# Marginalia

Marginalia is a focused, web-based markdown editor designed for fiction writing with integrated Git/GitHub version control.

## Features
*   **Focus-Oriented Writing:** Distraction-free mode to collapse the file sidebar and preview panels.
*   **Live Markdown Preview:** Real-time side-by-side rendering of your document text.
*   **Word & Page Count Estimators:** Word counters with estimation formulas for paperback or hardback pages.
*   **Git & GitHub Version Control:** Commit, push, and pull directly from the header toolbar. Displays remote sync statuses.
*   **Interactive AI Editor Panel:** Developmental, Line, Copy, or Proofreader personas using Gemini. Supports multi-turn follow-up chats.
*   **Apply Suggestion Diff Cards:** Inline comparison cards for proposed text changes with red/green highlights and click-to-apply patches.
*   **SQLite-Backed AI Cache:** Chat history and applied checkbox states are persisted per-chapter/persona across page refreshes.
*   **Client-Side Markdown Linter:** Inline editor warnings for trailing whitespace, heading hierarchy jumps, and missing alternative image text.
*   **Spelling context menus:** Right-click context menus with custom dictionaries, spell suggestions, and "Replace All" actions.
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
