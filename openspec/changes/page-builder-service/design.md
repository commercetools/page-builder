## Context

`packages/page-builder` (0.9.0) bundles three jobs: (1) render runtime — CT custom-object reads, draft-ref hydration, transform/localize/grid-pack, data-source and per-block resolvers, a Tailwind-class React grid; (2) catalog authoring + CLI sync (`defineBlock`, `buildCatalog`, `page-builder sync/publish/pull`); (3) the visual-editing bridge. Hosts differ in architecture and each needs judgment-driven wiring (Tailwind `@source` + safelist, resolver closures, registry types, an agent-followed `AGENTS.md`).

The MC app (`page-editor/`) has ~17 connector hooks, all using `useMcQuery` through the MC GraphQL proxy, i.e. acting as the signed-in user with their own CT permissions. There is no BFF today ("installed on any MC project").

The exploration that produced this design settled these constraints: React/Next hosts only; host code = component map + one mount; per-project Connect deployment; CT-native resolvers only; same CT custom objects with the service as sole writer; MC user JWT forwarded via the MC proxy.

## Goals / Non-Goals

**Goals:**
- Host integration is a fixed, deterministic set: a component map, one `<PageBuilder>` mount, one catalog JSON pushed by CI. No CT knowledge, no Tailwind step, no resolver code.
- All page-bound logic (path→page, hydrate, transform, localize, resolve, preview gating) runs in the service.
- Component schemas remain host-owned (beside components), expressed as plain data.
- Resolved data uses a small, stable, service-defined contract so any host's components consume the same shapes.
- PDP/PLP (system route pages) can be composed in the builder, with their data resolved service-side.

**Non-Goals:**
- Non-React/non-JS storefront support (the render tree is JSON, so it is not blocked, but no shim is shipped).
- Non-CT-native data sources (CMS, search, custom APIs) or host-supplied resolver code.
- Host-side caching, static/build-time snapshots.
- Backward compatibility with earlier host integrations or a 0.x deprecation window.
- Changing the storage format, adding a service-owned database, or a multi-tenant hosted service.
- Server-side enforcement of workflow team-gating (stays presentational).
- Moving product/category pickers, org directory or image-picker token behind the service.

## Decisions

### D1. Per-project Connect service, REST `/v1` + OpenAPI
Deployed into each customer CT project as a Connect `service` app; CT credentials never leave the project. The app lives in a repo-root folder (`page-builder-service/`) whose name matches its `connect.yaml` `deployAs` name, as Connect requires. Connect does not strip the app `endpoint` from the URL, so the service mounts every route under a configurable base path (`PB_BASE_PATH`, `/service` when deployed): the public render URL is `{connect-url}/service/v1/render`. Connect's conventional `CTP_REGION`/`CTP_SCOPE` settings are accepted as aliases for the explicit auth/API URL and scope settings. REST over GraphQL: the shim and CI need a lean stable surface and the MC app's many reads map cleanly to resources. One OpenAPI spec generates typed clients for the shim and MC app. The API is split into a **render** surface (stable, public-ish, token-authenticated) and an **admin/catalog** surface (MC-JWT and CI-secret authenticated) so admin can evolve with the MC app without breaking storefronts.
*Alternatives:* hosted multi-tenant (credential custody, tenancy auth — rejected); GraphQL (heavier for shim/CI); one undivided API (couples storefront stability to MC-app churn).

### D2. Render tree is JSON; grid and CSS live in the shim
`GET /v1/render?path=…&locale=…&…searchParams` returns `{ sections, editMode, preview, allowedOrigins, manifestHints, wireVersion }`. Items are already localized and data-resolved. The service never emits HTML. The shim owns grid packing output (12-col), device visibility and section backgrounds.
*Alternative:* service-rendered HTML (kills React components in the host, rejected).

### D3. Page lookup via the page tree, in the service
The shim sends the URL path, not a page id. The service resolves the node from the page directory and passes route params (category key/slug, product key/id) to resolvers. This removes `pageId` derivation (`home`, `pdp`, `category-<id>`) from hosts. In preview, `pb_page_id` still overrides the route (existing behavior, now enforced server-side).

### D4. Self-contained CSS in the shim
The shim emits CSS Grid via a single scoped stylesheet and CSS custom properties; breakpoints via media/container queries; device visibility via data attributes. Section background and container width map through theme tokens declared in the catalog JSON (`theme`), not a host `sectionBg` prop. This deletes the Tailwind `@source`/safelist step.
*Alternative:* keep Tailwind classes plus a generated safelist (still host-toolchain dependent).

