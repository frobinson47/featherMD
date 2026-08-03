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

## 2026-08-02 — AUTO-012 runner verification: no Windows runner existed, building one

### Decision
Confirmed via a direct, read-only query against Forgejo's Postgres (`action_runner` table, on Scooby) that exactly one Actions runner is registered instance-wide: `hetzner-1`, labels `["self-hosted","docker"]`, `owner_id`/`repo_id` both 0 (instance-scoped, available to any repo). It is a Docker-based runner and cannot natively produce a Windows NSIS installer. User chose to stand up a new, dedicated Windows runner on Optimus (this dev machine) rather than fall back to GitHub Actions or defer the pipeline. Forgejo does not publish an official Windows binary for `forgejo-runner` (only linux-amd64/linux-arm64 release assets exist for v12.13.2) — building from source with the Go toolchain already present on Optimus (`go1.26.2 windows/amd64`, `GOOS=windows GOARCH=amd64 go build`) instead.

### Context
AUTO-012's own scope required stopping and reporting rather than silently choosing a fallback once "not confirmed" was established — this entry records that checkpoint and the user's explicit choice once presented with the finding (2026-08-02).

### Alternatives considered
1. **Keep GitHub Actions for builds** — simplest, no new infra, but keeps a hard dependency on GitHub for the fork's own releases.
2. **Stand up a Windows Forgejo runner** (selected) — keeps the whole pipeline on Forgejo infra, at the cost of Optimus needing to stay on/reachable for releases and sharing the box with interactive dev work.
3. **Defer entirely** — leave AUTO-012 TODO; not selected.

### Reasoning
User's explicit choice, 2026-08-02, after being shown the runner-registry finding.

### Trade-offs accepted
Optimus becomes a load-bearing part of the release pipeline (must be on/reachable to cut a release) rather than a disposable CI agent. The `forgejo-runner.exe` binary running on it is self-built (not an official signed release artifact) since Forgejo doesn't ship one for Windows — acceptable since the source is pinned to a tagged release (`v12.13.2`) and built directly from Forgejo's own repo, not a third party's.

### Outcome (2026-08-02)
Runner `optimus-windows` registered instance-wide with labels `windows:host`, `self-hosted:host`, `tauri:host` (explicit `:host` schema so jobs run natively rather than defaulting to Forgejo runner's Docker backend, which Windows can't provide the way Linux does). Installed as an NSSM-wrapped Windows Service (`ForgejoRunner`, auto-start) since `forgejo-runner.exe` doesn't implement the Windows Service Control Manager protocol directly. `~/.cargo/bin` was added to the machine-wide `PATH` so the LocalSystem service account can find `rustc`/`cargo` (Node was already on the machine PATH). Verified via a throwaway smoke-test workflow (`.forgejo/workflows/runner-smoke-test.yml`, pushed and removed in the same session) that printed real `rustc`/`cargo`/`node`/`npm` versions and completed with `status: success` — confirming native (non-Docker) Windows execution actually works, not just that the runner registered. Also had to flip the repo's `has_actions` flag on via the API (was `false`) before any workflow would trigger at all.

---

## 2026-08-02 — AUTO-012 completion: NSIS-under-LocalSystem fix, Linux runner relocation, public releases repo

Three further problems surfaced during real tag-push testing, each requiring a decision:

### 1. NSIS bundling failed under the LocalSystem service account
`makensis.exe` (already proven to work when run interactively as Administrator) failed with `Unable to start child process, error 0x2` every time it ran under the `ForgejoRunner` service's default `LocalSystem` account — a Session-0-isolation-shaped problem. Tried the "Interact with Desktop" service flag first (free, no credentials needed) — did not fix it. User then set the service's logon account to the real `Administrator` account via `services.msc` (entering the password themselves, never through Claude) — this fixed it; NSIS bundling now succeeds under the service exactly as it does interactively.
**Trade-off accepted**: the release pipeline now depends on the `ForgejoRunner` service running as a real user account rather than the more isolated `LocalSystem` — a slightly larger blast radius if that service were ever compromised, accepted because there was no lower-privilege fix found.

