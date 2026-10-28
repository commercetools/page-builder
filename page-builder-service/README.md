# page-builder-service

The per-project page-builder service, deployed on commercetools Connect. It turns the content authors
build in the Merchant Center page-builder into a render tree a storefront can draw, and it is the only
thing that talks to commercetools custom objects on the page-builder's behalf.

```
 storefront (Next.js)            Merchant Center app               host CI
   <PageBuilder/> shim              page-editor                  catalog script
        │  GET /v1/render               │  /proxy/forward-to           │  POST /v1/catalog
        │  render key + origin          │  MC-user JWT                 │  admin secret
        ▼                               ▼                              ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ page-builder-service  (/service)                                           │
 │  render · catalog ingest · MC object gateway · 15s CT-read cache           │
 └───────────────────────────────────────────────────────────────────────────┘
        │ client credentials
        ▼
 commercetools: custom objects (page-editor*, schemaVersion 3) · products · categories · stores
```

The API is described by [`openapi.yaml`](./openapi.yaml) (`/v1`). Types for the service and for the
storefront shim are generated from it (`npm run generate:api`; a test fails if they drift).

## Surfaces

| Surface | Caller | Auth |
|---|---|---|
| `GET /v1/render` | storefront shim (server side) | `X-PB-Render-Key` + origin allowlist (`X-PB-Origin`), `X-PB-Wire-Version` |
| `GET/POST /v1/catalog`, `POST /v1/catalog/{validate,publish}` | host CI | `Authorization: Bearer <PB_ADMIN_SECRET>` |
| `/v1/admin/objects/…` | Merchant Center app | MC-user JWT forwarded by the MC API Gateway |
| `GET /status` (alias `/healthz`) | Connect liveness | none |

Everything is mounted under `/service`, the application's Connect `endpoint`: Connect does not strip it from the URL, so the prefix is fixed rather than configurable.

### Render

`path` + request context (`locale`, `currency`, `country`, `store`) → page. The service matches the path
against the route templates in the preview settings (`home`, `category`, `pdp`, `content`), picks the most
specific published page, hydrates its components, resolves data sources and route-driven system components
into the [canonical shapes](../docs/sdd/canonical-shapes.md), and returns localised sections. A valid
`pb_preview` token selects drafts and bypasses the cache; `pb_edit=1` additionally enables edit mode.

### Catalog ingest

The host owns its component, data-source and section definitions as one JSON file
(`packages/page-builder/catalog.schema.json`). CI validates it on pull requests and pushes it after deploy:
`push` writes a draft idempotently (a content hash makes a repeat a no-op, history is capped at 50 versions),
`publish` makes it live. A catalog that fails validation is rejected in full and nothing is written.

### Merchant Center object gateway

The MC app holds no custom-object permission. It calls `/v1/admin/objects/{container}[/{key}]` (get, list with
a commercetools `where`, put with optimistic `version`, delete) through `/proxy/forward-to`. The service
verifies the gateway's RS256 JWT against its JWKS (issuer `PB_MC_ISSUER`, audience this service's own origin from `CONNECT_SERVICE_URL`, and the
project-key claim must be this service's project), then:

- only the four page-builder containers are reachable;
- the host catalog (`page-editor/components|data-sources|sections|theme`) is read-only here;
- every write is audit-logged with the acting user (`audit: true`, `actor.userId`). Team gating stays
  presentational in the MC app: the service records who acted, it does not enforce roles.

The MC app must forward with the `forward-url-origin` audience policy (it does).

## Configuration

On Connect nothing about commercetools access is configured by hand. `connect.yaml` declares
`inheritAs.apiClient.scopes`, so the platform generates an API client with exactly those scopes at install
time and injects `CTP_PROJECT_KEY`, `CTP_CLIENT_ID`, `CTP_CLIENT_SECRET`, `CTP_SCOPE`, `CTP_API_URL` and
`CTP_AUTH_URL`. The keys below are the `connect.yaml` configuration, one row per key.

| Key | Kind | Required | Default | Purpose |
|---|---|---|---|---|
| `PB_RENDER_ORIGINS` | standard | yes | | comma-separated storefront server origins allowed to call the render API |
| `PB_EDITOR_ORIGINS` | standard | yes | `https://mc.europe-west1.gcp.commercetools.com` | Merchant Center origins allowed to embed and drive the visual-editing bridge |
| `PB_MC_ISSUER` | standard | no | | Merchant Center API Gateway the admin JWTs come from (`gcp-eu`, `gcp-us`, `gcp-au`, `aws-eu`, `aws-us` or a URL); unset disables the admin API. The JWT audience is the origin of `CONNECT_SERVICE_URL`, the service's public URL, which Connect provides (set it yourself only for local development) |
| `PB_CACHE_TTL_SECONDS` | standard | no | `15` | commercetools read cache; `0` disables; preview and draft reads are never cached |
| `PB_FACET_ATTRIBUTES` | standard | no | | product attributes to offer as facets, in order; empty derives them from the product types |
| `PB_FACET_LIMIT` | standard | no | `8` | maximum derived facets when `PB_FACET_ATTRIBUTES` is empty |
| `LOG_LEVEL` | standard | no | `info` | `debug`, `info`, `warn`, `error` |
| `PB_RENDER_KEY` | secured | yes | | key the storefront shim presents on render calls |
| `PB_PREVIEW_TOKEN` | secured | no | | unlocks draft/preview and edit mode; unset disables previews |
| `PB_ADMIN_SECRET` | secured | yes | | bearer secret for catalog validate, push and publish from CI |

