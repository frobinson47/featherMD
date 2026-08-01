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

## Future Ideas

- Expand test coverage in `src/preview/**` (Mermaid/KaTeX edge cases) if gaps are found during AUTO-001.
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
