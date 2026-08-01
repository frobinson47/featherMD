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
