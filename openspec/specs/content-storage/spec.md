# Content Storage

## Purpose

All application data lives in commercetools custom objects; there is no separate database. The page
storage model deliberately splits a page across three containers so that the storefront's read path
is a single fetch of a frozen snapshot, while authoring works against per-component objects with
their own histories. Implemented by `page-editor/src/components/page-builder/types.ts`,
`canonicalize.ts`, `page-editor/src/hooks/use-page-builder-connector/`, and
`page-editor/src/hooks/use-page-components-connector/envelope.ts`, with the reader half in
`packages/page-builder/src/page-store.ts`.

## Requirements

### Requirement: Container and key layout

Application data SHALL be stored under a fixed set of containers and keys: page drafts as
`page-<pageId>` in `page-editor-draft`; published pages as `page-<pageId>` in
`page-editor-published`; component instances as `component-<uuid>` in `page-editor-components`; and
in the `page-editor` container the host-synced `components`, `data-sources` and `sections` catalogs,
plus this application's `data-source-instances`, `settings`, `comments-<pageId>`,
`workflow-<workflowId>` and `wfstate-<pageId>` objects. The `page-editor` container also still holds
pre-split `page-<pageId>` objects.

#### Scenario: Locating a page's data

- **WHEN** a page's stored state is needed
- **THEN** its draft, its published snapshot, and its component instances are read from their three
  respective containers under the documented keys

### Requirement: The current page schema version

Page objects SHALL declare schema version 3, marking the split-container layout.

#### Scenario: Reading a page object

- **WHEN** a page object is read
- **THEN** its declared schema version identifies which layout it uses, so a pre-split object is
  recognizable as legacy

### Requirement: Component instances are written before the tree that references them

Saving a page MUST write its component objects first and only then write the page tree, whose layout
children are references to those objects rather than embedded content.

#### Scenario: Saving a page

- **WHEN** a page draft is saved
- **THEN** each component instance is upserted to its own object, and the draft page records each
  child as a reference to that object

### Requirement: Component writes are idempotent

A component object MUST NOT gain a new version when its authored content is unchanged, decided by
canonical-JSON equality against the current draft head, so repeatedly saving an untouched page does
not inflate history.

#### Scenario: Saving a page with one changed component

- **WHEN** a page with many components is saved after editing exactly one of them
- **THEN** only that component's object gains a new version and the rest are left untouched

### Requirement: Per-object version histories are capped

Both page drafts and individual component objects SHALL retain their own version history capped at 50
entries.

#### Scenario: Exceeding a component's history cap

- **WHEN** a component object already holds 50 versions and changes again
- **THEN** the new version is appended and the oldest discarded

### Requirement: Publishing freezes a self-contained snapshot

The published page object MUST embed the full component content inline rather than referencing
component objects, so that later edits to a component object cannot retroactively change a page that
is already live.

#### Scenario: Editing a component after publishing

- **WHEN** a component is edited and saved as a draft after the page was published
- **THEN** the published snapshot is unchanged and the storefront continues to serve what was
  published

#### Scenario: Storefront read path

- **WHEN** the storefront reads a published page
- **THEN** one object read suffices, because no references need resolving

### Requirement: Reading re-embeds referenced components

Loading a draft page SHALL resolve its component references and re-embed their content, so that the
editor always works against a fully materialized page.

#### Scenario: Loading a draft

- **WHEN** a draft page is opened in the builder
- **THEN** its referenced component objects are fetched and their content is inlined into the tree

### Requirement: A missing component degrades visibly

When a referenced component object cannot be found, the system MUST substitute a visible placeholder
element rather than failing the page load.

#### Scenario: Dangling component reference

- **WHEN** a draft references a component object that no longer exists
- **THEN** a placeholder element marked as a missing component takes its place and the rest of the
  page loads normally

### Requirement: Concurrent writes are retried

Writes MUST be performed as a read-modify-write against the stored version and retried on conflict,
so two authors saving close together do not fail permanently.

#### Scenario: Version conflict on save

- **WHEN** a write is rejected because the stored version has moved on
- **THEN** the current state is re-read and the write reapplied, for up to three attempts

### Requirement: Legacy page objects remain readable

Pre-split page objects in the `page-editor` container SHALL still be readable, so no page becomes
inaccessible before it has been migrated.

#### Scenario: Opening an unmigrated page

- **WHEN** a page exists only as a pre-split combined object
- **THEN** it can still be read
