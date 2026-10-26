# Storefront Preview

## Purpose

Renders the page being edited inside the real storefront, in an iframe, so an author sees the actual
result rather than an approximation of it. The editor never renders components itself; the host does.
Implemented by `page-editor/src/components/page-builder/preview/` and `use-preview-target.ts`, with
operator configuration in `page-editor/src/components/pages/use-preview-settings-state.ts` and
`page-editor/src/hooks/use-preview-settings-connector`.

## Requirements

### Requirement: Operator-configured preview settings

An operator SHALL configure preview once per project: whether it is enabled, the storefront base URL
and shared draft token, the locale list and default locale, a URL route template per page type, a
sample product for PDP previews, a home page id, and any extra template variables. These settings
are plain configuration and are MUST NOT be subject to the draft-and-publish cycle.

#### Scenario: Editing settings

- **WHEN** an operator saves preview settings from the pages route
- **THEN** they take effect immediately, with no separate publish step

### Requirement: Preview environments

The system SHALL support three environments — production, staging and local. Production and staging
base URLs live in project configuration; the local URL and the operator's active choice MUST be
per-browser so a developer previewing against their own machine does not change what teammates see.

#### Scenario: Switching to local

- **WHEN** a developer selects the local environment and sets a local base URL
- **THEN** previews resolve against that URL for that browser only

#### Scenario: Default environment

- **WHEN** no environment has been chosen in this browser
- **THEN** production is used

### Requirement: Preview availability

Preview SHALL be offered only when it is enabled in settings and the active environment resolves to
a base URL.

#### Scenario: Enabled but no URL for the active environment

- **WHEN** preview is enabled but the active environment has no base URL configured
- **THEN** preview is unavailable and the builder stays on the edit canvas

### Requirement: Preview URL construction

The preview URL MUST be built by substituting the locale, slug, sku and any configured variables into
the route template for the page's type, and MUST carry the draft token so the host will serve draft
content.

#### Scenario: Draft flag

- **WHEN** a preview URL is built and a token is configured
- **THEN** the token is appended as the `pb_preview` query parameter

#### Scenario: Identifying the page to the host

- **WHEN** a preview URL is built for a known page
- **THEN** the page's editor id is appended as `pb_page_id`, so the host reads that exact page object
  rather than inferring one from the route

#### Scenario: Edit mode parameters

- **WHEN** the preview is opened for visual editing
- **THEN** `pb_edit=1` is appended along with the editor's origin as `pb_origin`

### Requirement: PDP sample resolution

Previewing a product detail page SHALL resolve a real sample product, preferring the first product of
the category the page is scoped to and otherwise falling back to a project-wide sample.

#### Scenario: Category-scoped PDP

- **WHEN** previewing the PDP for a specific category
- **THEN** the first product in that category supplies the slug and sku

#### Scenario: Global PDP

- **WHEN** previewing the PDP for the synthetic category root, which is not a real category
- **THEN** a project-wide sample product is used instead

### Requirement: Preview defaults on where it is usable

The builder SHALL switch to preview automatically the first time settings resolve for a page and a
preview URL is available, and MUST do so at most once per page so it never fights the author's own
choice.

#### Scenario: Opening a previewable page

- **WHEN** the author opens a page for which preview is enabled and a URL resolves
- **THEN** the builder starts in preview rather than on the edit canvas

#### Scenario: Author switches back to editing

- **WHEN** the author switches to the edit canvas on that same page
- **THEN** the builder does not switch back to preview on its own

### Requirement: Content is saved before it is previewed

Entering preview or refreshing it SHALL save any unsaved draft first, because the host reads the
stored draft, not the editor's memory.

#### Scenario: Previewing with unsaved changes

- **WHEN** the author enters preview while the page is dirty
- **THEN** the draft is saved before the frame loads, and the frame is cache-busted so the host is not
  served a stale render

### Requirement: Preview toolbar

The preview SHALL offer an environment switcher, a locale switcher, a manual refresh, and a way to
open the preview URL in a new browser tab.

#### Scenario: Changing locale

- **WHEN** the author selects a different locale
- **THEN** the preview reloads at that locale's URL

### Requirement: Device-constrained frame

The preview frame MUST be constrained to the selected device width: 1240px desktop, 820px tablet,
390px mobile.

#### Scenario: Previewing at mobile width

- **WHEN** the mobile device is selected
- **THEN** the frame is constrained to 390px so the host renders its mobile layout

### Requirement: Wrong-page detection

When the host reports rendered elements and none of their ids exist in the page being edited, the
system MUST warn the author, because in that state every click in the preview would silently do
nothing.

#### Scenario: Host renders a different page object

- **WHEN** the host reports element geometry and not one reported id appears in the current page
- **THEN** a mismatch warning is surfaced, indicating the host is reading a different page object or
  ignoring the supplied page id

#### Scenario: Partial overlap is not a mismatch

- **WHEN** some but not all reported ids match the current page
- **THEN** no warning is raised, because a partial render is a normal transient state