### 2. hetzner-1 (fmrdigital) OOM-killed the Linux build
See the earlier decision above — resolved by standing up `scooby-docker`, a new runner on Scooby (11GB, mostly idle) rather than fighting for memory on a production box already running Authentik/Infisical/WordPress. `build-linux`/`release` now target `runs-on: linux` (Scooby's label), not `docker` (hetzner-1's).

### 3. featherMD's private repo blocked anonymous release downloads
### Decision
Publish releases to a new, separate, genuinely public repo — `frank/featherMD-releases` (personal account, not the `fmrdigital` org) — containing only built binaries and `latest.json`, never source. `fmrdigital/featherMD` stays private.

### Context
The shipped app's auto-updater runs on end-user machines with no Forgejo credentials, so release assets must be anonymously fetchable. Tried making `featherMD` itself public first (`PATCH .../repos/fmrdigital/featherMD {"private": false}`) — this actually resulted in `"internal": true`, not truly public, because **the `fmrdigital` organization itself is private**, and Forgejo caps every repo under a private org to at most "internal" (logged-in instance users only) regardless of the individual repo's own visibility setting. Confirmed via anonymous curl (404) even after the PATCH reported `"private":false`. Reverted immediately — the only way to truly make `featherMD` public would be changing the whole org's visibility, which would also expose every other fmrdigital repo (hookhouse-pro, GainsLedger, CommishHub, fleetwright-cloud, etc.) — far outside what was asked.

### Alternatives considered
1. Make `fmrdigital/featherMD` itself public — blocked by the org-visibility cap above; would have meant either accepting "internal" (still not anonymously fetchable) or making the whole org public (rejected, too broad).
2. New public repo under the personal `frank` account (selected) — sidesteps the org's visibility policy entirely since it's not owned by `fmrdigital`.
3. Host the feed on non-Forgejo infra (e.g., an R2/object-storage bucket) — more new infrastructure than necessary given option 2 works with tools already in place.

### Reasoning
User explicitly chose this option once the org-visibility blocker was explained (2026-08-02).

### Trade-offs accepted
Releases now live in a second repo, requiring a second, purpose-scoped Forgejo access token (`RELEASES_REPO_TOKEN`, `write:repository` on `frank/featherMD-releases` only, distinct from the interactive `FORGEJO_TOKEN`) stored as a repo secret on `fmrdigital/featherMD`. The pipeline publishes to **two** tags on the releases repo per run — the real version tag (for history/browsing) and a fixed `latest` tag with `override: true` (the actual, stable URL the updater endpoint points at) — because this Forgejo version has no GitHub-style `/releases/latest/download/` alias (confirmed 404 via a throwaway asset test before building this workaround).

### Final validation (2026-08-02)
A full real tag push (`v1.10.5-fmr-pipeline-test8`) built, signed, and published successfully on the first attempt after all of the above fixes landed. Confirmed anonymously (no auth header) via curl: `latest.json` at `https://forgejo.familytechlab.com/frank/featherMD-releases/releases/download/latest/latest.json` returns valid JSON with both platform signatures, and the Windows installer download returns `200`. `tauri.conf.json`'s `updater.endpoints` now points at exactly that URL; CSP `connect-src` narrowed to `forgejo.familytechlab.com` (GitHub entries removed). AUTO-012 is DONE.

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

---

## 2026-08-02 — AUTO-011 execution: new Infisical project for featherMD, signing key stored there

### Decision
Created a new, genuinely-net-new Infisical project (`featherMD`, workspace id `40d1f8ce-ad84-456d-b189-fa707f81f39a`) rather than reusing an existing app project, and stored the new Tauri/minisign signing keypair's private key + password there (`prod` environment, keys `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`), with a scoped `featherMD-app` machine identity (viewer role on the project) for future automated signing use.

### Context
Global Infisical policy lists ~16 existing app projects and says not to create new ones unless the app is genuinely net-new — featherMD wasn't on that list. Creating a new project also requires the org-admin machine identity (`claude-scaffold`) to have project access, which normally needs a manual UI assignment step for a brand-new project (per the Infisical wiring runbook's GOTCHA) — except `claude-scaffold` turned out to already have implicit access as the project's creator via the API, so no manual UI step was actually needed this time.

