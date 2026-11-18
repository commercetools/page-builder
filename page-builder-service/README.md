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
| `/v1/admin/objects/…` | Merchant Center app | MC-user JWT forwarded by the MC API Gateway (local development: `PB_DEV_TOKEN`) |
| `GET/POST /v1/admin/media` | Merchant Center app | same MC-user JWT; `501` until `PB_MEDIA_BUCKET` is set |
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

### Media uploads

The editor's image and video fields upload to, and browse, a Google Cloud Storage bucket **through this service**:
`POST /v1/admin/media` (multipart, one `file` part) and `GET /v1/admin/media?type=image|video|file`. They sit behind the
same MC JWT as the object gateway, so there is no media credential, token or URL to set up in the editor, and no
business unit: one service serves one project, and its bucket prefix is its namespace. What a field stores is the plain
file URL (`https://storage.googleapis.com/<bucket>/<key>`), exactly as when it was a free-text box.

- A file is accepted only when its declared type is on the allowlist **and** its own first bytes agree, so a renamed
  file is refused (`415`). SVG and HTML are not supported at all; they are scriptable and the bucket is public.
- Objects are keyed `<PB_MEDIA_PATH_PREFIX>/<images|videos|files>/<reverse-timestamp>-<id>-<name>.<ext>`: the kind folder
  makes listing a plain prefix read (exact paging, newest first), and the id keeps same-name uploads apart.
- The size cap (`PB_MEDIA_MAX_BYTES`, at most 25 MiB) is enforced while the upload streams; the file is then held in
  memory to be checked and stored. It is not subject to the 5 MiB JSON body limit.
- Every upload is audit-logged (`audit: true`, `actor.userId`, key, size, type). A storage failure is a generic `502`; the
  log carries only the error's name or code, never its message, because SDK errors can quote credentials.
- Nothing is ever deleted through the API, so a page can never be left pointing at a file the editor removed.

**Set up the bucket** (once; adjust names and location):

```bash
BUCKET=my-page-builder-media
gcloud storage buckets create gs://$BUCKET --location=EU --uniform-bucket-level-access
# Pages read the files straight from storage.googleapis.com. This role also lets anyone list the
# object names, so use a bucket that holds nothing but page-builder media.
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=allUsers --role=roles/storage.objectViewer

gcloud iam service-accounts create page-builder-media
SA=page-builder-media@$(gcloud config get-value project).iam.gserviceaccount.com
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=serviceAccount:$SA --role=roles/storage.objectCreator
gcloud storage buckets add-iam-policy-binding gs://$BUCKET --member=serviceAccount:$SA --role=roles/storage.objectViewer
gcloud iam service-accounts keys create key.json --iam-account=$SA
base64 -i key.json | tr -d '\n'      # the value of PB_MEDIA_SERVICE_ACCOUNT_KEY_B64
```

**Check that the files are public.** The editor and the published pages load a file with no credentials, so after the
first upload an anonymous request for its URL must succeed:

```bash
curl -sI https://storage.googleapis.com/$BUCKET/<key of an uploaded file> | head -1    # HTTP/2 200
```

`403 AccessDenied` means the `allUsers` binding is not in effect. The service cannot fix that: it sets no per-object
ACL on purpose, because a uniform-access bucket refuses them, so whether a file is public is decided by the bucket alone.
Look at the output of the `allUsers` binding command above, which fails when either of these applies:

- **Public access prevention** is enforced on the bucket (a bucket made in the console may have it on). Clear it with
  `gcloud storage buckets update gs://$BUCKET --no-public-access-prevention`, then run the binding command again.
- **Your organisation forbids it**: the org policy `constraints/storage.publicAccessPrevention` enforces prevention on
  every bucket, and `constraints/iam.allowedPolicyMemberDomains` (domain-restricted sharing) refuses `allUsers`. Neither
  can be overridden per bucket. Ask an organisation administrator for an exception, or use a bucket in a project outside
  the restriction.

