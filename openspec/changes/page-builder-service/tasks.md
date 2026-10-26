## 1. Pre-work and decisions

- [x] 1.1 Audit hosts: the audited host has 22 host resolvers (3 palette, 19 pdp/*, category/*) over host-shaped data; compatibility with existing demos dropped (recorded in design.md D5)
- [x] 1.2 Decide cache TTL (15s), render-key policy (origin allowlist + key), workflow gating (presentational, no roles); design.md updated
- [x] 1.3 Define the canonical resolved-data shapes and request context (draft in `docs/sdd/canonical-shapes.md`)
- [x] 1.4 Decide the theme token schema for section backgrounds (`docs/sdd/canonical-shapes.md` §4)
- [x] 1.5 Define the catalog JSON schema (`packages/page-builder/catalog.schema.json`) including resolver kinds, `inlineTextFields`, `fill`, and `theme`

## 2. Service scaffold

- [x] 2.1 Create `page-builder-service/` (TypeScript/Node, Fastify; at the repo root because Connect requires the app folder to match its `deployAs` name) with HTTP server, config loader, and structured logging
- [x] 2.2 Add `connect.yaml` service entry with standard/secured configuration (CT credentials, preview token, render key, origin allowlist, admin secret, cache TTL, allowed editor origins)
- [x] 2.3 Write the `/v1` OpenAPI document (render, catalog, canonical shapes; admin paths are added with their endpoints in group 8) and wire typed generation (`npm run generate:api`, drift-tested)
- [x] 2.4 Implement wire-version negotiation middleware and tests
- [x] 2.5 Implement the CT client and the 15s in-memory read cache with preview/draft bypass, plus tests
- [x] 2.6 Implement render-key and origin-allowlist authentication and tests

## 3. Render API (first slice)

- [x] 3.1 Port page store (published read, draft read, ref hydration, legacy fallbacks) from `packages/page-builder` into the service with tests
- [x] 3.2 Implement path→page resolution via the page directory, including route params for category/product
- [x] 3.3 Port the layout transform (12-col packing, localization, visibility) into the service with tests
- [x] 3.4 Implement CT-native resolvers returning canonical shapes (product, product-list, products-by-category, category, picks, pins) with parallel execution and per-element failure isolation
- [x] 3.5 Implement `GET /v1/render` returning the render tree, `editMode`, `preview`, `allowedOrigins`, `wireVersion`
- [x] 3.6 Implement preview-token validation, edit-implies-preview, and editor page-id override with tests
- [ ] 3.7 Deploy to a sandbox project (`us-store`) and measure p95 render latency against a real page (needs live credentials: see `docs/` runbook and `npm run latency`)

## 4. Shim (1.0 package)

- [x] 4.1 Restructure `packages/page-builder` into the shim: server entry (`<PageBuilder>`) and client entry (bridge); remove Node-only imports
- [x] 4.2 Implement the render fetch with wire-version header, render key, request context prop, timeout, fallback, and not-found handling
- [x] 4.3 Implement the grid with self-contained scoped CSS, custom properties, breakpoints, and device visibility; remove Tailwind class emission
- [x] 4.4 Implement theme-token section backgrounds from the catalog
- [x] 4.5 Implement unknown-type placeholder (dev) / nothing (prod) and edit-mode `data-pb-*` markers
- [x] 4.6 Adapt the visual-editing bridge to take origins and manifest from the render response and the component map
- [x] 4.7 Add shim tests (grid output, visibility, fallback on timeout/error, markers, bridge inertness)

## 5. Reference host (`examples/`)

- [x] 5.1 Create a minimal Next.js reference host in `examples/` using the shim, a component map, and a catalog JSON
- [ ] 5.2 Verify published pages render against `us-store` data end to end (verified against the fake service; the live check needs an API client)
- [ ] 5.3 Enable preview and visual editing on the reference host and verify the MC preview loop end to end (markers, token gating and real 404 verified against the fake; the MC preview loop needs a live MC)
- [x] 5.4 Document the integration (component map, mount, env, catalog push) in the example README

## 6. System pages (PDP/PLP)

- [x] 6.1 Implement route-context resolution (sku, category, search params, sort, pagination) in the service
- [x] 6.2 Implement PDP resolvers (product detail, price, variants, attributes, reviews stats, related) returning canonical slices, with per-render upstream dedupe
- [x] 6.3 Implement PLP resolvers (category, breadcrumb, facets, sort, pagination, subcategories) returning canonical slices
- [x] 6.4 Add PDP and PLP components to the reference host (verified against the fake service)
- [ ] 6.5 Verify the PDP and PLP system pages against `us-store`: Product Search activation, `stores` id, `categoriesSubTree`, facets and price sort (needs an API client)

## 7. Catalog ingest and CI

- [x] 7.1 Implement `POST /v1/catalog/validate`, `POST /v1/catalog` (draft, idempotent by `sourceHash`), `POST /v1/catalog/publish`, and `GET /v1/catalog`
- [x] 7.2 Port validation rules from the CLI (duplicates, kinds, dangling refs, groups, icons) plus resolver-kind checks, with tests
- [x] 7.3 Add admin-secret authentication for catalog endpoints
- [x] 7.4 Add the reference-host CI step: `scripts/catalog.mjs` (validate / push / publish), a sample pipeline in the example README, and a CI job validating the example catalog against the local service
- [x] 7.5 Convert `seed/` catalog data to the catalog JSON format (`seed/data/catalog.json`, pushed by `seed-catalog.js`); retire the direct catalog seed and download scripts

## 8. MC app migration (strangler)

- [x] 8.1 Implement MC JWT verification and actor recording in the admin API
- [x] 8.2 Add a service transport in `page-editor/src/service/` (Apollo link over the object gateway, MC forward-to request, per-hook-family feature flag); no generated client, since the gateway is object-level (design D7a)
- [x] 8.3 Implement the admin object gateway and migrate reads: catalogs, pages, components, data-source instances, sections, settings
- [x] 8.4 Migrate mutations: page save/publish, component writes, instances, reset (the component-before-tree ordering and optimistic-concurrency retry stay in the hooks, which are unchanged; the gateway returns 409 on a stale version; see design D7a)
- [x] 8.5 Migrate workflows and comments with actor recording (audit log) and parity (the whole MC suite passes through the service transport; gating stays presentational)
- [x] 8.6 Update `page-editor` test harness (MSW store) to mock the service API
- [ ] 8.7 Remove direct custom-object access and the `manage_key_value_documents` requirement from the MC app (every migrated family can run through the service; the GraphQL path is still the default until the service path is verified against a live MC, and the image-picker token still reads through the MC gateway)

## 9. Cleanup and docs

- [x] 9.1 Remove the CLI, `transform.ts`, `page-store.ts`, `route.ts`, `registry.ts`, `core/`, and `templates/` from the package
- [x] 9.2 Update README host-integration, `docs/sdd/definitions-contract.md`, and `preview-contract.md`
- [x] 9.3 Raise or maintain coverage floors for the service and shim units and update `.github/workflows/ci.yml` and AGENTS.md testing table
