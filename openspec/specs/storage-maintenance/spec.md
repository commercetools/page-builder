# Storage Maintenance

## Purpose

Two operator-facing maintenance operations that sit outside ordinary authoring: a one-time migration
of pages from the pre-split storage layout to the current one, and a destructive reset that empties
the containers this application owns. Both are deliberately blunt tools, and both must be safe to run
more than once. Implemented by `page-editor/src/components/pages/migrate-all-dialog.tsx`, the
migration routine in `page-editor/src/hooks/use-page-builder-connector/`,
`page-editor/src/components/reset/reset.tsx`, and `page-editor/src/hooks/use-reset-connector`.

## Requirements

### Requirement: Migration is forced before authoring continues

While any page still exists only in the pre-split layout, the pages route MUST present a
non-dismissable migration gate, so the project cannot be left half-migrated with authors working
around it.

#### Scenario: Legacy pages present

- **WHEN** an operator opens the pages route and at least one page remains unmigrated
- **THEN** a migration dialog blocks the route and cannot be dismissed without migrating

#### Scenario: Nothing to migrate

- **WHEN** every page already uses the current layout
- **THEN** no gate is shown

### Requirement: Migration splits a page into the current layout

Migrating a page SHALL split its draft head into one object per component, write a draft page whose
children reference those objects, carry over the already-inline published snapshot, and then remove
the legacy object.

#### Scenario: Migrating a page with components

- **WHEN** a legacy page holding components is migrated
- **THEN** each component becomes its own object, the draft page references them, and the legacy
  combined object is deleted

#### Scenario: Legacy page with no draft content

- **WHEN** a legacy page has no draft head to split
- **THEN** it is migrated to an empty page with the default sections rather than failing

### Requirement: Migrated components receive fresh global ids

Because ids in the legacy layout were only unique within their page, migration MUST mint a fresh
globally unique id for every component object.

#### Scenario: Two pages sharing a component id

- **WHEN** two legacy pages each contain a component with the same page-local id and both are migrated
- **THEN** each yields a distinct component object, with no collision between them

### Requirement: Migration collapses draft history

Migration SHALL carry over only the draft head, discarding older legacy draft versions.

#### Scenario: Legacy page with a long history

- **WHEN** a legacy page with many draft versions is migrated
- **THEN** the resulting draft holds a single version corresponding to the legacy head

### Requirement: Bulk migration is idempotent

The bulk migration MUST skip any page already present in the current layout, so a re-run after a
partial failure cannot clobber newer content, and MUST report per-page failures without aborting the
run.

#### Scenario: Re-running after a partial failure

- **WHEN** the migration is run again after some pages succeeded
- **THEN** the already-migrated pages are skipped and only the remainder is attempted

#### Scenario: One page fails

- **WHEN** a single page fails to migrate
- **THEN** the run continues for the others and that page is reported as failed with its reason

### Requirement: Container reset

A hidden maintenance route SHALL let an operator select any of the containers this application owns
and delete every object in them, reporting how many were removed.

#### Scenario: Selecting containers

- **WHEN** an operator opens the reset route
- **THEN** each owned container is listed with a description and its live object count, and can be
  selected individually or all at once

#### Scenario: Reporting the outcome

- **WHEN** a reset completes
- **THEN** the number of deleted objects is reported

### Requirement: Reset requires deliberate confirmation

Because a reset is irreversible, it MUST require an explicit second confirmation before any object is
deleted.

#### Scenario: Confirming a reset

- **WHEN** an operator triggers a reset
- **THEN** nothing is deleted until a separate destructive confirmation is given

### Requirement: Reset never touches foreign containers

Reset MUST be limited to containers this application owns and MUST NOT delete the media-service
configuration container, which belongs to a separate application and is only ever read here.

#### Scenario: Media configuration is preserved

- **WHEN** every offered container is selected and reset
- **THEN** the foreign media configuration container is left intact

### Requirement: Reset is paged and batched

Reset MUST page through objects within the platform's query limit and delete in batches, so a
container with many objects can still be emptied.

#### Scenario: Large container

- **WHEN** a container holds more objects than a single query can return
- **THEN** objects are listed in pages of 500 and deleted in batches of 25 until the container is empty

### Requirement: Reset is not exposed in navigation

The reset route SHALL remain reachable by URL only, and MUST NOT appear in the application menu.

#### Scenario: Looking for reset in the menu

- **WHEN** a user browses the application's navigation
- **THEN** no entry for the reset route is offered
