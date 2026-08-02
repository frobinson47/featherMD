# Autonomous Forge Roadmap

## Product vision

Feather MD is a native, dual-pane Markdown editor built on Tauri 2 (Rust shell) and CodeMirror 6 (JS/Vite frontend). It targets instant cold start, low memory (~50 MB), and a distraction-free editing/preview experience, distributed as a small Windows installer. Autonomous Forge is used here to keep a clear improvement plan, choose small tasks, check results, and record what happened.

## Product scope and non-goals

This roadmap tracks incremental improvements to the editor, preview, and packaging. It is not a replacement for the GitHub issue tracker (upstream: prathamreet/featherMD) or the release/CI pipeline in `.github/**`. Forge should not drive releases, versioning, or dependency upgrades — those stay human-directed.

## Current architecture

- `src/main.js` — app entry point, wires editor/preview/UI together.
- `src/editor/**` — CodeMirror 6 setup (Markdown language, extensions, keymaps).
- `src/preview/**` — Markdown-to-HTML rendering pipeline (marked, DOMPurify sanitization, KaTeX math, Mermaid diagrams, highlight.js).
- `src/core/**` — sync logic between editor and preview panes, document state.
- `src/ui/**` — toolbar, fullscreen, theming.
- `src/platform/**` — Tauri API bindings (file dialogs, fs, process, updater) vs. any browser/dev fallback.
- `src-tauri/**` — Rust shell: Tauri config, capabilities/permissions, native build.
- `page/**` — static marketing/landing page, kept in sync with the app via `npm run sync-page`.
- `tests/**` — Vitest unit/integration tests mirroring `src/` structure, plus `security.test.js` (sanitization) and `performance.bench.js`.

## Current implementation status

Roadmap v1 is in progress. Codebase is an established, released project (v1.10.5) with CI, tests, and existing conventions — Forge tasks here are incremental, not greenfield.

## Technical debt

None documented yet. Surface any discovered during Forge runs here (with file/area and why it matters) rather than fixing silently outside an approved task.

## Prioritized roadmap

### AUTO-001 — Establish a baseline validation task
Priority: P1
Status: DONE

Goal: Run and confirm the existing validation suite (`npm run lint`, `npm run test`) passes cleanly on a fresh clone, and record the baseline in `.ai/AUTONOMOUS_STATE.md`.
Why it matters: Forge needs a known-good baseline before making any autonomous changes, so regressions are attributable to Forge's own edits.
Scope: No source changes expected — this is a verification task. If lint/test failures exist on a clean checkout, document them as findings (do not silently fix) and propose a follow-up AUTO task.
Expected files or areas: none (read-only validation run).
Acceptance criteria: `.ai/AUTONOMOUS_STATE.md` records the exact commands run and their pass/fail results.
Validation: `npm run lint` and `npm run test` (vitest run), executed from repo root.
Risks or assumptions: Assumes `npm install` has been run so `node_modules` is present; a clean environment may need that step first, which is outside this task's scope.
Notes: This is a bootstrapping task with no source changes — its only output is the recorded baseline in `.ai/AUTONOMOUS_STATE.md` plus any follow-up AUTO tasks proposed for discovered failures.

### AUTO-002 — Silence jsdom getClientRects noise in editor tests
Priority: P3
Status: DONE

Goal: Stop `tests/editor/editor.test.js` from printing `TypeError: textRange(...).getClientRects is not a function` to stderr during `npm run test`, without changing what the tests verify or how CodeMirror behaves in production.
Why it matters: The stderr noise is caught internally by CodeMirror's measure loop (tests still pass), but it clutters CI/local test output and can mask real errors printed the same way. It's a jsdom environment gap (no layout engine), not an application bug.
Scope: Test-only change. Add a minimal `Range.prototype.getClientRects` (and `getBoundingClientRect` if also missing) polyfill/stub in the Vitest test setup so jsdom's `Range` API matches what CodeMirror's layout measurement expects. Do not modify `src/editor/**` or any production code — this is purely about the test environment's DOM shim.
Expected files or areas: `vitest.config.js` (setupFiles entry) and a new or existing test setup file (e.g. `tests/setup.js`); `tests/editor/editor.test.js` only if it needs an updated import.
Acceptance criteria: `npm run test` passes with the same 225/9 pass counts and no `getClientRects is not a function` stderr output. No production source files under `src/**` change.
Validation: `npm run test` (vitest run), confirming pass counts match AUTO-001's baseline (9 files / 225 tests) and stderr is clean.
Risks or assumptions: Assumes the noise is purely a jsdom API gap and not masking a real CodeMirror/jsdom incompatibility; if any test's pass/fail outcome changes after the polyfill, stop and report rather than adjusting test expectations to fit.
Notes: Cosmetic/DX improvement only, no functional impact on the shipped app.

