# Autonomous Changelog

## 2026-08-01 — Bootstrap

- Task ID: Bootstrap
- Summary: Initialized Autonomous Forge metadata for featherMD.
- Validation completed: Scaffold only; no code changes.
- Commit hash: pending
- Follow-up notes: Add the first roadmap task.

## 2026-08-01 — AUTO-001

- Task ID: AUTO-001
- Summary: Established baseline validation on a fresh clone — ran `npm install`, `npm run lint`, `npm run test`.
- Validation completed: Lint clean (0 issues). Vitest: 9 files, 225 tests, all passed.
- Commit hash: none (read-only validation task, no source changes)
- Follow-up notes: Proposed AUTO-002 to look at jsdom `getClientRects` stderr noise in `tests/editor/editor.test.js` (cosmetic, non-blocking).

## 2026-08-01 — AUTO-002

- Task ID: AUTO-002
- Summary: Added a `Range.prototype.getClientRects`/`getBoundingClientRect` polyfill in new `tests/setup.js`, registered via `vitest.config.js` `setupFiles`, to stop CodeMirror's measure loop from throwing (and printing to stderr) against jsdom's missing layout API during editor tests.
- Validation completed: `npm run lint` clean. `npm run test` — same 9 files / 225 tests passing, stderr noise eliminated. `forge diff-check` confirmed policy compliance (after reverting incidental `package-lock.json` metadata churn from a local `npm install`).
- Commit hash: none (pending user review)
- Follow-up notes: No production code (`src/**`) touched — test environment only.

## 2026-08-01 — AUTO-009

- Task ID: AUTO-009
- Summary: Added centered "Forked and Modified by FMR Digital, LLC" text to the status bar footer (`#status-branding`), absolute-centered independent of the existing left/right status bar content, hidden below 720px window width to avoid overlap near the 600px minimum.
- Validation completed: `npm run lint` clean. `npm run test` — 225/225 passing, no regression. Visually verified centered/non-overlapping rendering via `npm run dev` in a browser at default window size.
- Commit hash: none (pending user review)
- Follow-up notes: Narrow-width hide behavior (<720px) verified by CSS reasoning, not a live screenshot — browser-automation tooling failed to reliably resize/screenshot in this session. Unrelated untracked file `docs/Frank_Plan_Answers.md` was observed in the working directory during this task but was not created or touched by it.

## 2026-08-01 — AUTO-005

- Task ID: AUTO-005
- Summary: Added `tests/preview/security-extra.test.js` (14 adversarial tests) covering the `<pb>` tag, math-tokenizer TeX-escaping injection resistance, a Mermaid init-config lock-in assertion, and DOMPurify's SVG/MathML exclusion — all previously untested. No vulnerability found; existing sanitization pipeline held against every case.
- Validation completed: `npm run lint` clean. `npm run test` — 239/239 passing (225 baseline + 14 new). `forge diff-check` confirmed policy compliance.
- Commit hash: none (pending user review)
- Follow-up notes: Discovered `tests/security.test.js` is static source-grepping only, not runtime sanitization testing — worth knowing for future security-related test work in this repo. No production code changed.

## 2026-08-01 — AUTO-003

- Task ID: AUTO-003
- Summary: Added `tests/core/file-io.test.js` (15 tests) covering the save/dirty/watcher state contract, most importantly the `isSaving` 500ms echo-suppression window (PERF-12) under fake timers, plus `confirmDiscardChanges`/`loadFileContent`/`newFile`/`saveFileAs` state transitions.
- Validation completed: `npm run lint` clean. `npm run test` — 254/254 passing (239 baseline + 15 new). `forge diff-check` confirmed policy compliance.
- Commit hash: none (pending user review)
- Follow-up notes: This was explicitly meant as the safety net before the tabs refactor (AUTO-015) touches this same state model — now in place. Browser-mode Blob-download paths in `openFile`/`saveFileAs` remain uncovered (jsdom lacks `URL.createObjectURL`), noted rather than worked around.

## 2026-08-01 — AUTO-010

