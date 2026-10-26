# Host Preview Gating

## Purpose

The security boundary of the preview feature, on the storefront's side. Preview serves unpublished
content and edit mode lets the editor drive the page, so both must be gated on a shared secret and a
validated origin — and the gating must fail closed and be hard to forget to wire up. Implemented by
`packages/page-builder/src/preview.ts`, `src/route.ts`, `src/config.ts`, and
`src/react/visual-editing-bridge.tsx`.

## Requirements

### Requirement: Preview requires a matching token

A request MUST be treated as a preview only when its preview parameter equals the host's configured
preview token.

#### Scenario: Correct token

- **WHEN** a request carries a preview parameter equal to the configured token
- **THEN** it is a preview request and the host may serve draft content

#### Scenario: Wrong or absent token

- **WHEN** the preview parameter is missing or does not match
- **THEN** the request is not a preview and published content is served

#### Scenario: No token configured

- **WHEN** the host has no preview token configured
- **THEN** no request can qualify as a preview, so the feature is closed by default

### Requirement: Edit mode implies a valid preview

Edit mode MUST require a valid preview request in addition to its own parameter, so that the edit
parameter alone can never place a shopper into edit mode.

#### Scenario: Edit parameter without a valid token

- **WHEN** a request carries the edit parameter but no valid preview token
- **THEN** it is not an edit request

### Requirement: Forgetting to thread search parameters is a compile error

The type representing parsed search parameters MUST be constructible only through the SDK's reader
function, so a route that fails to pass its real search parameters cannot type-check.

#### Scenario: Route omits search parameters

- **WHEN** a host route calls the gating helpers without threading its actual search parameters
- **THEN** the code does not compile, rather than silently never entering preview

### Requirement: The editor's page identity wins over the route

In a preview request, the host MUST load the page the editor named in the page-id parameter rather
than re-deriving it from the route slug, and SHOULD warn during development when the loaded page does
not match what the editor asked for.

#### Scenario: Editor names a page

- **WHEN** a preview request carries a page id
- **THEN** that exact page object is loaded

#### Scenario: Mismatch in development

- **WHEN** the loaded page's id differs from the requested one
- **THEN** a development warning is emitted, which is what the editor's mismatch banner corresponds to

### Requirement: The bridge is inert unless all conditions hold

The host bridge MUST do nothing unless the request is in edit mode, the document is embedded in a
frame, and the editor's origin appears in the host's allowed-origins list.

#### Scenario: Not in edit mode

- **WHEN** the page is loaded without the edit parameter
- **THEN** the bridge attaches no listeners and sends no messages

#### Scenario: Loaded outside a frame

- **WHEN** the page is loaded directly rather than embedded
- **THEN** the bridge stays inert

#### Scenario: Origin not allowed

- **WHEN** the editor origin is not in the allowed-origins list
- **THEN** the bridge stays inert, so an arbitrary site cannot drive the storefront

### Requirement: Messages are origin-pinned in both directions

The bridge MUST post only to the validated editor origin and never to a wildcard, and MUST reject
inbound messages whose origin is not that same origin.

#### Scenario: Outbound target

- **WHEN** the bridge sends a message to the editor
- **THEN** it targets the validated origin explicitly

#### Scenario: Inbound from elsewhere

- **WHEN** a message arrives from any other origin
- **THEN** it is discarded

### Requirement: Server-rendered markers

For the editor to identify and target rendered elements, the host MUST emit the documented data
attributes on its output: an element id, its kind, its type, its section, editable field keys, and
dropzones.

#### Scenario: Missing markers

- **WHEN** a host renders without the element id attribute
- **THEN** the editor cannot map clicks to page elements, which surfaces as the editor's
  wrong-page warning

### Requirement: One validated configuration accessor

The environment contract — allowed origins, preview token, the dynamic-pages switch, and the
commercetools credentials — SHALL be read through a single accessor, so a misspelled variable is
caught in one place instead of silently disabling preview.

#### Scenario: Incomplete credentials

- **WHEN** only some of the required credential variables are present
- **THEN** the accessor reports credentials as unavailable rather than returning a partial set