### AUTO-003 — Test coverage for the save/dirty/watcher state contract
Priority: P1
Status: DONE

Goal: Add test coverage around `src/core/state.js` (`currentFilePath`, `isDirty`, `lineEnding`, `isSaving`) and `src/core/file-io.js`'s use of them — specifically the `markSaveStart`/`markSaveEnd` echo-suppression window, `confirmDiscardChanges()`'s dirty-check branch, and `loadFileContent()`'s state resets — so the contract between JS state and the Rust file watcher (`watch_file`/`unwatch_file` IPC) is pinned down by tests, not just inline comments (see `PERF-12`).
Why it matters: These are the only global mutable state in the app and are timing-sensitive (the 500ms `SAVE_ECHO_WINDOW_MS` echo-suppression window). A change to `main.js`, `file-io.js`, or the watcher IPC contract could silently break save-echo suppression or the unsaved-changes guard with no test catching it today — `tests/core/sync.test.js` covers scroll sync, not this.
Scope: Test-only. Add assertions/tests exercising `openFile`/`saveFile`/`saveFileAs`/`newFile`/`loadFileContent`/`confirmDiscardChanges` state transitions using mocked Tauri APIs (existing tests already mock `initEditor`; follow that pattern). Do not modify `src/core/state.js` or `src/core/file-io.js` production logic — if a real bug is found while writing tests, stop and report it as a new finding rather than fixing it inline.
Expected files or areas: `tests/core/**` (new or expanded test file, e.g. `tests/core/file-io.test.js`).
Acceptance criteria: New tests pass; `npm run test` total pass count only increases (no regressions to the 225 baseline); no changes under `src/**`.
Validation: `npm run test` (vitest run) and `npm run lint`.
Risks or assumptions: Assumes Tauri's `@tauri-apps/plugin-fs`/`plugin-dialog` can be mocked at the module level the way existing tests already do for other modules; if not, scope narrows to whatever is mockable and the gap is reported rather than worked around with production code changes.
Notes: Directly follows from the Risks section of the project map — state fragility was flagged as the top risk for any future change to file I/O.

### AUTO-004 — Written audit of the `fs:scope: "**"` permission grant
Priority: P2
Status: TODO

Goal: Produce a short written audit (not a code change) explaining why `src-tauri/capabilities/default.json` grants full filesystem scope (`"path": "**"`), what would be lost/broken if it were narrowed, and confirming every other granted permission (`process:allow-exit`, `updater:default`, etc.) is actually used by a corresponding IPC call or frontend feature.
Why it matters: Broad filesystem access is the single largest security-relevant surface in the app. It's almost certainly necessary for an "open/save any file" editor, but that reasoning currently only lives in a reviewer's head, not in the repo — and `tauri.conf.json`/capabilities changes are already flagged as human-approval-required in `.forge/policy.md`, so this task documents rather than modifies.
Scope: Read-only investigation and a written note. Do NOT modify `src-tauri/capabilities/default.json` or `src-tauri/tauri.conf.json` under this task — any narrowing this audit recommends becomes a separate, explicitly human-approved follow-up task.
Expected files or areas: A new note under `.ai/DECISIONS.md` (using the existing Decision/Context/Alternatives/Reasoning/Trade-offs format) summarizing the audit; no source files change.
Acceptance criteria: `.ai/DECISIONS.md` gains one entry documenting the fs:scope rationale and a permission-by-permission usage check against `src-tauri/src/lib.rs` and the frontend Tauri API calls it wires to.
Validation: None (documentation-only task) — confirm no files under `src-tauri/**` (other than the audit note if placed differently) or `.forge/**` changed.
Risks or assumptions: None — this task cannot itself introduce a regression since it makes no code changes.
Notes: This is intentionally scoped as documentation, not a permission change, per the "Do Not Change Without Explicit Human Approval" list below.

### AUTO-005 — Expand security tests for the preview sanitization pipeline
Priority: P1
Status: DONE