Production start-up fails fast, listing every problem, when a required value is missing. In local
development the render key and origin allowlist are optional. For a real project locally,
`cp .env.example .env`, fill in an API client, and run `npm run dev` (it loads `.env` when present); `.env` is git-ignored.

### Scopes

The API client needs, and `connect.yaml` requests, only:

| Scope | Why |
|---|---|
| `manage_key_value_documents` | the page, catalog and settings custom objects (read and write) |
| `view_products` | Product Search, product projections and product types |
| `view_categories` | the category tree |
| `view_stores` | resolving a store key to its id |

There is no `manage_project` and no write access to anything but custom objects.

### Fail-open or fail-closed

The service is not an API Extension, so it is never in the path of a commercetools write. Every call to
commercetools has a 10 s timeout and no retry; the caller decides whether to try again.

| Use case | If commercetools (or a dependency) is down | Why |
|---|---|---|
| Storefront render | **fail-closed to the shim, open to the shopper**: the service answers 5xx; reads inside the 15 s cache window still succeed | the shim has its own 2 s budget (`PB_TIMEOUT_MS`) and renders the host's `fallback` on any failure, so a down service degrades the page, not the site |
| Catalog push / publish | **fail-closed**: nothing is written unless validation and the write both succeed | a half-written catalog is worse than a stale one; a repeat is a no-op (content hash), so CI can simply retry |
| Merchant Center object gateway | **fail-closed**: 502 `upstream_error`; a stale-version write is a 409 the MC app retries | the editor must never believe a save succeeded when it did not |
| Authentication (render key, admin secret, MC JWT) | **fail-closed**: a JWKS that cannot be fetched means the request is denied | no credential check is ever skipped when it cannot complete |

### Operations

- **Lifecycle scripts:** none. The service registers no Extensions, Subscriptions, Types or Channels, so
  there is no `postDeploy`/`preUndeploy` and nothing to clean up on undeploy. Its custom objects are the
  customer's content and are intentionally left in place.
- **Poison messages and replay:** the service consumes no events or queues, so there is no dead-letter queue
  and nothing to replay. The one retryable write path is catalog ingest, and it is idempotent: re-run
  `POST /v1/catalog` (a no-op when the content hash is unchanged) and then `POST /v1/catalog/publish`.
- **Logs:** structured JSON; every line for a request carries its id (`X-Request-ID` from the caller, else
  generated, and echoed on the response). Admin writes log `audit: true` with `actor.userId`. Read them with
  `commercetools connect deployment logs --key <deployment> --application page-builder-service`.

## Develop

```sh
npm install
npm run dev:fake       # http://127.0.0.1:8080/service against an in-memory commercetools
npm test               # vitest
npm run test:coverage  # floors: 95 statements / 95 lines / 90 branches / 95 functions — raise, never lower
npm run typecheck && npm run lint:api
```

`dev:fake` seeds a small shop (categories, products, product types, a store `gap`) and content, with preview
token `dev-preview` and admin secret `dev-admin`. The fake validates the *shape* of the service's own
calls but is not commercetools: it does not prove a Product Search query is accepted by the real API.

## Verify against a real project

These need an API client and cannot run in CI:

1. Create an API client in the project with the scopes above and put it in `.env` (copy `.env.example`;
   git-ignored). Never paste it into a chat or commit it. Run `npm run dev`.
2. Product Search must be activated on the project (the legacy Product Projection Search is deprecated and
   not used). Check `stores` (the service resolves a store key to its id), `categoriesSubTree`, the facets
   and the price sort against real data.
3. Measure render latency on a **production-type** deployment (sandbox deployments scale to zero and cold
   start in ~15s, which is longer than the shim's 2s timeout):

   ```sh
   PB_SERVICE_URL=https://…/service PB_RENDER_KEY=… PB_ORIGIN=https://shop.example.com \
     npm run latency -- --path /en-us --store <store-key> --requests 100
   ```

   Compare p95 with `PB_TIMEOUT_MS` in the shim (default 2000ms).

## Layout

```
src/server.ts, app.ts, config.ts   assembly, dependency graph, configuration
src/auth.ts, mc-auth.ts            render-key/origin, admin secret, MC JWT
src/ct/                            commercetools client (ts-client + platform-sdk, timeout) and custom-object store
src/cache.ts                       15s single-flight read cache with bypass
src/domain/                        page store, transform, route matching, catalog read/write/validate
src/commerce/                      products (Product Search), categories, facets, canonical mappers
src/resolve/                       data-source resolvers and route-driven fills
src/routes/                        render, catalog, admin
src/testing/                       in-memory commercetools, fixtures, local dev server
```
