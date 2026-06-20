# AGENTS.md

This file applies to the entire repository.

## Project Overview

- This is a SvelteKit short-link application using Svelte 5, TypeScript, Vite, and `@sveltejs/adapter-node`.
- Package management is Yarn 4 with `nodeLinker: node-modules`; use `yarn`, not `npm`.
- Runtime requires Node.js 24 or newer.
- PostgreSQL is the primary database through Sequelize models in `src/lib/server/models`.
- Redis is optional and used for cache, pub/sub, and queue-related paths when configured.
- ClickHouse analytics is optional; PostgreSQL remains the fallback source where applicable.
- Built-in and user-facing extension points live under `src/plugins` and `src/user-plugins`.

## Important Paths

- `src/routes`: SvelteKit pages, layouts, endpoints, form actions, and API routes.
- `src/lib/components`: shared Svelte components.
- `src/lib/server`: server-only application logic, database access, settings, permissions, auth, redirects, analytics, queues, and guards.
- `src/lib/server/models`: Sequelize model definitions.
- `src/lib/server/migrations`: database migrations.
- `src/lib/i18n`: locale metadata and UI copy.
- `src/lib/config.ts`: central settings types and defaults.
- `src/plugins`: built-in plugin implementations and registries.
- `docs`: operator and API documentation.
- `scripts`: operational scripts such as ClickHouse backfill and cluster start.
- `static`: static assets served by SvelteKit.

## Development Rules

- Preserve existing SvelteKit patterns: `+page.server.ts` for server load/actions, `+server.ts` for endpoints, shared server logic in `src/lib/server`.
- Keep responsibilities split by domain. If a route, component, or server module starts handling unrelated concerns, extract a focused component/helper/module before expanding it further.
- Prefer thin route/layout files: routing files should compose domain modules and UI components, not accumulate cross-cutting behavior.
- Keep server-only imports out of client components unless they are only used from server modules.
- Do not bypass the plugin registries when changing plugin behavior; update the relevant registry or contract types.
- For plugin work, read `docs/plugin-development.md` first and keep plugin code within the documented contracts and file boundaries.
- Keep admin sections aligned with `src/lib/admin-sections.ts`, permission handling, and admin route logic.
- Keep user-visible strings in `src/lib/i18n/ui-text.ts` instead of hardcoding copy in components.
- For settings changes, update the type/defaults in `src/lib/config.ts`, normalization/persistence in `src/lib/server/settings.ts`, admin UI/actions, and docs where relevant.
- For database shape changes, prefer migrations in `src/lib/server/migrations`; do not rely on Sequelize `alter` for production behavior.
- Treat `src/lib/server/web-action-guard.ts` and the root layout/hook token injection as core form-security infrastructure. New forms should not need per-form CSRF or web action token wiring.

## Styling And Svelte

- Use existing shared components before adding one-off UI.
- Keep CSS scoped in Svelte components or existing files under `src/lib/styles`.
- CSS-only edits in `.svelte` files are style changes, not code changes, for the validation policy below.
- Avoid adding client-side code to root layout unless it is genuinely cross-cutting.

## Validation Policy

- Only run validation commands after file modifications when actual code in `*.ts` or `*.svelte` files changed.
- Do not run validation for documentation-only changes, config text-only changes, generated output changes, or CSS/style-only changes in `.svelte` files.
- If validation is required, run commands sequentially, never in parallel:

```bash
yarn lint
yarn check
```

- Run `yarn lint` first because it applies ESLint fixes and Prettier formatting. After it finishes, inspect any formatting/fix changes that matter, then run `yarn check`.
- Do not substitute targeted ESLint or parallel checks for the required sequence unless the user explicitly asks.
- Do not run `yarn build` by default. Use it only when the change affects build output, bundling, adapters, environment handling, or when the user asks.

## Operational Caution

- Do not start, stop, or restart the development server unless the user explicitly asks. The user may already have `yarn dev` running with automatic reloads.
- Do not modify `.env` values unless the user explicitly asks. Use `.env.example` and docs for example configuration changes.
- Do not commit unless the user explicitly asks.
- Before reverting or deleting changes, check whether they are user changes. Do not revert unrelated work.