Goal: Expand `tests/security.test.js` to cover more of `src/preview/preview.js`'s sanitization surface: the custom `blockMath`/`inlineMath` marked extensions (especially the currency-vs-math disambiguation regex), the DOMPurify config (`USE_PROFILES`, `ADD_ATTR: ['target']`, `ADD_TAGS: ['pb']`), and Mermaid's `securityLevel: 'strict'` + `trust: false` KaTeX config, with adversarial inputs (script tags inside math/mermaid source, malformed `<pb>` nesting, crafted `$...$` sequences).
Why it matters: This pipeline is the app's primary XSS defense surface — it takes arbitrary untrusted markdown (any file the user opens) and injects the result as `innerHTML`. `security.test.js` exists but its current coverage wasn't fully reviewed; gaps here are the highest-severity risk category in the app.
Scope: Test-only. Add test cases to `tests/security.test.js` (or a new `tests/preview/security-extra.test.js` if that reads better). Do not modify `src/preview/preview.js` — if a test reveals an actual sanitization bypass, stop immediately, do not attempt a fix, and report it as a critical finding for explicit human review.
Expected files or areas: `tests/security.test.js` and/or `tests/preview/**`.
Acceptance criteria: New adversarial test cases pass against current behavior (proving the existing sanitization holds) or surface a documented, unfixed finding; `npm run test` pass count only increases; no changes under `src/**`.
Validation: `npm run test` (vitest run) and `npm run lint`.
Risks or assumptions: Assumes DOMPurify/marked/Mermaid's current sanitization is actually sound (per the project's existing security-conscious comments); if this task finds otherwise, that supersedes the "just add tests" scope and must be escalated, not silently patched.
Notes: Highest-priority risk task — XSS in the preview pane is the most severe class of bug this app could ship.

### AUTO-006 — Test coverage for the render-token / LRU cache invalidation pattern
Priority: P3
Status: TODO

Goal: Add tests for `src/preview/preview.js`'s `renderSeq`/`themeRefreshSeq` monotonic-token pattern and the `mathCache`/`mermaidCache` LRU (`lruGet`/`lruSet`) — verifying a stale in-flight render is correctly abandoned when a newer render starts, and that caches evict correctly at their `MATH_CACHE_MAX`/`MERMAID_CACHE_MAX` bounds.
Why it matters: This pattern is reused implicitly as a convention ("any new async render path should follow the same seq-check pattern") but isn't itself under test, so a future change could silently break stale-render abortion (visible as flicker/wrong content) with nothing catching it.
Scope: Test-only, targeting exported/testable seams in `src/preview/preview.js`. If the relevant functions aren't currently exported for testing, do not export new internals — instead test the behavior indirectly through `renderMarkdown`'s public surface (rapid successive calls), and note in `.ai/AUTONOMOUS_STATE.md` if that limits coverage.
Expected files or areas: `tests/preview/**`.
Acceptance criteria: New tests pass; `npm run test` pass count only increases; no changes under `src/**`.
Validation: `npm run test` (vitest run) and `npm run lint`.
Risks or assumptions: Rapid-succession async rendering is inherently timing-sensitive in tests; assumes deterministic ordering can be achieved via awaiting/flushing microtasks rather than real timers. If flaky, scope narrows rather than introducing `setTimeout`-based sleeps.
Notes: Lower priority than AUTO-003/AUTO-005 since this risk is about future regressions, not a currently-known gap.

### AUTO-007 — Verify Windows-only Rust `cfg` gating stays cross-platform-clean
Priority: P2
Status: TODO

