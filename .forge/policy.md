# featherMD Policy

## Allowed paths

- src/**
- src-tauri/src/**
- src-tauri/capabilities/**
- tests/**
- scripts/**
- page/**
- README.md
- SECURITY.md
- .ai/**
- .forge/**
- .gitignore
- index.html
- vite.config.js
- vitest.config.js
- eslint.config.js

## Prohibited paths

- .env
- .env.*
- **/*secret*
- **/*token*
- **/*.pem
- **/*.key
- src-tauri/icons/**
- src-tauri/Cargo.lock
- package-lock.json
- artifacts/**

## Human approval required

- Adding network access or external service calls.
- Running external commands from product code.
- Changing repository visibility, licensing, or access controls.
- Adding telemetry, analytics, tracking, or personal-data collection.
- Editing `src-tauri/tauri.conf.json` or `src-tauri/Cargo.toml` (app identity, bundling, updater config, Tauri capabilities/permissions).
- Adding or upgrading dependencies in `package.json` or `src-tauri/Cargo.toml`.
- Running `npm run version` (bumps release version and touches Tauri config + `page/`).
- Editing `.github/**` (CI/release workflows).

## Validation expectations

- Run `npm run lint` for JS/CSS changes.
- Run `npm run test` (vitest) for changes under `src/**` or `tests/**`.
- Run `cargo check` (from `src-tauri/`) for changes under `src-tauri/src/**`.
- Record unavailable validation honestly in `.ai/AUTONOMOUS_STATE.md`.
