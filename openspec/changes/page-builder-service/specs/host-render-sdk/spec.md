## REMOVED Requirements

### Requirement: Authoring definitions in host code
**Reason**: Schemas are authored as a host-owned catalog JSON, not through SDK helpers.
**Migration**: Replace `defineBlock`/`buildCatalog` usage with `page-builder.catalog.json` (see `host-catalog-file`).

### Requirement: Registry coverage is checked at compile time
**Reason**: The host supplies a component map to `<PageBuilder>`; coverage drift is reported by the shim in development and by catalog validation.
**Migration**: Replace `buildRegistry` with the `components` map prop.

### Requirement: Route-driven types have an escape hatch
**Reason**: Route-driven types are ordinary entries in the component map; there is no separate palette-coverage check.
**Migration**: Move `systemComponents` entries into the `components` map.

### Requirement: Layout rows pack into a twelve-column grid
**Reason**: Packing moves to the service (see `page-builder-service`).
**Migration**: None for hosts; use the shim.

### Requirement: Localized values are collapsed for the render locale
**Reason**: Localization moves to the service.
**Migration**: None for hosts; pass the locale to `<PageBuilder>`.

### Requirement: Data source bindings are resolved at render time
**Reason**: Resolution is service-side and CT-native only.
**Migration**: Remove host resolvers; express fills as data-source bindings.

### Requirement: Reading a stored page
**Reason**: Storage access moves to the service.
**Migration**: Remove `createPageStore` usage.

### Requirement: Per-device visibility becomes render classes
**Reason**: Visibility is rendered by the shim with self-contained CSS (see `host-shim`).
**Migration**: Remove Tailwind safelist entries for visibility classes.

## MODIFIED Requirements

### Requirement: Entry points separate concerns
The package SHALL expose a server entry providing the `<PageBuilder>` mount and a client entry providing the visual-editing bridge. Neither entry SHALL import Node-only modules or commercetools clients.

#### Scenario: Bundling for an edge runtime
- **WHEN** a host imports the server or client entry
- **THEN** no Node-only module is pulled into the bundle

### Requirement: Unknown types degrade by environment
An element whose type has no entry in the component map MUST render a visible placeholder in development and nothing at all in production, so a mistake is loud while developing and invisible to shoppers.

#### Scenario: Unknown type in development
- **WHEN** a page contains a type absent from the component map and the host runs in development
- **THEN** a placeholder identifying the missing type is rendered

#### Scenario: Unknown type in production
- **WHEN** the same page renders in production
- **THEN** nothing is rendered in that element's place