Goal: Confirm that `src-tauri/src/lib.rs`'s `#[cfg(target_os = "windows")]`-gated code (tray, webview-memory trimming) leaves a cleanly compiling, correctly-behaving non-Windows build — i.e. every `#[cfg(not(target_os = "windows"))]` branch exists where needed and no Windows-only symbol leaks into the shared path.
Why it matters: Development happens on Windows (this environment), so a non-Windows compile break in cfg-gated code could go unnoticed for a long time. The project explicitly supports non-Windows builds (per the existing cfg structure) — this task verifies that support hasn't silently rotted.
Scope: Read-only verification, not a fix. Check `.github/**` CI workflows to see whether non-Windows builds are already covered there (if so, this task just confirms and documents that, without editing `.github/**` — that path requires human approval per policy). If CI does NOT cover non-Windows builds, report that gap rather than adding a workflow, since `.github/**` changes need human approval.
Expected files or areas: None changed — this is an investigation. Findings go in `.ai/AUTONOMOUS_STATE.md`.
Acceptance criteria: A clear statement of whether non-Windows Rust compilation is currently verified anywhere (CI or otherwise), recorded in state/changelog.
Validation: Inspection of `.github/**` workflow files and `src-tauri/src/lib.rs`'s cfg structure; no build commands required since cross-compilation tooling may not be available in this environment.
Risks or assumptions: This environment is Windows-only, so an actual non-Windows `cargo check` can't be run here — the task is limited to static inspection of cfg correctness and CI coverage, not a live cross-compile.
Notes: If this surfaces a real CI gap, the fix (adding a CI job) falls under `.github/**` and needs explicit human approval — propose it as a new task, don't implement it under this one.

### AUTO-008 — Broaden jsdom DOM-API gap audit beyond `Range`
Priority: P3
Status: TODO

Goal: Following AUTO-002's discovery that jsdom lacks `Range.prototype.getClientRects`/`getBoundingClientRect`, proactively check whether CodeMirror 6 or other `src/**` code paths call other DOM layout/measurement APIs jsdom doesn't implement (e.g. `Element.getClientRects`, `IntersectionObserver`, `ResizeObserver`) that could be silently caught-and-swallowed elsewhere the way the `Range` gap was, masking future stderr noise or subtly wrong test behavior in files other than `tests/editor/editor.test.js`.
Why it matters: AUTO-002 fixed one instance of this class of gap; there's no guarantee it's the only one. A systematic check now is cheaper than discovering the next one as unexplained flaky/noisy test output later.
Scope: Investigation plus, if additional concrete gaps are found, the same kind of minimal polyfill added to `tests/setup.js` following AUTO-002's precedent. No production `src/**` changes.
Expected files or areas: `tests/setup.js` (possible additions only if a real gap is found and confirmed safe).
Acceptance criteria: Either "no further gaps found" recorded in `.ai/AUTONOMOUS_STATE.md`, or additional polyfills added with `npm run test` still passing at or above the current baseline with no new stderr noise.
Validation: `npm run test` (vitest run), full stderr review.
Risks or assumptions: Same as AUTO-002 — any polyfill added must not change actual pass/fail outcomes of any test; if it would, stop and report rather than adjusting test expectations.
Notes: Lowest priority — cosmetic/DX, follows directly from AUTO-002 rather than a newly discovered risk.

### AUTO-009 — Footer branding: centered fork attribution
Priority: P3
Status: DONE

Goal: Add centered "Forked and Modified by FMR Digital, LLC" text to the `#status-bar` footer.
Why it matters: User-requested branding for the fork; MIT license (confirmed in `LICENSE`) permits this — its only obligation is preserving the original copyright/permission notice, unrelated to adding new UI text.
Scope: `#status-bar` (`index.html:610`) is currently a two-slot flex row (`status-filepath` left, `status-right` cluster right) with no center slot — needs a layout change (e.g. three-column grid, or an absolutely-positioned center element) to add true centered text without disturbing the existing left/right content.
Expected files or areas: `index.html`, whichever stylesheet owns `#status-bar` (`src/styles/base.css` or `toolbar.css`).
Acceptance criteria: Text appears centered in the status bar, doesn't overlap existing left/right content, and holds up at the app's minimum window width (600px, per `tauri.conf.json` `minWidth`) in both light and dark themes.
Validation: `npm run lint`; manual visual check via `npm run dev` at minimum and default window widths, both themes.
Risks or assumptions: At 600px minimum width the status bar is already crowded (word/char/paragraph counts, cursor position, version link) — centered text may need to hide or truncate below some width threshold; report if a clean fit isn't achievable rather than forcing overlap.
Notes: User confirmed 2026-08-01 — "G-T-G" on this item, no open questions.

### AUTO-010 — Markdown formatting toolbar
Priority: P2
Status: DONE

