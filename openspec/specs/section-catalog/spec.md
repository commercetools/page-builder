# Section Catalog

## Purpose

Sections are the top-level slots of a page (by default a head, a main body, and a footer). Like
component types they are host-owned and synced in, but unlike them the editor must never be left
with no sections at all, or the canvas would render as a blank grid with nothing to drop into.
Implemented by `page-editor/src/hooks/use-sections-connector`,
`page-editor/src/components/page-builder/types.ts` (`DEFAULT_SECTIONS`), and `page-builder.tsx`.

## Requirements

### Requirement: Sections come from the published catalog

The editor SHALL read the section set from the published sections catalog, and MUST NOT provide
any affordance to author sections.

#### Scenario: Synced sections are used

- **WHEN** the published sections catalog contains one or more sections
- **THEN** the canvas renders exactly those sections, in catalog order

### Requirement: Fallback to default sections

The editor MUST fall back to the built-in default sections whenever the synced catalog yields no
sections, treating a synced-but-empty list the same as a missing one.

#### Scenario: No sections catalog synced

- **WHEN** no sections catalog exists for the project
- **THEN** the canvas exposes the default head, main and footer sections

#### Scenario: Catalog synced with an empty list

- **WHEN** the sections catalog is present but its section list is empty
- **THEN** the default sections are used, because an empty list is not absent and would otherwise
  leave the author with nothing to edit

### Requirement: Page-type filtering of sections

Sections MUST be filtered to those applicable to the page being edited.

#### Scenario: Section restricted to another page type

- **WHEN** a section declares page types including neither `all` nor the current page's type
- **THEN** that section is not shown on the canvas for this page