### Alternatives considered
1. **Local break-glass file only** — simplest, but leaves the private key without the durable, access-controlled storage every other app's secrets get.
2. **Show the key/password to the user directly in chat** — avoids infra work entirely, but pushes storage responsibility onto an ad hoc location instead of the standard system.
3. **Create the Infisical project now** (selected) — matches standing policy for genuinely-new apps, keeps the key in the same system every other app's secrets live in.

### Reasoning
User explicitly chose "Create Infisical project now" when asked (2026-08-02). Matches the global policy's own carve-out for net-new apps.

### Trade-offs accepted
featherMD is now its own line item in Infisical (a 17th app project) rather than folded into an existing one — correct per policy, but worth remembering it's a new addition to the "~16 existing projects" count documented in the runbook.

---

## 2026-08-03 — AUTO-004: audit of the `fs:scope: "**"` permission grant

### Decision (documentation only — no code changed)
`src-tauri/capabilities/default.json`'s unrestricted filesystem scope (`{"identifier": "fs:scope", "allow": [{"path": "**"}]}`) is necessary and should NOT be narrowed. featherMD is a general-purpose "open/save any file" editor (File→Open uses a native OS file picker with no path restriction, and Recent Files can point anywhere on disk) — there is no fixed project/workspace directory to scope access to, unlike an IDE with a "project root" concept. Narrowing the scope to, say, the user's home directory or Documents folder would silently break opening files from anywhere else (a USB drive, a network share, `C:\temp`, etc.), which is core, expected functionality for a Markdown editor, not an edge case.

### Permission-by-permission usage check
Checked every permission in `default.json` against an actual IPC call or frontend Tauri API import in `src/**` / `src-tauri/src/lib.rs`:

| Permission | Used? | Where |
|---|---|---|
| `core:default` | Yes | Base command set (app metadata, path resolution) required for the app shell to function at all |
| `opener:default` | Yes | `src/main.js` link-opening in preview pane (external links via `@tauri-apps/plugin-opener`) |
| `dialog:default`, `dialog:allow-open`, `dialog:allow-save` | Yes | `src/core/file-io.js` (`open`/`save` dialogs), `src/main.js` (`message`/`ask` confirmation dialogs) |
| `fs:default`, `fs:allow-read-text-file`, `fs:allow-read-file` | Yes | `src/core/file-io.js`, `src/main.js` (`readTextFile` on open/reload/external-change-detection) |
| `fs:allow-write-text-file`, `fs:allow-write-file` | Yes | `src/core/file-io.js` (`saveFile`/`saveFileAs`), `src/core/config.js` (`writeTextFile` for `config.json`) |
| `fs:allow-mkdir` | Yes | `src/core/config.js` (creating the app config directory on first run) |
| `fs:allow-exists` | Yes | `src/core/config.js` (checking for an existing config file before read/write) |
| `fs:scope` (`"**"`) | Yes | See Decision above — required for the open-anything editor model |
| `core:window:allow-set-size` | Yes | `src/platform/window.js` (`setSize` for saved-window-geometry restore) |
| `core:window:allow-minimize/-maximize/-unmaximize/-close/-is-maximized/-show/-hide/-set-focus` | Yes | `src/platform/window.js`, `src/main.js` (custom title bar controls, tray show/hide, focus-on-restore) |
| `core:window:allow-destroy` | **No confirmed usage** — no `.destroy()` call found anywhere in `src/**` or `src-tauri/src/lib.rs`. Likely a leftover from an earlier iteration of the custom title bar (close button uses `.close()`, not `.destroy()`). Candidate for removal in a future, explicitly-approved capabilities change — not touched here per this task's read-only scope. |
| `core:event:default`, `core:event:allow-listen` | Yes | `src/main.js` (`listen()` for tray-quit, open-file-from-args, file-changed-on-disk) |
| `core:event:allow-emit` | **No confirmed frontend usage** — no JS-side `emit()` call found in `src/**`. All `.emit()` calls found are Rust-side (`src-tauri/src/lib.rs`, backend→frontend), which is a different permission surface than this one (which governs frontend-initiated emits). Same disposition as `allow-destroy`: flagged, not removed. |
| `updater:default` | Yes | `src/platform/updater.js` (`check()`) |
| `process:default`, `process:allow-exit` | Yes | `src/platform/window.js` (`exit()` on quit), `src/platform/updater.js` (`relaunch()` after update) |