Goal: Add a new icon toolbar for markdown formatting: bold, italic, strikethrough, code, link, image, headings, lists (ordered/unordered), blockquote, table.
Why it matters: User-requested feature. Confirmed by inspection that zero formatting commands exist anywhere in the codebase today — `src/ui/toolbar.js` is a dropdown menu bar (File/View/Style), not a formatting toolbar, and `src/core/keyboard.js` has no bold/italic/etc. bindings.
Scope: New UI module (e.g. `src/ui/markdown-toolbar.js`) plus new markup in `index.html` (a row near the editor pane), new editor API methods in `src/editor/editor.js` for wrap-selection/insert-at-cursor/toggle-line-prefix operations (bold/italic/strikethrough/code = wrap selection or insert markers with cursor between them if no selection; headings/lists/blockquote = toggle a line prefix; link/image = insert `[text](url)`/`![alt](url)`; table = insert a default skeleton, e.g. 2x2, since there's no selection-driven sizing UI in this scope). Wire into `src/main.js` alongside the other UI modules.
Expected files or areas: New file(s) under `src/ui/**`, edits to `src/editor/editor.js`, `index.html`, `src/styles/toolbar.css`, `src/main.js`.
Acceptance criteria: Each of the 10 actions works correctly on both an empty selection (inserts markers, cursor placed between them) and a non-empty selection (wraps/prefixes it); buttons are keyboard-accessible; new tests cover the wrap/insert logic; `npm run test` and `npm run lint` pass with no regression to the existing 225-test baseline.
Validation: `npm run lint`, `npm run test` (new tests for formatting commands), manual check via `npm run dev`.
Risks or assumptions: Must not collide with existing keybindings in `src/core/keyboard.js` — check before adding any new shortcut.
Notes: Action list confirmed by user 2026-08-01: bold, italic, strikethrough, code, link, image, headings, lists, blockquote, table.

### AUTO-011 — Fork identity: new app identifier and signing key
Priority: P1
Status: TODO

Goal: Change `src-tauri/tauri.conf.json`'s `identifier` from `com.feathermd.app` to a distinct FMR Digital identifier (e.g. `com.fmrdigital.feathermd`), generate a new Tauri/minisign signing keypair, and store the private key + password in Infisical per the project's standard secrets workflow — without yet touching the update endpoint (that's AUTO-012).
Why it matters: See `.ai/DECISIONS.md` "Fork identity: rebrand rather than repoint" (2026-08-01) — the fork is getting its own release identity rather than sharing Windows install identity with upstream.
Scope: This task touches `src-tauri/tauri.conf.json`, a path flagged "Human approval required" in `.forge/policy.md` — approval was given in conversation on 2026-08-01 (user selected "Rebrand + own identity" explicitly). Generate the new keypair (e.g. via `tauri signer generate`), store the private key + password in Infisical (new machine identity/project created when wiring, per global policy — never printed, presence/length checks only), update `identifier` and (once generated) `updater.pubkey` in `tauri.conf.json`.
Expected files or areas: `src-tauri/tauri.conf.json`; Infisical (external, not a repo file).
Acceptance criteria: App still builds locally with the new identifier (`cargo check` in `src-tauri`, or a full `npm run tauri build` if time permits); the private signing key is never committed to the repo (grep the diff for the private-key pattern per the global secret-leak-prevention policy).
Validation: `cargo check` in `src-tauri`; diff review for secret leakage.
Risks or assumptions: Any existing fork builds under the old identifier won't upgrade in-place across this change — expected, since this is the intentional divergence point. Assumes Infisical (`100.119.88.80:8085`) is reachable from this environment.
Notes: Approved by user 2026-08-01. Should land before AUTO-012 (which depends on the new pubkey).

### AUTO-012 — Forgejo release pipeline and repointed update feed
Priority: P1
Status: TODO

Goal: Build a Forgejo Actions workflow that builds, signs, and publishes Windows + Linux Tauri binaries plus a `latest.json` to a Forgejo Release on `forgejo.familytechlab.com/fmrdigital/featherMD` on tag push, then repoint `tauri.conf.json`'s `updater.endpoints` to that feed and widen the CSP `connect-src` to allow it.
Why it matters: The app's auto-updater (`src/platform/updater.js`) is fully implemented but currently points at upstream's GitHub release feed (`.github/workflows/release.yml` builds/signs to GitHub Releases via `tauri-apps/tauri-action`). Without repointing it, the fork's updater would either do nothing useful or (before AUTO-011) risk pulling upstream's build over this fork's changes.
Scope: **First sub-step, before writing the full pipeline**: confirm Forgejo Actions on `forgejo.familytechlab.com` actually has runners capable of a Windows build (Tauri's NSIS bundling is runner-sensitive; this is unconfirmed — see `.ai/DECISIONS.md`). If confirmed, add a new Forgejo Actions workflow (path/trigger syntax per Forgejo's docs, may differ from `.github/workflows/`) mirroring `release.yml`'s test→build→sign→publish steps; update `tauri.conf.json`'s `updater.endpoints` and `app.security.csp` `connect-src` to the new Forgejo host (human-approval-required path, approved in conversation 2026-08-01). If NOT confirmed, stop and report — do not silently fall back to a different approach without checking in, since the fallback (keep GitHub Actions for builds, host only the feed on Forgejo) is a materially different pipeline.
Expected files or areas: New Forgejo workflow file, `src-tauri/tauri.conf.json` (`updater.endpoints`, CSP `connect-src`). Depends on AUTO-011 (needs the new pubkey).
Acceptance criteria: A test tag push produces a Forgejo Release with signed installer artifacts and a valid `latest.json`; a dev build's updater successfully detects that release as available via `check()`.
Validation: End-to-end: tag a test build, confirm the Forgejo Actions run succeeds, manually verify `check()` detects the resulting release.
Risks or assumptions: UNCONFIRMED whether Forgejo's runners can build Windows Tauri binaries — must be verified first (see Scope). This is the single biggest unknown in the whole enhancement set.
Notes: User selected "Forgejo Actions (Recommended)" 2026-08-01, contingent on runner-capability confirmation — see `.ai/DECISIONS.md`.

### AUTO-013 — "Send to Discord" webhook integration
Priority: P2
Status: DONE

Goal: Add a Settings field for a Discord webhook URL (persisted in `config.json`) and a "Send to Discord" action that posts the current file's content to it.
Why it matters: User-requested integration. Currently the only outbound network call anywhere in the app is the analytics ping — this is new network-access territory requiring an explicit CSP allowance.
Scope: New config field `discordWebhookUrl` (`config.js` `DEFAULTS` + a `sanitizeConfig()` entry); a Settings UI field to enter/edit it (wherever user-editable preferences currently live — `src/ui/dialogs.js` or `toolbar.js`); a new action (menu item and/or a button on AUTO-010's toolbar once it exists) that POSTs the current document to the webhook via Discord's webhook API — send as a `.md` file attachment (multipart) rather than message content, to sidestep Discord's 2000-character content limit entirely. CSP `connect-src` needs the Discord webhook host added — human-approval-required path, approved in conversation 2026-08-01.
Expected files or areas: `src/core/config.js`, a new module (e.g. `src/integrations/discord.js`), `src/ui/dialogs.js` or `toolbar.js`, `index.html`, `src-tauri/tauri.conf.json` (CSP `connect-src`, scoped to exactly Discord's webhook host, not a wildcard).
Acceptance criteria: A valid webhook URL persists across restarts; "Send to Discord" successfully posts to a real test webhook; an invalid/missing URL shows a clear error, not a silent failure.
Validation: `npm run lint`, `npm run test` (config field + payload construction, network call mocked), manual end-to-end test against a real Discord webhook.
Risks or assumptions: A Discord webhook URL is a bearer secret (anyone holding it can post to that channel); storing it in plaintext `config.json` matches how this app already stores all preferences (no existing secret-storage mechanism) but is worth flagging explicitly rather than treating silently as a non-secret.
Notes: User confirmed 2026-08-01: in-app webhook URL in Settings, stored in `config.json`.

### AUTO-014 — "Send to Thread" integration
Priority: P2
Status: DONE

Goal: Add a "Send to Thread" action that posts the current file's content as a new note to the user's Thread instance, defaulting to `https://thread.fmrdigital.dev` (user-confirmed), with the URL editable in Settings the same way as AUTO-013's Discord field.
Why it matters: User-requested integration with their own app (Thread, `forgejo.familytechlab.com/frank/thread`). Confirmed by direct inspection of Thread's server source (`D:\laragon\www\thread\server\src`): `POST /api/notes` accepts multipart form data with a `raw_input` text field (per `createNoteBodySchema` in `validation.js`), is AI-processed server-side, and — per that repo's own code comment in `settings.js` ("there's no auth layer — see AUTO-051") — currently has no authentication, so this is a plain unauthenticated POST.
Scope: New config field `threadUrl` defaulting to `https://thread.fmrdigital.dev`, user-editable; a new action posting the current document as `raw_input` (multipart/form-data) to `{threadUrl}/api/notes`, reusing the send-to module structure from AUTO-013 where it makes sense; CSP `connect-src` needs `https://thread.fmrdigital.dev` added — human-approval-required path, approved in conversation 2026-08-01.
Expected files or areas: `src/core/config.js`, a send-to module (shared with or sibling to AUTO-013's), Settings UI, `index.html`, `src-tauri/tauri.conf.json` (CSP).
Acceptance criteria: Thread URL persists and is editable; "Send to Thread" successfully creates a visible note in the real Thread instance; an unreachable host or non-2xx response shows a clear error, not a silent failure.
Validation: `npm run lint`, `npm run test` (payload construction, mocked network), manual end-to-end test against `https://thread.fmrdigital.dev`.
Risks or assumptions: Thread has no auth layer today, so this feature doesn't change Thread's existing exposure — it's just a convenient client for what's already an open endpoint. If Thread's own AUTO-051 (adding auth) ships later, this integration will need a corresponding auth-header update — a cross-repo dependency to remember, not something to solve now. Only `POST /api/notes` is in scope; Thread's other endpoints (transcribe, ask, mind-mirror, push) are unrelated to sending a markdown file.
Notes: Thread's API surface reviewed 2026-08-01 directly from its server source.

### AUTO-015 — Tabs Phase 1: multi-document state model and tab bar UI shell
Priority: P1
Status: DONE

Goal: Replace the single-document global state (`src/core/state.js`'s `currentFilePath`/`isDirty`/`lineEnding`) with an in-memory list of open-document records (path, CodeMirror `EditorState`, dirty flag, line ending), capped at 4-6 concurrent tabs, plus a tab bar UI row below the existing `#header-bar` with active-tab indication, close (×) buttons, and a "+" new-tab action.
Why it matters: Foundational piece every later tabs task depends on. See `.ai/DECISIONS.md` "Tabs feature scope" (2026-08-01): 4-6 tabs is the realistic cap (no overflow-scroll UI needed), tabs sit at the top below the menu bar (conventional editor pattern, reuses the existing `#header-bar` layout).
Scope: New module (e.g. `src/core/tabs.js`) owning the tab list and active-tab index; refactor `src/editor/editor.js` to hold one `EditorState` per open tab with a single `EditorView` swapping state via `view.setState()` (CodeMirror's own idiom — NOT multiple `EditorView`/DOM instances) while keeping the existing `Compartment`-based reconfiguration (line numbers/wrapping/tab size) working per-tab; new tab-bar markup/CSS; switching tabs updates title bar/status bar to the active tab. Do NOT wire file-io (open/save/close) or the Rust watcher yet — that's AUTO-016. A new tab in this phase starts as an in-memory "Untitled" document only.
Expected files or areas: New `src/core/tabs.js`, `src/editor/editor.js` (state-swap refactor), `src/core/state.js` (becomes per-tab, or is superseded by `tabs.js` — decide during implementation), `index.html`, a tabs stylesheet, `src/ui/status-bar.js` (reads the active tab).
Acceptance criteria: User can open up to 6 Untitled tabs, switch between them with content/cursor/scroll position preserved per tab, close a tab (last-tab-closed leaves one empty Untitled tab, per the 2026-08-01 decision — never closes the window); single-tab behavior is unaffected when only one tab is open; `npm run test` baseline (225 tests) still passes plus new tab-switching tests.
Validation: `npm run lint`, `npm run test`, manual test in `npm run dev` covering open/switch/close across 1-6 tabs and the last-tab-closed case.
Risks or assumptions: Highest-risk task in this roadmap — touches the exact state model AUTO-003 (state contract test coverage, still TODO) exists to protect. Recommend AUTO-003 lands before or alongside this task so the refactor has test coverage on the *old* behavior to diff against.
Notes: User confirmed 2026-08-01: 4-6 tabs, top-below-menu-bar position, last-tab-close leaves an empty Untitled tab.

### AUTO-016 — Tabs Phase 2: per-tab file I/O with single active-file watcher
Priority: P1
Status: TODO

Goal: Wire `src/core/file-io.js`'s open/save/save-as/new operations to the active tab from AUTO-015 instead of a single global document, and keep the Rust file-watcher watching only the currently active tab's file — switching tabs re-points the watcher rather than scaling it to track every open tab.
Why it matters: Per `.ai/DECISIONS.md` "Tabs feature scope" (2026-08-01), the user explicitly called N-way Rust watcher scaling "overkill" — this keeps `src-tauri/src/lib.rs`'s existing single-watcher architecture (`Mutex<Option<RecommendedWatcher>>`) unchanged, at the cost of only detecting external changes to the focused tab's file.
Scope: Update `src/core/file-io.js` so `openFile`/`saveFile`/`saveFileAs`/`newFile` target the active tab; on tab switch, call the existing `watch_file`/`unwatch_file` IPC to re-point the watcher (or unwatch, if the newly active tab is unsaved); each tab's own dirty flag drives its own `confirmDiscardChanges()` on close; Recent Files opens a new tab rather than replacing the current one. No Rust changes expected.
Expected files or areas: `src/core/file-io.js`, `src/core/tabs.js` (from AUTO-015). No changes to `src-tauri/**` expected — explicitly out of scope per the 2026-08-01 decision.
Acceptance criteria: Opening a file (File→Open or Recent Files) creates/activates a tab without disturbing other open tabs; save affects only the active tab; closing a dirty tab prompts a close-confirmation scoped to that tab; switching tabs correctly moves the OS file watcher (verify via manual external-edit test); switching away from a tab preserves its unsaved edits.
Validation: `npm run lint`, `npm run test` (extending AUTO-003's file-io coverage to the per-tab case), manual test: open 3 files in 3 tabs, edit tab 2, switch to tab 1, externally edit tab 1's file on disk, switch back — confirm the reload-prompt fires for tab 1 only.
Risks or assumptions: Background-tab external edits are silently missed until the user switches to that tab — accepted per the user's "overkill" call; worth a one-line README/changelog mention when shipped.
Notes: Depends on AUTO-015 landing first.

### AUTO-017 — Tabs Phase 3: shortcuts, CLI-arg/single-instance integration, polish
Priority: P2
Status: TODO

Goal: Add tab-navigation keyboard shortcuts (cycle, close-active-tab, new-tab — checked against existing bindings in `src/core/keyboard.js` for collisions first), and route the CLI-arg / single-instance-forwarded-file handling (`open-file-from-args` in `main.js`, startup `get_initial_file`) through the tab model instead of replacing the current document.
Why it matters: Without this, launching the app via "Open with FeatherMD" or forwarding a file to an already-running instance would still clobber whatever tab is open, defeating the point of tabs.
Scope: `src/core/keyboard.js` (new shortcuts, checked for collisions), `src/main.js` (route `open-file-from-args` and the initial `get_initial_file` call through AUTO-015/016's tab model — reuse an already-open tab for the same path rather than opening a duplicate).
Expected files or areas: `src/core/keyboard.js`, `src/main.js`.
Acceptance criteria: New shortcuts work without shadowing existing bindings; launching with a file argument (or forwarding one via single-instance) opens that file in a new tab, or focuses an already-open tab for that same path, without disturbing other open tabs.
Validation: `npm run lint`, `npm run test`, manual test: launch with a CLI file argument while other tabs are open; test single-instance forwarding (second launch with a file argument while the app is already running).
Risks or assumptions: Depends on AUTO-015 and AUTO-016. Duplicate-path detection needs simple path normalization — flag rather than over-engineer if casing/symlink edge cases make it unreliable.
Notes: Final polish phase; can be reprioritized independently of AUTO-015/016's landing order since it's additive.

## Future Ideas

- Expand test coverage in `src/preview/**` (Mermaid/KaTeX edge cases) if gaps are found during AUTO-001. (Superseded by AUTO-005/AUTO-006 above.)
- Review `src/platform/**` for consistent error handling across Tauri API calls.

## Do Not Change Without Explicit Human Approval

- Remote and branch settings.
- Repository visibility and access controls.
- Production infrastructure and `.github/**` CI/release workflows.
- `package.json` dependencies, `src-tauri/Cargo.toml` dependencies, and lockfiles.
- `src-tauri/tauri.conf.json` (app identity, bundling, updater, permissions).
- Version bumps (`npm run version`) and anything under `artifacts/**`.
- Features that run external commands.
- Credential handling, telemetry, analytics, billing, or deployment behavior.
