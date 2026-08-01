# Decisions Log

Record non-obvious decisions here so future sessions understand why things are the way they are.

## 2026-08-01 — Fork identity: rebrand rather than repoint

### Decision
FMR Digital's fork will get its own Tauri app `identifier` (replacing `com.feathermd.app`) and its own minisign signing keypair, rather than keeping upstream's identifier and just swapping the update feed URL.

### Context
The app ships with a working auto-updater (`src/platform/updater.js`) already wired to upstream's GitHub release feed and signed with upstream's minisign pubkey (`src-tauri/tauri.conf.json`). Left as-is, this fork would silently pull upstream's builds over its own changes. Fixing this requires deciding how independent the fork's release identity should be.

### Alternatives considered
1. **Repoint only** — keep `com.feathermd.app`, swap `pubkey`/`endpoints` to a fork-controlled feed. Cheapest.
2. **Rebrand + own identity** — new identifier, new keypair, new release feed. Matches how VSCodium/Brave-style forks diverge cleanly.
3. **No independent updater** — drop auto-update, rely on manual upstream merges.

### Reasoning
The fork already plans real product divergence (tabs, formatting toolbar, Discord/Thread integrations, footer branding "Forked and Modified by FMR Digital, LLC") — this isn't a tracking branch, it's a genuine fork. Sharing an app identifier with upstream risks Windows install collisions if a user ever has both, and undersells the fork's independence. Option 2 was selected.

### Trade-offs accepted
More setup work now (new keypair, new identifier, no free-ride on upstream's release infra) in exchange for a clean, collision-free identity. Existing fork builds (if any) under the old identifier won't upgrade in place across this change — acceptable since this is the intentional divergence point.

---

## 2026-08-01 — Release hosting: Forgejo Actions (pending runner verification)

### Decision
Host the fork's release pipeline (build, sign, publish `latest.json`) on Forgejo Actions at `forgejo.familytechlab.com/fmrdigital/featherMD`, replacing `.github/workflows/release.yml`'s GitHub Actions pipeline — contingent on confirming Forgejo's runners can actually build Windows + Linux Tauri binaries (NSIS bundling normally needs a Windows runner).

### Context
Upstream's release workflow runs on GitHub-hosted `windows-latest`/`ubuntu-22.04` runners via `tauri-apps/tauri-action`. FMR Digital's global convention is Forgejo as the single source of truth for git hosting and CI, with GitHub used only as a push-mirror target, never pushed to directly.

### Alternatives considered
1. **Forgejo Actions** — matches the standing infra convention.
2. **Keep GitHub Actions for builds**, host only the release/update feed elsewhere.
3. **Not yet decided / investigate first**.

### Reasoning
Forgejo Actions was selected as the preferred direction, but this decision is explicitly conditional: the scoped task (AUTO-012) must first confirm Forgejo's runner capability before committing to a full pipeline rewrite, since Tauri's Windows bundling (NSIS) is runner-sensitive in a way that isn't guaranteed to "just work" on a self-hosted Forgejo runner the way it does on GitHub's hosted `windows-latest`.

### Trade-offs accepted
Possible rework if Forgejo runners can't handle the Windows build — the fallback (keep GitHub Actions for the build step, host the feed on Forgejo) is documented in AUTO-012 so it isn't a dead end if the primary path doesn't pan out.

---

## 2026-08-01 — Tabs feature scope: capped tabs, single-file watcher only

### Decision
Multi-file tabs are capped at 4-6 concurrent tabs (no overflow-scroll UI for more), positioned at the top below the menu bar, closing the last tab leaves one empty "Untitled" tab (never closes the window), and the Rust file-watcher continues watching only the single active tab's file rather than scaling to watch every open tab simultaneously.

### Context
The app's current architecture is single-document throughout: one global `currentFilePath`/`isDirty` in `src/core/state.js`, one module-level CodeMirror `EditorView`, and one `Mutex<Option<RecommendedWatcher>>` in the Rust backend. Adding tabs touches all of these.

### Alternatives considered
1. **Uncapped tabs with overflow scrolling** — more general, but unnecessary complexity for a Markdown editor's realistic usage.
2. **Per-tab file watchers** (`HashMap<PathBuf, RecommendedWatcher>` in Rust) — detects external edits to background tabs, but a Rust-side rewrite of the watcher subsystem.
3. **Capped tabs, single active-file watcher** (selected) — background tabs simply don't get live external-change notifications until focused.

### Reasoning
4-6 tabs matches realistic usage for this app; a hard cap avoids building overflow-scroll UI for a case that won't come up. Keeping the watcher single-file avoids a Rust-side subsystem rewrite for a benefit (detecting edits to files you're not looking at) judged not worth the cost.

### Trade-offs accepted
External edits to a background tab's file won't be detected until the user switches to that tab (no live reload-prompt for unfocused tabs). This is a documented, intentional limitation, not a bug — worth a one-line mention in the README/changelog when shipped so it isn't reported as one later.