- Task ID: AUTO-010
- Summary: Added a markdown formatting toolbar (bold/italic/strikethrough/code/link/image/heading/bullet-list/ordered-list/blockquote/table). New editor commands in `editor.js` (`wrapSelection`, `toggleLinePrefix`, `insertLink`, `insertImage`, `insertTable`, `setSelection`), new `src/ui/markdown-toolbar.js`, new toolbar row in `index.html` with hand-built Lucide-style icons, wired into `main.js`.
- Validation completed: `npm run lint` clean. `npm run test` — 286/286 passing (254 baseline + 32 new: 20 formatting-command tests + 12 wiring tests). `forge diff-check` confirmed policy compliance. Visual check via `npm run dev` confirmed correct rendering.
- Commit hash: none (pending user review)
- Follow-up notes: Live click-through verification in the browser was inconclusive — automation-tool synthetic events didn't appear to reach CodeMirror's editor (suspected tool/editor compatibility gap). Recommend a human manually click each toolbar button once before considering this fully verified end-to-end, even though the underlying logic and wiring are both under test.

## 2026-08-01 — AUTO-013

- Task ID: AUTO-013
- Summary: Added "Send to Discord" — a new Send menu, a Send To Settings modal (Discord webhook URL field), `src/integrations/discord.js` posting the current document as a `.md` file attachment via Discord's webhook multipart API, and a CSP `connect-src` allowance for `discord.com`/`discordapp.com`.
- Validation completed: `npm run lint` clean. `npm run test` — 303/303 passing (17 new tests across 3 new files, plus a genuine update to `tests/html.test.js`'s menu-count assertions for the new Send menu). `forge diff-check` flagged `tauri.conf.json` as expected (the approved CSP change) alongside the pre-existing untouched `docs/` file.
- Commit hash: none (pending user review)
- Follow-up notes: No end-to-end test against a real Discord webhook or a packaged Tauri build was performed — `fetch` is mocked in tests. Worth a real send-to-Discord smoke test once a build exists.

## 2026-08-01 — AUTO-014

- Task ID: AUTO-014
- Summary: Added "Send to Thread" — extended the Send menu and Send To Settings modal from AUTO-013 with a Thread URL field (default `https://thread.fmrdigital.dev`), and `src/integrations/thread.js` posting the document as `raw_input` multipart form data to `{threadUrl}/api/notes`, matching Thread's actual server-side validation schema. CSP `connect-src` further widened for the Thread host.
- Validation completed: `npm run lint` clean. `npm run test` — 313/313 passing (10 new tests). `forge diff-check` flagged `tauri.conf.json` as expected (the approved CSP change) alongside the pre-existing untouched `docs/` file.
- Commit hash: none (pending user review)
- Follow-up notes: Thread currently has no authentication layer (confirmed against its own source) — this integration doesn't change that exposure, just gives featherMD a client for it. If Thread adds auth later, this integration needs a corresponding update (cross-repo dependency, not actionable here). No end-to-end test against the real Thread instance was performed.

## 2026-08-02 — AUTO-015

- Task ID: AUTO-015
- Summary: Tabs Phase 1 — multi-document state model (`src/core/tabs.js`, capped at 6) and tab bar UI (`src/ui/tab-bar.js`, new `#tab-bar` row). Refactored `editor.js` to build a fresh `EditorState` per tab and swap the single `EditorView` between them via `view.setState()`. File I/O and the discard-guard remain deferred to AUTO-016 by design; today's tabs are in-memory only.
- Validation completed: `npm run lint` clean. `npm run test` — 348/348 passing (35 new). `forge diff-check` clean apart from the pre-existing untouched `docs/` file. Live-verified in the running app via direct `element.click()` JS execution (the browser-automation tool's synthetic clicks were unreliable in this environment and are noted as a tooling limitation, not an app defect) — new tab, switch-with-content-restoration, close-background-tab, and close-last-tab-falls-back-to-fresh-Untitled all confirmed working end to end.
- Commit hash: none (pending user review)
- Follow-up notes: `state.js`'s global `currentFilePath`/`isDirty`/`lineEnding` are not yet per-tab — opening a real file lands on whichever tab is focused without updating that tab's pill/title. Documented, intentional Phase-1 gap; AUTO-016 closes it.
