# Marginalia

Marginalia is a focused, web-based markdown editor designed for fiction writing with integrated Git/GitHub version control.

## Features
*   **Focus-Oriented Writing:** Toggles to hide the sidebar and preview panels for distraction-free writing.
*   **Live Markdown Preview:** See how your document renders in real-time.
*   **Built-in Word & Character Counters:** Keep track of your progress.
*   **Git Integration:** Commit, push, and pull directly from the editor toolbar. Shows dirty/clean status and branch name.
*   **Workspace & Repository Manager:** Switch between projects or clone remote repositories directly from the UI.
*   **SQLite-Backed Settings:** Stores your recent projects and remembers your last active workspace.

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