### Findings requiring follow-up
`core:window:allow-destroy` and `core:event:allow-emit` have no confirmed usage in the current codebase. Recommend a future AUTO task (human-approved, since `src-tauri/capabilities/**` changes require explicit approval per `.forge/policy.md`) to either remove them or confirm via a live click-through that some UI path exercises them that static grep missed (e.g., a Tauri-internal call path not visible from JS source).

### Trade-offs accepted
None — this task is documentation-only and made no code changes, so it introduces no risk itself. The two flagged-but-unremoved permissions remain a (very minor) larger-than-necessary attack surface until a follow-up task addresses them.

---

## 2026-08-03 — AUTO-007: non-Windows cfg-gating and CI coverage check

### Static cfg audit (`src-tauri/src/lib.rs`)
Every `#[cfg(target_os = "windows")]` block is clean: `show_main_window`, `set_webview_memory_low`, `tray_enabled_in_config`, and `setup_tray` are entirely Windows-only functions, called only from inside other `#[cfg(target_os = "windows")]` blocks (never referenced unconditionally). The two `#[tauri::command]`s that ARE compiled on every platform (`set_tray`, `set_webview_memory`) have matching `#[cfg(not(target_os = "windows"))]` arms that consume their otherwise-unused parameters (`let _ = (&app, enabled, &state);`) specifically to avoid unused-variable warnings on non-Windows. No Windows-only symbol leaks into a shared code path. This part of the audit found no issues.

### CI coverage — a real gap found
`.github/workflows/ci.yml` already has a `rust-check` job with `strategy.matrix.platform: [ubuntu-latest, windows-latest]`, with an inline comment explicitly calling out this exact concern ("the tray code is `#[cfg(target_os = \"windows\")]`, so only a Windows runner actually type-checks it — ubuntu alone would compile it out"). On paper, this is a correctly-designed check.

**But it has never actually run.** `fmrdigital/featherMD` has an active Forgejo push-mirror to `https://github.com/frobinson47/featherMD` (`sync_on_commit: true`, confirmed via the Forgejo API, last synced 2026-08-03T01:01:02Z with no error) — so commits genuinely do reach GitHub. Querying GitHub's public API for that repo's workflow run history (`GET /repos/frobinson47/featherMD/actions/runs`) returns `"total_count": 0` — zero runs, ever. GitHub Actions is evidently not enabled/triggering on the mirror target, so this workflow file is dead weight in practice: it exists, is well-designed, and verifies nothing.

### Answering the task's question
**Non-Windows Rust compilation is NOT currently verified anywhere that actually executes.** The `.github/workflows/ci.yml` design is correct but inert (0 runs on the mirror target). This environment is Windows-only, so no live cross-compile check was run here either — this is a static-inspection + CI-history finding, not a live build confirmation.

### Follow-up (not implemented here — read-only per task scope, `.github/**` needs human approval anyway)
Two independent fixes exist, either of which would close the gap:
1. Enable GitHub Actions on the `frobinson47/featherMD` mirror target (a GitHub-side settings change, not a repo file change).
2. Since this session (AUTO-012) stood up working Forgejo Actions runners for both Windows (`optimus-windows`) and Linux (`scooby-docker`), add an equivalent cross-platform `cargo check` job to a Forgejo Actions workflow instead — arguably a better fit given the fork's broader move away from GitHub-Actions dependence.
Neither was implemented under this task; both are candidates for a new, explicitly-scoped AUTO task.

---

## 2026-08-03 — AUTO-008: jsdom DOM-API gap audit beyond `Range`

### Method
Grepped `src/**` for every layout/measurement/observer API that jsdom is known to implement incompletely or not at all (`IntersectionObserver`, `ResizeObserver`, `MutationObserver`, `matchMedia`, `getBoundingClientRect`, `getClientRects`, `scrollIntoView`, `requestAnimationFrame`, `getComputedStyle`, `elementFromPoint`, `caretPositionFromPoint`/`caretRangeFromPoint`), then checked each call site's actual availability against a plain jsdom instance at the exact version this project pins (`jsdom@26.1.0`), and cross-referenced whether the current test suite exercises that path unmocked (which would produce the "silent stderr noise" pattern AUTO-002 found) or with an existing mock (safe).

