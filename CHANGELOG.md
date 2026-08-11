# Changelog

## v1.4.8 (August 2026)
- Add unit tests for mountUserVfs

## v1.4.7 (August 2026)
- Use temporary password file for gocryptfs to fix extpass empty password error

## v1.4.6 (August 2026)
- Chain deploy workflow to run after Auto Release completes

## v1.4.5 (August 2026)
- Propagate VFS mount error to OAuth login failure in app.ts

## v1.4.4 (August 2026)
- Throw error on VFS mount failure to avoid silent failures

## v1.4.3 (August 2026)
- Report detailed errors in frontend fetch helpers

## v1.4.2 (August 2026)
- Fix GitHub Action: add write permissions and use jq

## v1.4.1 (August 2026)
- **Conversational Inline 'Write With Me' Mode**: Collaborative co-writing partner mode integrated directly in the editor as a CodeMirror panel, supporting context files and inline comments.

## v1.3.0 (August 2026)
- **Hands-Free AI Voice Dictation**: Real-time speech-to-text dictation with automatic voice punctuation commands.
- **Audio Proofreading (TTS)**: Text-to-Speech chapter reading with sentence chunking and cursor-position start.
- **Neural Voice Prioritization**: Auto-detection and optgroup sorting of high-definition neural voices in Settings.
- **Standalone Chrome App (PWA)**: Full standalone installability, manifest, service worker caching, and 512x512 app icons.
- **HTTPS & Mobile Responsiveness**: Caddy automated Let's Encrypt TLS reverse proxy and responsive mobile CSS breakpoints.

## v1.2.0 (July 2026)
- **In-Memory AES-256-GCM Vault**: Zero-plaintext server storage using in-memory virtual filesystems.
- **Per-User Encrypted Sandbox**: Auto-mount VFS on login and auto-unmount on logout/idle timeout.
- **Git Sparse-Checkout & Blob Filter**: Excludes binary executables (`.exe`, `.sh`, `.dll`, `.bin`) and limits blob downloads to 10MB.
- **Per-User Storage Quota**: Enforces 100MB per-user quota with live storage progress indicators.

## v1.1.0 (July 2026)
- **GitHub OAuth Repos Browser**: Browse, filter, and clone public/private repos directly into user VFS storage.
- **Markdown Linter Integration**: Integrated backend `markdownlint` with formatting and hover squiggles.
- **Paragraph-Level Caching**: Hashed caching for LanguageTool spelling and grammar checks.

## v1.0.0 (July 2026)
- **Focus-Oriented Editor**: Dual-pane Markdown editor with real-time preview and collapsible sidebars.
- **Side-by-Side Diffs**: Visual commit diffs and automated AI commit message suggestions.
- **AI Editing Personas**: Developmental, Line, Copy, Proofreader, and Security Auditor personas.
