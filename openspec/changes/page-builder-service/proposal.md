## Why

Every storefront that renders page-builder content currently embeds a large npm runtime: CT custom-object reads, draft-ref hydration, the layout transform, data-source resolvers, a Tailwind-dependent grid, and the visual-editing bridge. Integrating it needs per-host judgment (Tailwind `@source`/safelist, resolver wiring, registry/catalog TS helpers, an agent-followed `AGENTS.md`), and component schemas are authored in host TypeScript and pushed through a CLI toolchain. Storefronts differ in architecture, so the host-side surface must be as small and deterministic as possible. Moving everything that is not inherently page-bound into a per-project service shrinks the host to a component map and one mount.

## What Changes

- Add a **page-builder service** (commercetools Connect, deployed per CT project) exposing a versioned REST API (`/v1`, OpenAPI-described):
  - **Render API**: maps a request path + locale to a page via the page tree, reads published (or draft under preview), hydrates draft refs, transforms, localizes, resolves data sources, and returns a render tree.
  - **Catalog ingest API**: accepts the host's catalog JSON (components, data sources, sections), validates, writes drafts, and publishes.
  - **Admin API**: pages, components, data-source instances, workflows, comments, preview settings, reset, used by the MC app.
- Resolvers become **service-side and CT-native only**; the service holds the CT credentials. Resolved data uses **service-defined canonical shapes** (product card, product detail, search result with facets, category node, breadcrumb) specified in the OpenAPI document and localized/priced for a small request context (store, currency, country). **System route pages** (PDP, PLP/category) are first-class: the service resolves their route-driven data. A 15s service-internal cache covers CT reads (bypassed for preview/draft). There is no host-side caching.
- Replace the host SDK with a **tiny shim** (`<PageBuilder components={map} fallback={…} />`, React/Next only): fetches the render tree with a short timeout, renders the grid with self-contained CSS (no Tailwind dependency), emits the `data-pb-*` markers, and ships the visual-editing bridge.
- Replace the TS authoring helpers + `page-builder sync/publish` CLI with a **host-owned catalog JSON file** that CI POSTs to the service.
- Preview/edit token validation and `allowedOrigins` move to the service.
- Move the MC app's **page-builder-owned data hooks** behind the service using the forwarded MC user JWT. Product/category pickers, org directory and image-picker token stay on the MC proxy.
- Storage keeps the same CT custom-object layout (`schemaVersion` 3), with the service as sole writer.
- Ship the shim as a **major version (1.0) of `@commercetools-labs/page-builder`**; the old runtime, CLI, transform, and page-store are removed.
- **Compatibility with earlier host integrations is explicitly dropped.** No 0.x deprecation window, no coexistence period; existing demos are not migrated as part of this change.
- **BREAKING**: block-level `resolve` closures, host-authored resolvers, and non-CT-native data sources are removed; `defineBlock`/`buildCatalog`/`buildRegistry`/`createPageBuilderSections`, the `page-builder` CLI, `PB_*`/`CTP_*` host env vars, and the Tailwind `@source`/safelist requirement are removed.
- Workflow team-gating stays presentational (as today); the service records the acting user from the JWT but does not enforce team membership or roles.
- First slice: published-only render path on a **new minimal Next.js reference host in this repo** (`examples/`), which doubles as integration test and documentation.

## Capabilities

### New Capabilities
- `page-builder-service`: the per-project Connect service — versioned REST API, render pipeline (path→page, hydrate, transform, localize, CT-native resolvers), catalog ingest/publish, admin API, MC-JWT and preview-token authentication, service-internal CT-read cache, version compatibility checks.
- `host-shim`: the 1.0 host package — `<PageBuilder>` mount, component-map contract, timeout/fallback behavior, self-contained grid CSS and visibility, `data-pb-*` markers, bridge delivery, wire-version header.
- `host-catalog-file`: the host-owned catalog JSON format (components, data sources with CT-native specs, sections, `inlineTextFields`, theme tokens) and its CI push/validate contract.

### Modified Capabilities
- `host-render-sdk`: render runtime requirements are replaced by the shim; transform/localize/grid-packing/unknown-type behavior move to the service or shim.
- `host-catalog-cli`: sync/publish/pull/validate move from a CLI against CT to catalog-file ingest against the service.
- `host-preview-gating`: token validation and allowed origins are enforced by the service; host no longer reads `PB_PREVIEW_TOKEN`.
- `content-storage`: the service becomes the sole writer/reader of the custom objects; the format is unchanged.
- `visual-editing`: the bridge is delivered by the shim and receives its allowed origins and manifest from the service.

## Impact

- **New code**: a Connect service app (TypeScript/Node) with an OpenAPI spec and generated typed clients; a new `connect.yaml` deployment entry (`service` application type).
- **`packages/page-builder`**: rewritten as the shim; `src/transform.ts`, `page-store.ts`, `route.ts`, `registry.ts`, `cli.ts`, `commands/`, `core/` move into the service or are deleted.
- **`page-editor/`** (MC app): ~14 page-builder-owned connector hooks migrate to the service client; user JWT forwarded through MC's forward-to proxy.
- **Hosts**: no existing host is migrated. An audit of an earlier host found 22 host resolvers over host-shaped data (22 = 3 palette + 19 PDP/PLP); this motivated the canonical-shape contract and first-class system pages. another starter does not use page-builder.
- **New code**: `examples/` minimal Next.js reference host.
- **Permissions**: MC users no longer need `manage_key_value_documents`; the service API client does.
- **Docs/specs**: `docs/sdd/definitions-contract.md` and `preview-contract.md`, README host-integration, `seed/` tooling, and `templates/` are updated or retired.
- **Risks**: service is a hard dependency of every storefront request (mitigated by timeout/fallback and a 15s internal CT-read cache); the canonical-shape contract must be designed and versioned carefully.
