# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Runs DuckDB + DuckLake on Cloudflare Containers. A thin Cloudflare Worker proxies HTTP requests to a Durable Object–backed Container that runs a Hono API with an embedded DuckDB. DuckDB can optionally attach a remote DuckLake (Postgres catalog + R2 storage) and/or a R2 Data Catalog (Iceberg) based on which secrets are set.

## Architecture

The codebase has two independent TypeScript entry points that share one repo but compile and deploy separately:

- **Worker** — `src/index.ts`, compiled via the root `tsconfig.json`, deployed via `wrangler`. Defines the `Container` class (extends `@cloudflare/containers` `Container`) which acts as a Durable Object. Its `fetch` handler forwards every request to a single named container instance (`idFromName('cloudflare-ducklake')`). The Worker's only real responsibility is selecting which Workers secrets to forward into the container's `envVars` — it groups them into three optional sets (`API_TOKEN`; R2 Data Catalog `R2_TOKEN/R2_ENDPOINT/R2_CATALOG`; DuckLake `R2_*` + `POSTGRES_*`) and only passes a group through if all of its variables are present.
- **Container API** — `container/index.ts`, compiled via `container/tsconfig.json`, runs inside the Docker image as `node /app/dist/src/index.js`. It is a Hono server (port `3000`) with these routes: `GET /`, `GET /schema`, `POST /query`. Auth middleware is wired conditionally: `bearerAuth(API_TOKEN)` on `/query` and `/schema` if `API_TOKEN` is set, plus `basicAuth(USERNAME, PASSWORD)` on `/query` if both are set.

### DuckDB lifecycle (`container/lib/dbUtils.ts`)

DuckDB is wrapped via `@duckdb/node-api` (the async "Neo" Node API). The in-memory `DuckDBInstance` and `DuckDBConnection` are module-level `let` bindings that stay `undefined` until the first request. `initialize()` is called lazily on the first `/query` or `/schema` request (guarded by a module-level `isInitialized` flag), creates the instance and connection via `await DuckDBInstance.create(':memory:')` / `await instance.connect()`, and then runs all setup queries through the internal `query()` helper with `filteringEnabled = false`:

1. `SET home_directory='/home/node'`
2. `LOAD` each extension from `/app/extensions/*.duckdb_extension` (httpfs, avro, iceberg, ducklake, nanoarrow, spatial, postgres_scanner) — extensions are baked into the image, not downloaded at runtime.
3. If `R2_TOKEN`/`R2_ENDPOINT`/`R2_CATALOG` are all set: `CREATE OR REPLACE SECRET r2_catalog_secret (TYPE ICEBERG, ...)` and `ATTACH '<catalog>' AS r2lake (TYPE ICEBERG, ...)`.
4. If all `R2_*` + `POSTGRES_*` vars are set: `CREATE OR REPLACE SECRET r2 (TYPE R2, ...)` and `ATTACH 'ducklake:postgres:...' AS ducklake (DATA_PATH 'r2://<bucket>/data', OVERRIDE_DATA_PATH true)`.
5. `SET unsafe_enable_version_guessing=true` (Iceberg version guessing).

Because the three feature sets are controlled purely by env var presence, a container that only has `API_TOKEN` set runs a plain DuckDB; adding R2 Catalog secrets enables Iceberg reads; adding Postgres+R2 secrets enables DuckLake. Both can be enabled simultaneously.

### Query filtering (`container/lib/queryFilter.ts`)

All queries issued through `query()` pass through `filterQuery()` by default. User queries are rejected (replaced with an error-returning `SELECT`) if they contain `INSTALL`, `LOAD`, `SET`, `PRAGMA`, `SECRET`, or any `duckdb_*()` function other than `duckdb_databases/schemas/tables/views`. Internal initialization and metadata queries pass `filteringEnabled = false` to bypass this. When touching init/metadata code, preserve the `false` flag — enabling filtering there will break startup and the `/schema` endpoint.

`query()` returns `Record<string, Json>[]` via `reader.getRowObjectsJson()`, where `Json` is the JSON-safe value type exported by `@duckdb/node-api`. This means BigInt/decimal columns serialize as strings, not numbers — any downstream metadata helpers that need concrete field types should cast through `as unknown as <typed row>[]` at the `query()` call site (see `getMetadata()` in `dbUtils.ts`).

### Extensions pipeline

`scripts/download_extensions.sh` pulls pinned-version DuckDB extensions (currently `v1.5.1`, `linux_amd64`) into `./extensions/`. The Dockerfile copies `extensions/` into the builder stage and the final stage copies them to `/app/extensions`, which is what `initialize()` in `dbUtils.ts` `LOAD`s from. Both `build:docker` and `deploy` in `package.json` delete and re-run the downloader first, so the extension set is defined by that script — updating a DuckDB version means editing `download_extensions.sh` **and** bumping `@duckdb/node-api` in `package.json` to the matching release in lock-step. Mismatched versions cause `LOAD` to fail at startup.

## Common commands

```bash
# Lint / format (biome, scoped to src/ and container/)
npm run lint
npm run lint:fix

# Typecheck the Worker (tsc with noEmit against the root tsconfig)
npm run build

# Regenerate worker-configuration.d.ts from wrangler.jsonc bindings
npm run cf-typegen

# Build the container image locally (re-downloads extensions first)
npm run build:docker

# Run the container locally on :3000 using ./.dev.vars for secrets
npm run dev:docker

# Deploy Worker + container to Cloudflare (re-downloads extensions first)
npm run deploy
```

Note: `npm run dev` / `npm start` invoke `wrangler dev`, but `wrangler dev` does not currently work for this project because of the Containers beta — use `npm run dev:docker` for local iteration on the container API and test directly against `http://localhost:3000`.

## Secrets & environment

The container only sees variables the Worker forwards via `envVars`, and only if an entire feature group's vars are present (see `src/index.ts` — partial groups are silently dropped). For local Docker runs, the same variables must be present in `.dev.vars` (loaded via `--env-file` in `dev:docker`). The `scripts/setup_*.sh` helpers create/register R2 buckets, Workers secrets, and the Neon/Postgres catalog connection for DuckLake — see `README.md` for the step-by-step setup flow.

## Conventions

- Biome is the only linter/formatter. Config: `biome.json` — single quotes, 2-space indent, 120-char lines. `worker-configuration.d.ts` is ignored. Do not hand-edit that file; regenerate it with `npm run cf-typegen`.
- The root `tsconfig.json` is for the Worker only; the container has its own `container/tsconfig.json` used by the Docker build. Keep Worker code out of `container/` and vice versa.
- The Worker intentionally contains almost no logic. New API surface belongs in `container/index.ts` and `container/lib/*`, not in `src/`.
