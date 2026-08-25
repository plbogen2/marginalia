# Changelog

## v1.11.0 (August 2026)
- feat: show workspace files in Audio Studio scope and align palette with VS Code theme

## v1.10.0 (August 2026)
- feat: add Audio Studio sidebar with dialogue locator, voice casting, and anti-hallucination TTS

## v1.9.0 (August 2026)
- **Audio Studio & Voice Casting Sidebar**: Dockable multi-tab sidebar panel (`AudioStudioPanel`) embedded in the primary editor workspace layout for real-time manuscript writing, character auditioning, and directory tree scanning.
- **Real-Time Dialogue Locator**: Clickable quotes and interactive locate buttons that jump to and highlight dialogue lines in CodeMirror with centered viewport scrolling.
- **Character Merge & Split Controls**: Interactive tools to combine misidentified entities or split grouped dialogue lines into separate characters.
- **Multi-File Character Extraction & Tree Hierarchy**: Recursive directory selection to scan and cast characters across entire manuscripts.
- **Gemini TTS Verbatim Framing**: Explicit anti-hallucination prompting in Parlando to eliminate conversational response drift during neural text synthesis.
- **Master Audiobook Multi-Format Export**: Direct MP3 and M4B compilation with pacing presets and browser download.

## v1.8.0 (August 2026)
- feat: serve Parlando audio samples and web player publicly on live instance

## v1.7.4 (August 2026)
- **Per-User Global Ignore Scoping**: Scoped all global dictionary words, global grammar rules, and grammar instance ignores per authenticated user, preventing rule/dictionary ignore collisions across multi-user environments.
- **Database Index Optimization**: Added user-scoped unique indexes and query filters for `ignored_words`, `ignored_rules`, and `ignored_instances`.

## v1.7.3 (August 2026)
- **Voice Consistency & Allocation Fix**: Fixed `ProsodyDirector` and preview fast-path to preserve requested voices across chunks and prevent defaulting to primary profile voice.
- **Matched Fallback Voices**: Added mapped Edge neural voices for each Gemini voice in backend proxy when fallbacks are needed.
- **Continuous Gapless Audio Pipeline**: Initiates immediate parallel prefetching of 4 initial chunks on playback start and maintains a 3-chunk sliding window to eliminate inter-paragraph pauses.
- **Fast Exponential Backoff**: Cleaned up retry delay and shortened timeouts in Gemini engine for faster recovery.

## v1.7.2 (August 2026)
- **Monotonic Speech Session Lifecycle**: Implemented monotonic `speechSessionRef` lifecycle tokens to eliminate async race conditions, overlapping audio instances, and premature restart loops across start/stop/restart interactions.
- **Audio Hardware Buffer Flush**: Ensured explicit pause, src reset, and unload on playback stop or cancellation.
- **Selection-Aware Reading**: Support highlighting text to read only the selected excerpt.

## v1.7.1 (August 2026)
- **Parlando Preview Fast-Path**: Direct in-memory synthesis for read-aloud requests (<1,500 chars), bypassing multi-pass document parsing and FFmpeg mastering overhead.
- **Gemini 2.5 TTS Model Fix & PCM L16 Decoder**: Upgraded to `gemini-2.5-flash-preview-tts` and implemented direct 24kHz 16-bit PCM WAV container encapsulation.
- **Adaptive Fast-Start & 2-Chunk Prefetch**: Chunk 0 first sentence (<160 chars) fast-start with sliding window background prefetching.

## v1.7.0 (August 2026)
- **Parlando Neural Speech Engine Integration**: Integrated Parlando as a core TTS engine with Microsoft Edge neural voices and Google Gemini Speech Synthesis (`Fenrir`, `Puck`, `Charon`, `Aoede`, `Kore`).
- **Settings Voice & Pacing Customization**: Configurable voice engine selector, neural voice picker, pacing presets (normal, dramatic, rapid, relaxed), and speed multiplier.
- **Admin Telemetry & Feature Usage Monitor**: Added `/api/admin/metrics`, telemetry tracking, and Admin Dashboard.

## v1.6.0 (August 2026)
- feat: support selected text as context in write-with-me co-writer

## v1.5.1 (August 2026)
- fix: auto-trigger suggestion on empty cache and fix write-with-me button styling/icons

## v1.5.0 (August 2026)
- feat: add write-with-me co-writer dialogue mode and header trigger

## v1.4.10 (August 2026)
- fix: update service worker to use Network-First for HTML to prevent stale cache

## v1.4.9 (August 2026)
- fix: disable memfsVault auto-wipe on clone to preserve VFS files

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