### D5. Resolvers: CT-native, canonical shapes, service-side
Catalog data-source entries and system types reference built-in resolver kinds (`commercetools/product`, `product-list`, `products-by-category`, `category`, product-by-sku, product-search with category/facets/sort/page, category-tree, attribute labels, recurrence policies, picks/pins, …). Resolved data uses **service-defined canonical shapes** (ProductCard, ProductDetail, SearchResult with facets, CategoryNode, Breadcrumb) defined in the OpenAPI document, localized and priced for the request context. The request context is a small mount prop (store key, currency, country) plus locale and route params; hosts do not supply resolver code. Per-block `resolve` closures are dropped; `inlineTextFields` becomes catalog metadata. Unknown resolver kinds are rejected at catalog validation.
*Why not raw CT JSON:* every host would re-implement mapping, defeating the small-integration goal.
*Evidence:* audit of an earlier host found 22 host resolvers (3 palette, 19 pdp/*, category/*) returning host-shaped `Product`/`FacetResult` data plus brand→storeKey and cache-deduped loaders; all backed only by CT. Their *intent* (not their code) defines the canonical contract.

### D5a. System route pages are first-class
Route-driven types (`pdp/*`, `category/*`, `content/related-products`) are ordinary entries in the component map, but the service resolves their data from the route context (sku, category slug, search params). Dedupe of repeated upstream calls within one render is the service's job (one fetch per request per key).

### D5b. Commercetools data access
- **Search:** the Product Search API (Product Projection Search is deprecated and cannot be activated on projects created after 31 August 2026). Search returns ids only; projections are fetched with the Query API (`GET /product-projections?where=id in (…)`) using `priceCurrency` + `priceCountry` (adds `scopedPrice`), `localeProjection` and `storeProjection`, then restored to search order. This avoids the deprecated `productProjectionParameters`.
- **Store scoping:** the `stores` search field takes a store **id**, so the service resolves the request's store key to an id (cached). A store key that does not resolve returns **no products** (fail closed) rather than searching every store.
- **Facets:** derived from the product types: every searchable `enum`/`lenum`/`text`/`boolean` attribute (including sets of those) is a candidate, capped by `PB_FACET_LIMIT` or selected with `PB_FACET_ATTRIBUTES`. Selections use `postFilter` so facet counts stay unfiltered (multi-select); URL params are `facet.<name>=a,b`.
- **Price sort:** `variants.prices.centAmount` with `mode` min/max and a sort `filter` on the request currency.
- **Categories:** the full list is loaded once per cache window and indexed in memory (tree, slug lookup, breadcrumb, subtree).
- **Scopes:** `manage_key_value_documents`, `view_products`, `view_categories`, `view_stores`.

### D5c. Path → page
The service matches the request path against the route templates the MC app already stores in preview `settings` (`routes`: home, category, pdp, content; `{locale}`, `{slug}`, `{sku}` and arbitrary `{var}` tokens, with the most specific template winning), then tries page ids in the editor's order: home → `homePageId`; content → `<slug>`; category → `<categoryId>` then `cat-root`; product → `pdp-<primaryCategoryId>`, `pdp-cat-root`, `pdp`. The first non-empty published page wins. With a valid preview token, `pb_page_id` pins the page and even bypasses path matching.

### D6. Catalog = host-owned JSON, pushed by CI
`page-builder.catalog.json` is authored by hand or generated by the host however it likes. CI POSTs it to `POST /v1/catalog` (admin-secret auth); the service validates (same rules as today's `validate`), writes draft idempotently (`sourceHash`), and `POST /v1/catalog/publish` promotes. The old TS helpers and CLI are removed.

### D7. Auth model
- **Render preview/edit:** the shim forwards the URL preview token; the service validates it against its own config and returns `preview`/`editMode` and `allowedOrigins`. The host holds no preview secret except what it forwards from the URL.
- **MC app:** calls go through MC's forward-to proxy carrying the user JWT; the service verifies it, records the acting user (authorship, workflow actor), and writes to CT with its own API client. Workflow team-gating remains a UI control (as today's spec); the service does no role or team enforcement.
- **MC app, as built:** the service verifies the MC API Gateway's RS256 exchange JWT (`jose`, issuer `PB_MC_ISSUER`, audience `PB_MC_AUDIENCE`, project-key claim must equal the service's project). The app forwards with the `forward-url-origin` audience policy so the audience is the service origin and does not depend on the Connect path prefix. Acting user = JWT `sub`, recorded in an audit log line on every write.
- **CI catalog push:** a static admin secret (Connect secured configuration) sent as a bearer token.
- The host-to-service render call is authenticated by an origin allowlist (the host's server origin) plus a render key from host env. The caller's origin is the browser `Origin` header when present; a server-side shim fetch has none, so it states its public origin in `X-PB-Origin`. The render key is the real credential; the origin allowlist is defence in depth, because a server can claim any `X-PB-Origin`. Both are required when `NODE_ENV=production` (startup fails with every missing value listed) and optional in local development, where an unset allowlist or key skips that check.

### D7a. MC admin API is an object gateway, not per-resource endpoints (deviation, as built)
The plan was resource endpoints (pages, components, instances, workflows, …) with the read-modify-write semantics (ref hydration, version history, publish snapshots, component-before-tree ordering, optimistic-concurrency retry) moved into the service. As built, the service exposes a thin, authenticated **custom-object gateway** (`/v1/admin/objects/{container}[/{key}]`: get, list with a commercetools `where`, put with `version`, delete), restricted to the four page-builder containers, with the host catalog read-only and every write audit-logged. Each MC hook keeps its own semantics and only its *transport* changes: an Apollo link answers the four custom-object GraphQL operations from the gateway, so the hooks' query documents, cache updates and retries are untouched, and a per-hook-family feature flag selects the transport. Why: it moves all custom-object access and permission behind the service with parity provable by running the whole existing MC test suite through the new transport (`yarn test:service`), which a ground-up port of ~7,000 lines of hook logic could not match without a live MC environment. What it does not do: the semantic logic stays client-side, so a second client would have to re-implement it, and the service cannot enforce cross-object invariants. Consolidating that logic into semantic endpoints is a follow-up that can proceed hook family by hook behind the same flags.

### D8. Storage layout unchanged; service is sole writer
Same containers and `schemaVersion` 3 (`content-storage`) so no data migration is needed for existing projects. The MC app stops touching these containers; MC users no longer need `manage_key_value_documents`. Because no legacy host must keep reading CT directly, the layout may later be changed behind the service API without a host-side migration.

### D9. Caching and failure
No host-side cache. The service keeps a short in-memory cache (15s default, configurable) for CT reads (catalog, page tree, published pages, resolver CT queries); preview/draft reads bypass it. The shim applies a short timeout and renders the host-provided `fallback` (or nothing) on error/timeout; there is no stale-on-error.

### D10. Wire versioning
The shim sends `X-PB-Wire-Version`; the service returns a clear 426-style error for incompatible versions. The render tree carries `wireVersion`. OpenAPI is the compatibility contract.

### D11. Shim packaging
A major version (1.0) of `@commercetools-labs/page-builder`: one entry exporting `<PageBuilder>` (server component) and the bridge (client). Old entry points (`.`, `./core`, `./react` registry helpers, CLI bin) are removed. No 0.x deprecation window or migration guide: compatibility with earlier host integrations is dropped.

### D12. Delivery order
1. Canonical data-shape contract + service render endpoint (published only) + shim + new minimal Next.js reference host in `examples/`, reading CT project `us-store`.
2. Preview/draft + bridge + token validation.
3. System pages (PDP/PLP) resolvers.
4. Catalog ingest/publish + CI step; delete CLI.
5. MC app strangler migration of page-builder-owned hooks (reads then mutations).

## Risks / Trade-offs

- **Service in every request path with no host cache** → mitigated by timeout + `fallback`, a short service-internal CT-read cache, and horizontal Connect scaling; monitor p95 render latency from the first slice.
- **Fan-out of N uncached resolver calls per page** → batch/parallelize in the service, cap per-page resolver count, and rely on the internal cache.
- **Canonical shape contract too narrow or too wide** → design it from that host's PDP/PLP needs, version it with the wire version, and keep extension points (`extra` bag) out until a real need appears.
- **MC permission model change** (user-scoped CT permissions → service client) → forward JWT, record the actor, keep workflow gating presentational; parity test against current approvals/comments behavior.
- **Bridge on self-contained shim** → keep protocol (`pb-visual-editing`, v1) unchanged; add compatibility tests against the MC app preview.
- **Connect service operational surface** (secrets, logs, scaling) → standard Connect lifecycle; `connect.yaml` gains a service entry.
- **Connect sandbox cold starts** (sandbox deployments scale to zero and take ~15s to boot; production keeps warm instances) → expect the shim timeout to trip on a cold sandbox; use `production` (or a preview with traffic) when measuring latency in task 3.7, and document it in the reference host README.

## Migration Plan

No existing host is migrated. Steps:
1. Ship the service alongside the existing MC app entry; MC app unchanged initially.
2. Ship the 1.0 shim and the `examples/` reference host (the integration test and the documentation).
3. Migrate MC hooks incrementally behind the service client (feature-flagged per hook); roll back by flag.
4. Remove the old runtime/CLI from the package once the shim lands.
Rollback: MC hooks flag back to the MC proxy; storage layout is unchanged so no data rollback is needed.

## Open Questions

Resolved in apply:
- Host audit (task 1.1): the audited host uses 22 host resolvers over host-shaped data. Compatibility dropped; drove D5/D5a.
- Cache TTL: 15s. Render key: origin allowlist (+ render key). Roles: none; workflow gating stays presentational.
- Product Search + projections instead of the deprecated Product Projection Search; stores resolved key → id; fail-closed store scoping (D5b).
- Path matching via the stored preview route templates (D5c).

Still open:
- Canonical shape details flagged in `docs/sdd/canonical-shapes.md` §5 (variant attribute typing, facet filter param naming).
- Whether the page tree needs a shorter TTL than catalogs.
- Whether to consolidate the MC hooks' read-modify-write logic into semantic service endpoints (D7a), and when to flip the MC app's default transport to the service.
- A latent `localize` heuristic was tightened during apply (three-letter keys such as `url`/`alt` are no longer locale keys; a settings record is never collapsed); no stored data is affected, but any authored locale key longer than two letters would now be left as a map.
- Verify against the live `us-store` project: Product Search must be activated (indexing), and the field names/`stores` id semantics assumed in D5b were taken from the documentation and a faithful fake, not exercised against commercetools.
