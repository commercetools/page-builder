# Seed Tooling

## Purpose

Operator scripts that push a starting catalog and set of sample pages into a commercetools project, and
read them back out again. They exist so a fresh project can be brought up in one command, and so a
project's state can be captured to disk, edited, and replayed elsewhere. Implemented by
`seed/scripts/` with payloads in `seed/data/`.

## Requirements

### Requirement: Seed and download commands

The tooling SHALL provide a seed command per catalog and for pages, an all-in-one seed, and a matching
download command per catalog and for pages.

#### Scenario: Bringing up a fresh project

- **WHEN** the operator runs the combined seed
- **THEN** data-source types, component types, sections and pages are all written to the project

### Requirement: Credentials and dry runs

Every script MUST take its commercetools credentials from an environment file, default to the local
seed environment file while honouring an explicit path, and support a dry run that reports what it
would write without writing.

#### Scenario: Dry run

- **WHEN** a seed script is run as a dry run
- **THEN** the intended writes are reported and nothing is sent to the project

#### Scenario: Missing credentials

- **WHEN** a required credential variable is absent
- **THEN** the script fails identifying the variable, rather than attempting an unauthenticated call

### Requirement: Catalog seeds are immediately live

Catalog seed scripts SHALL write both a draft version and a matching published payload, so a freshly
seeded project has a working palette without a separate publish step.

#### Scenario: Seeding components

- **WHEN** the component catalog is seeded
- **THEN** the editor's palette is populated immediately, because the published payload was written
  alongside the draft

### Requirement: Page seeding writes the current split layout

The page seed script MUST write pages in the current layout: one component object per component
instance with a freshly generated identifier, a draft page whose layout children are references to
those objects, and a self-contained published snapshot with the content inline.

#### Scenario: Seeding a page

- **WHEN** a page is seeded
- **THEN** its components exist as individual objects, its draft references them, and its published
  snapshot embeds them

### Requirement: Page discovery and selection

The page seed script SHALL discover the available page payloads automatically and MUST allow seeding a
single named page.

#### Scenario: Seeding one page

- **WHEN** the operator names a single page
- **THEN** only that page is written

### Requirement: Data source instances are seeded once

Saved data-source instances SHALL be written once per run rather than per page, since they live in a
single shared object.

#### Scenario: Seeding several pages

- **WHEN** multiple pages are seeded in one run
- **THEN** the instance collection is written a single time

### Requirement: Download captures project state to disk

Download scripts SHALL write the project's current state back into the payload files: the draft head
for each catalog, and the published snapshot for each page.

#### Scenario: Capturing a project

- **WHEN** the operator downloads all state
- **THEN** the payload files reflect the project and can be committed, edited, and re-seeded elsewhere

#### Scenario: Paging through many objects

- **WHEN** a container holds more objects than one request can return
- **THEN** the script pages through them, 500 at a time

### Requirement: Seeded pages must be registered to appear

A seeded page id SHALL also be registered in the application's static page tree for it to appear as a
first-class node; otherwise it surfaces only through the generated content-pages folder.

#### Scenario: Seeding an unregistered page

- **WHEN** a page is seeded whose id is not in the static page tree
- **THEN** it is still reachable, appearing under the generated content-pages group rather than as a
  declared node
