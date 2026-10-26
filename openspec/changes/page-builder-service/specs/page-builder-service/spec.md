## ADDED Requirements

### Requirement: Per-project service with a versioned REST API
The page-builder service SHALL be deployed per commercetools project as a Connect service and SHALL expose a versioned REST API (`/v1`) described by an OpenAPI document, split into a render surface and an admin/catalog surface.

#### Scenario: Calling an unversioned path
- **WHEN** a client calls a path without the `/v1` prefix
- **THEN** the service responds with 404

#### Scenario: Typed clients
- **WHEN** the OpenAPI document changes
- **THEN** the typed clients used by the shim and the MC app are regenerated from it

### Requirement: Path matching uses the project's route templates
The service SHALL match the request path against the route templates stored in the project's preview settings, preferring the most specific template, and SHALL try page ids in the editor's order: the configured home page, the content slug, the category page then the shared all-categories page, and the category PDP override then the global PDP templates.

#### Scenario: Category without a dedicated page
- **WHEN** a category path matches and no page exists for that category
- **THEN** the shared all-categories page is rendered

#### Scenario: Empty pages never win
- **WHEN** a candidate page exists but has no content
- **THEN** the next candidate is tried

### Requirement: Render by request path
The render endpoint SHALL accept a URL path, a locale and the request's search parameters, resolve the page from the page directory, and return a render tree whose items are localized and data-resolved.

#### Scenario: Path matches a page node
- **WHEN** the render endpoint receives a path that maps to a published page node
- **THEN** it returns that page's sections with localized settings and resolved data sources

#### Scenario: No page for the path
- **WHEN** the path maps to no renderable page
- **THEN** it returns a not-found result so the host can render its own markup

#### Scenario: Route parameters reach resolvers
- **WHEN** the path identifies a category or product
- **THEN** that identity is supplied to the data-source resolvers as route context

### Requirement: Published by default, drafts only under a valid preview token
The render endpoint SHALL serve the published snapshot unless the request carries a preview token equal to the service's configured token, in which case it SHALL serve the draft head with component references hydrated.

#### Scenario: No token
- **WHEN** a render request has no preview token
- **THEN** the published snapshot is served

#### Scenario: Wrong token
- **WHEN** the preview token does not match the service's configuration
- **THEN** the request is treated as non-preview and published content is served

#### Scenario: No token configured
- **WHEN** the service has no preview token configured
- **THEN** no request qualifies as a preview

### Requirement: Editor page identity wins in preview
In a valid preview, the service SHALL honor an explicit page id supplied by the editor over the page derived from the path.

#### Scenario: Editor requests a specific page
- **WHEN** a valid preview request includes the editor's page id
- **THEN** that page is rendered even if the path would resolve to a different one

### Requirement: Edit mode implies a valid preview
The service SHALL report edit mode only for requests that are also valid previews.

#### Scenario: Edit flag without token
- **WHEN** a request carries the edit flag but no valid preview token
- **THEN** the response reports editMode as false

### Requirement: CT-native service-side data resolution
The service SHALL resolve data-source bindings and settings of kind product, category, picks and pins using commercetools APIs with its own API client, and SHALL NOT invoke host-supplied code.

#### Scenario: Bound data source
- **WHEN** an element binds a saved data-source instance of a built-in type
- **THEN** the service resolves it and merges the result into that element's settings

#### Scenario: Resolver failure
- **WHEN** one element's resolution fails
- **THEN** the page still renders, with that element's resolved data omitted

### Requirement: Canonical resolved-data shapes
Resolved commercetools data SHALL use service-defined canonical shapes (product card, product detail, search result with facets, category node, breadcrumb) specified in the OpenAPI document, localized and priced for the request context of store, currency and country.

#### Scenario: Product list
- **WHEN** a product-list data source resolves
- **THEN** each item has the canonical product-card shape with localized name and the price for the request's currency and country

#### Scenario: Shape change
- **WHEN** a canonical shape changes incompatibly
- **THEN** the wire version is incremented

### Requirement: Store scoping fails closed
When a render request names a store, the service SHALL return only products available in that store and SHALL return no products when the store key does not resolve.

#### Scenario: Known store
- **WHEN** a request names a store that exists
- **THEN** only products available in that store are returned

#### Scenario: Unknown store
- **WHEN** a request names a store key that does not exist
- **THEN** product data sources resolve to empty results rather than searching every store

### Requirement: System route pages resolve from route context
The service SHALL resolve data for route-driven component types (product detail, category/listing) from the route context, including sku, category identity, search parameters, sort and pagination, and SHALL fetch each distinct upstream query at most once per render.

#### Scenario: Product detail page
- **WHEN** a path identifies a product by sku and the page contains several product-detail components
- **THEN** the product is fetched once and each component receives its canonical slice

#### Scenario: Category listing with facets
- **WHEN** a category path carries facet, sort and page parameters
- **THEN** the search result reflects those parameters and includes facet definitions and counts