Set `PB_MEDIA_BUCKET` and `PB_MEDIA_SERVICE_ACCOUNT_KEY_B64` together (setting one is a start-up error). If your
organisation blocks service-account keys (`iam.disableServiceAccountKeyCreation`) this service cannot reach the bucket:
it has no Workload Identity path, because Connect does not run in your Google Cloud project.

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
| `PB_MEDIA_BUCKET` | standard | no | | Google Cloud Storage bucket for uploaded media; with `PB_MEDIA_SERVICE_ACCOUNT_KEY_B64`, or neither (uploads off, endpoints answer `501`) |
| `PB_MEDIA_PATH_PREFIX` | standard | no | `page-builder/media` | object key prefix inside the bucket |
| `PB_MEDIA_MAX_BYTES` | standard | no | `10485760` | largest accepted upload, 1024 to 26214400 |
| `PB_MEDIA_ALLOWED_TYPES` | standard | no | all supported | comma-separated subset of `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/avif`, `video/mp4`, `video/webm`, `application/pdf` |
| `PB_CACHE_TTL_SECONDS` | standard | no | `15` | commercetools read cache; `0` disables; preview and draft reads are never cached |
| `PB_FACET_ATTRIBUTES` | standard | no | | product attributes to offer as facets, in order; empty derives them from the product types |
| `PB_FACET_LIMIT` | standard | no | `8` | maximum derived facets when `PB_FACET_ATTRIBUTES` is empty |
| `LOG_LEVEL` | standard | no | `info` | `debug`, `info`, `warn`, `error` |
| `PB_RENDER_KEY` | secured | yes | | key the storefront shim presents on render calls |
| `PB_PREVIEW_TOKEN` | secured | no | | unlocks draft/preview and edit mode; unset disables previews |
| `PB_ADMIN_SECRET` | secured | yes | | bearer secret for catalog validate, push and publish from CI |
| `PB_DEV_TOKEN` | local only | no | | lets the Merchant Center app's dev server call the admin API directly, see [Local development with the Merchant Center app](#local-development-with-the-merchant-center-app). Not in `connect.yaml`; startup fails if it is set in production |
| `PB_MEDIA_SERVICE_ACCOUNT_KEY_B64` | secured | no | | service-account JSON key for `PB_MEDIA_BUCKET`, base64 on one line (Storage Object Creator + Viewer) |

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

That is what `connect.yaml` requests, not something the service assumes. The service asks commercetools for exactly
`CTP_SCOPE` (which Connect injects from those scopes) and, when it is unset, for no scope at all, so the token carries
whatever scopes the API client itself has. Locally, any API client that covers the table works as it is, including one
that only has `manage_project:<project-key>`. A `CTP_SCOPE` the client cannot grant fails with "Permissions exceeded".

### Fail-open or fail-closed

The service is not an API Extension, so it is never in the path of a commercetools write. Every call to
commercetools has a 10 s timeout and no retry; the caller decides whether to try again.

| Use case | If commercetools (or a dependency) is down | Why |
|---|---|---|
| Storefront render | **fail-closed to the shim, open to the shopper**: the service answers 5xx; reads inside the 15 s cache window still succeed | the shim has its own 2 s budget (`PB_TIMEOUT_MS`) and renders the host's `fallback` on any failure, so a down service degrades the page, not the site |
| Catalog push / publish | **fail-closed**: nothing is written unless validation and the write both succeed | a half-written catalog is worse than a stale one; a repeat is a no-op (content hash), so CI can simply retry |
| Merchant Center object gateway | **fail-closed**: 502 `upstream_error`; a stale-version write is a 409 the MC app retries | the editor must never believe a save succeeded when it did not |
| Media upload and browse | **fail-closed**: 502 `storage_unavailable`; nothing is reported stored unless the bucket confirmed it | the editor must never put a URL on a page that does not exist; a failed upload is simply retried |
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

## Local development with the Merchant Center app

In the Merchant Center the app reaches this service through the gateway's `/proxy/forward-to`. The gateway runs
in the cloud, so it cannot forward to a service on `localhost`. For local development only, the app's dev server
(`yarn start` in `page-editor`) can call the service directly with `fetch` instead:

1. Pick a token (any non-empty value; a random one such as `openssl rand -hex 16` is safer on a shared network) and start the service with it, and with the
   dev server's origin as an editor origin (`npm run dev:fake` already does both, with the token `dev-editor-token`):

   ```sh
   PB_DEV_TOKEN=<token> PB_EDITOR_ORIGINS=http://localhost:3001 npm run dev
   ```

2. In `page-editor/.env.local` (git-ignored) set `PAGE_BUILDER_SERVICE_URL=http://localhost:8080/service` and
   `PAGE_BUILDER_SERVICE_DEV_TOKEN=<the same token>`, then run `yarn start`.

With the token the service accepts `Authorization: Bearer <token>` on `/v1/admin/*` as the user `local-dev` of its
own project (audit logs say so), and answers CORS preflights for the `PB_EDITOR_ORIGINS` origins on that surface
only. A real Merchant Center JWT is still accepted beside it. The token is never read in production: the service
fails to start with `PB_DEV_TOKEN` set when `NODE_ENV=production` (`npm start`, the Connect image), it is not a
`connect.yaml` setting, and the editor only sends it from a development build.

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
src/routes/                        render, catalog, admin, media
src/media/                         upload rules (type allowlist + content sniffing, keys) and the Google Cloud Storage store
src/testing/                       in-memory commercetools, fixtures, local dev server
```
