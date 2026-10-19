# Draft and Publish

## Purpose

Every page carries a private draft history and a separate published snapshot; the storefront only
ever reads the published one. This gives authors a safe place to work and makes going live an
explicit act. Implemented by `page-editor/src/components/page-builder/use-page-document.ts`,
`menu-bar.tsx`, `menu-bar-actions.tsx`, and
`page-editor/src/hooks/use-page-builder-connector/use-page-builder-connector.ts`.

## Requirements

### Requirement: Saving appends a draft version

Saving SHALL append a new version to the page's draft history rather than overwriting the previous
one, stamping it with a monotonically increasing application version and a save timestamp, and
leaving its published marker unset.

#### Scenario: Saving a modified page

- **WHEN** the author saves a page with unsaved changes
- **THEN** a new draft version is appended carrying the current content
- **AND** its application version is one greater than the previous head
- **AND** its published marker is null, marking it as not yet live

### Requirement: Draft history is capped

The draft history MUST be capped at 50 versions, discarding the oldest when the cap is exceeded.

#### Scenario: Saving beyond the cap

- **WHEN** a page already has 50 draft versions and is saved again
- **THEN** the new version is appended and the oldest is dropped, keeping the history at 50

### Requirement: Publishing freezes a snapshot

Publishing SHALL save the draft first and then write the current content as the published snapshot,
stamping both the snapshot and the draft head with a publish timestamp.

#### Scenario: Publishing a page

- **WHEN** the author publishes
- **THEN** the draft is saved, the published snapshot is replaced with that content, and the publish
  timestamp is recorded on the draft head so the directory can report the page as published without
  reading the published object

### Requirement: Save and make live

The save control SHALL offer a combined save-and-publish action, but this bypass MUST be withdrawn
whenever an approval workflow governs the page, so that publishing can only happen through the
workflow.

#### Scenario: No workflow governs the page

- **WHEN** the author opens the save control on an ungoverned page
- **THEN** a save-and-make-live option is offered alongside the plain save

#### Scenario: A workflow governs the page

- **WHEN** an approval workflow applies to this page's type
- **THEN** the save control offers no save-and-make-live option

### Requirement: Status pill

The menu bar SHALL show a single status pill summarizing where the page stands, distinguishing
unsaved work from a saved-but-unpublished draft, from a fully published page, from a page with no
draft at all.

#### Scenario: Unsaved changes take priority

- **WHEN** the page has unsaved changes
- **THEN** the pill reports unsaved state in a warning tone, regardless of the stored state

#### Scenario: Published and up to date

- **WHEN** the page is published and there is nothing further to publish
- **THEN** the pill reports published state in a positive tone

#### Scenario: Saved but not live

- **WHEN** the page has a saved draft whose content has not been published
- **THEN** the pill reports saved state in an informational tone

#### Scenario: Never saved

- **WHEN** the page has no draft at all
- **THEN** the pill reports the absence of a draft in a neutral tone

### Requirement: Save state indicator

The menu bar SHALL continuously indicate whether the current content is saved, being saved, or
dirty, so the author never has to guess.

#### Scenario: While a save is in flight

- **WHEN** a save request is outstanding
- **THEN** the indicator shows saving, and settles into a saved indication on success

### Requirement: Publish eligibility

Publishing SHALL be offered only when there is a saved draft whose content has not yet been
published, and additionally, under a workflow, only when the workflow has reached its finish.

#### Scenario: Nothing new to publish

- **WHEN** the draft head has already been published
- **THEN** publishing is unavailable

### Requirement: Version history is recorded but not restorable

The system SHALL retain the draft history for audit and for counting unpublished changes, but MUST
NOT offer to restore, preview or diff an individual past version.

#### Scenario: Author wants to roll back

- **WHEN** an author wants to return the page to an earlier version
- **THEN** no in-application affordance exists to do so, and the history is read-only