### Findings
| API | Used in `src/**`? | jsdom 26.1.0 has it? | Exercised by tests? | Risk |
|---|---|---|---|---|
| `Range.getClientRects`/`getBoundingClientRect` | Yes (CodeMirror internals) | No (AUTO-002's original finding) | Yes | Already polyfilled in `tests/setup.js` |
| `Element.getBoundingClientRect` | Yes (`src/ui/divider.js`) | **Yes** (unlike `Range`'s version) | Yes | None — jsdom implements this one |
| `window.matchMedia` | Yes (`src/ui/themes.js`, `src/main.js`) | No | `themes.js`'s usage: yes, via a **per-test-file mock** (`tests/ui/themes.test.js`, `vi.stubGlobal('matchMedia', ...)`). `main.js`'s usage: no test imports `src/main.js` directly, and the call is inside a `DOMContentLoaded` listener that jsdom never fires unprompted, so it's dormant in tests today. | None currently — flagged as latent (see below) |
| `requestAnimationFrame` | Yes (`src/core/sync.js`, `src/main.js`, `src/preview/preview.js`) | No | `sync.js`'s usage: yes, via a **per-test-file mock** (`tests/core/sync.test.js`, `vi.stubGlobal('requestAnimationFrame', ...)`). `preview.js`'s usage (inside `refreshForThemeChange`'s Mermaid theme-refresh path) and `main.js`'s usage: **no test currently calls `refreshForThemeChange` or imports `main.js`**, so dormant today. | Latent (see below) |
| `ResizeObserver`, `IntersectionObserver`, `MutationObserver`, `scrollIntoView`, `elementFromPoint`, `caretPositionFromPoint`/`caretRangeFromPoint` | No usage found anywhere in `src/**` | N/A | N/A | None |

### Answering the task's question
**No further *currently-manifesting* gaps found** — a full `npm run test` run (5 consecutive full-suite runs, watching stderr) shows no new noise beyond what AUTO-002 already fixed. `tests/setup.js` needs no new polyfills today.

### Latent gap (not fixed here — no test exercises it yet, so nothing to fix)
`src/preview/preview.js`'s `refreshForThemeChange` (the Mermaid theme-refresh path) and `src/main.js`'s two `matchMedia`/`requestAnimationFrame` call sites are not covered by any current test, so their jsdom-incompatible calls never execute today. Both `themes.test.js` and `sync.test.js` already show the correct pattern (a per-test-file `vi.stubGlobal`) for whoever eventually writes tests touching these paths — worth a one-line note in a future task's setup rather than a global `tests/setup.js` polyfill, since a *global* stub would mask the same class of gap in a genuinely new, not-yet-written code path the way a blanket fix tends to.

### A test-robustness finding along the way (not a jsdom gap, but surfaced during this task)
AUTO-006's new `tests/preview/render-cache.test.js` (added earlier this session) was originally written with a fixed-iteration `setTimeout(0)` flush helper, which proved flaky (~1 failure in 9 full-suite runs) once run as part of the full 23-file parallel suite rather than in isolation — timing assumptions that hold when a file runs alone don't necessarily hold under Vitest's worker-pool contention. Rewrote it to use the same polling `waitFor(predicate, timeout)` pattern already established in `tests/preview/math-mermaid.test.js`, which resolved it (5/5 clean full-suite runs after the fix, plus the earlier 17-ish runs during debugging). Noted here since it's directly relevant to "what causes flaky/wrong test behavior in this test environment" even though it isn't itself a jsdom API gap — a fixed-tick assumption is a different class of test-environment fragility than a missing DOM API, but has the same failure mode (looks fine until run under real conditions).

### Trade-offs accepted
None — documentation-only for the jsdom gap audit itself (no polyfills were needed); the `render-cache.test.js` timing fix is a test-file-only change with no `src/**` impact.
