## ADDED Requirements

### Requirement: One mount, one component map
The shim SHALL provide a `<PageBuilder>` component that takes a map from component type to React component and an optional fallback, and that is the only page-builder code a route mounts.

#### Scenario: Route mounts the shim
- **WHEN** a host route renders `<PageBuilder components={map} />`
- **THEN** the shim fetches the render tree for the current request and renders it

#### Scenario: Unknown type in development
- **WHEN** the tree contains a type absent from the map and the host runs in development
- **THEN** a visible placeholder naming the type is rendered

#### Scenario: Unknown type in production
- **WHEN** the same tree renders in production
- **THEN** nothing is rendered in its place

### Requirement: Host holds no CT knowledge
The shim SHALL NOT read commercetools, transform pages, resolve data, or require commercetools credentials; its configuration is the service URL, an optional render key, and the preview token forwarded from the request.

#### Scenario: Minimal configuration
- **WHEN** a host sets only the service URL
- **THEN** published pages render with no other page-builder configuration

### Requirement: Bounded latency with fallback
The shim SHALL apply a short timeout to the render call and, on timeout, error, or not-found, SHALL render the supplied fallback or nothing, without serving stale content.

#### Scenario: Service timeout
- **WHEN** the render call exceeds the timeout
- **THEN** the fallback is rendered and the request does not fail

#### Scenario: Not found
- **WHEN** the service reports no page for the path
- **THEN** the fallback is rendered

### Requirement: Self-contained grid styling
The shim SHALL style the grid, per-device visibility, and section backgrounds without requiring the host's Tailwind configuration, using scoped CSS and custom properties, with section backgrounds taken from theme tokens in the catalog.

#### Scenario: Host without Tailwind sources
- **WHEN** the host has no Tailwind `@source` or safelist entry for the package
- **THEN** columns, breakpoints and visibility still render correctly

#### Scenario: Device visibility
- **WHEN** an element is hidden on mobile
- **THEN** it is not displayed at mobile widths and is displayed at others

### Requirement: Edit-mode markers
In edit mode the shim SHALL emit the documented `data-pb-*` attributes for element id, kind, type, section, editable text keys and dropzones.

#### Scenario: Edit mode render
- **WHEN** the service reports editMode
- **THEN** every section, layout cell and component element carries its markers

#### Scenario: Published render
- **WHEN** editMode is false
- **THEN** no `data-pb-*` attributes are emitted

### Requirement: Wire version header
The shim SHALL send its wire version on every render call and surface a clear development-time error when the service rejects it.

#### Scenario: Rejected version
- **WHEN** the service rejects the wire version
- **THEN** the shim logs the supported versions in development and renders the fallback