### Requirement: Render key and origin allowlist
Render calls SHALL present a render key and come from an origin on the service's allowlist. Both settings MUST be configured in production and MAY be left unset in local development, where an unset setting skips that check.

#### Scenario: Unknown origin
- **WHEN** a render call comes from an origin not on the allowlist
- **THEN** it is rejected with 403

#### Scenario: Server-side caller
- **WHEN** a server-side render call carries no browser `Origin` but states its public origin in `X-PB-Origin`
- **THEN** that origin is checked against the allowlist

#### Scenario: Wrong render key
- **WHEN** a render call presents a missing or incorrect render key
- **THEN** it is rejected with 401 before the origin is checked

#### Scenario: Production without a render key
- **WHEN** the service starts with `NODE_ENV=production` and no render key or allowlist configured
- **THEN** startup fails and lists every missing setting

#### Scenario: Local development
- **WHEN** the service runs outside production with no render key or allowlist configured
- **THEN** render calls are accepted without those checks

### Requirement: Locale collapsing and layout transform
The service SHALL collapse locale-keyed values to the requested locale falling back to the default locale, and SHALL map element widths to twelve-column counts, packing elements into rows that do not exceed twelve columns.

#### Scenario: Missing locale value
- **WHEN** a localized value has no entry for the requested locale
- **THEN** the default locale's value is returned

#### Scenario: Unrecognized width
- **WHEN** an element declares an unknown width
- **THEN** it is treated as full width

### Requirement: Catalog ingest, validation and publish
The service SHALL accept a catalog JSON (components, data sources, sections), validate it, write it as a draft idempotently, and promote the draft head to published on an explicit publish call.

#### Scenario: Invalid catalog
- **WHEN** the posted catalog fails validation
- **THEN** nothing is written and the response lists every violation

#### Scenario: Unchanged catalog
- **WHEN** the posted catalog's source hash equals the stored draft head
- **THEN** the call is a no-op

#### Scenario: Publish
- **WHEN** publish is called
- **THEN** the draft head becomes the published catalog

### Requirement: Admin API authenticated by the forwarded MC user JWT
The admin API (an object gateway over the page-builder custom objects) SHALL require a valid exchange JWT forwarded by the Merchant Center API Gateway (RS256, verified against the gateway's JWKS, with the configured issuer and the service origin as audience) whose project-key claim names the service's own project. It SHALL record the authenticated user (`sub`) as the actor of every write in an audit log. The service SHALL NOT enforce workflow team membership or roles; gating remains a user-interface control.

#### Scenario: Missing or invalid JWT
- **WHEN** an admin request lacks a valid JWT (absent, malformed, unsigned or signed by another key, wrong issuer or audience, expired, no subject)
- **THEN** it is rejected with 401

#### Scenario: Token for another project
- **WHEN** a validly signed token carries a project-key claim other than the service's project
- **THEN** it is rejected with 401

#### Scenario: Authorship
- **WHEN** an authenticated user writes or deletes an object
- **THEN** the audit log names that user as the actor, with the container, key and resulting version

#### Scenario: Gating is not enforced server-side
- **WHEN** an authenticated user who is not in the current workflow step's team writes the workflow object
- **THEN** the service accepts it and records the actor, leaving gating to the UI

#### Scenario: Only the page-builder containers are reachable
- **WHEN** an admin request names a container other than `page-editor`, `page-editor-draft`, `page-editor-published` or `page-editor-components`
- **THEN** it is rejected with 403

#### Scenario: The host catalog is read-only through the admin API
- **WHEN** an admin request writes or deletes `page-editor/components`, `data-sources`, `sections` or `theme`
- **THEN** it is rejected with 403 and the object is unchanged; reads succeed

#### Scenario: Optimistic concurrency
- **WHEN** a write or delete carries a `version` that differs from the stored object's
- **THEN** it is rejected with 409 and the caller re-reads and retries

#### Scenario: Not configured
- **WHEN** the service has no MC issuer and audience configured
- **THEN** every admin route answers 503 and the MC app keeps using the Merchant Center gateway

### Requirement: Catalog push authenticated by a secret
The catalog ingest and publish endpoints SHALL require a configured admin secret presented as a bearer token.

#### Scenario: Bad secret
- **WHEN** a catalog push presents a wrong or missing secret
- **THEN** it is rejected with 401 and nothing is written

### Requirement: Short service-internal cache for CT reads
The service SHALL cache commercetools reads for a configurable short TTL defaulting to 15 seconds and SHALL bypass the cache for preview and draft reads.

#### Scenario: Repeated published read
- **WHEN** the same published page is requested twice within the TTL
- **THEN** the second request does not re-read it from commercetools

#### Scenario: Preview read
- **WHEN** a valid preview request is served
- **THEN** draft data is read fresh from commercetools

### Requirement: Wire version compatibility
The service SHALL require the client's wire version header on render calls and SHALL reject incompatible versions with an explicit error naming the supported versions.

#### Scenario: Incompatible shim
- **WHEN** a shim sends an unsupported wire version
- **THEN** the service responds with an error listing supported versions
