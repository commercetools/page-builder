# Component Catalog

## Purpose

The vocabulary of component types an author can place on a page. This application does not author
that vocabulary — it is defined in host storefront code and pushed into commercetools by the
`page-builder` CLI. This capability covers how the editor consumes the published catalog and
turns it into a palette. Implemented by `page-editor/src/hooks/use-components-connector`,
`page-editor/src/components/page-builder/left-pane.tsx`, `left-pane-components.tsx`, and
`shared/component-card.tsx`.

## Requirements

### Requirement: The catalog is read-only to this application

The editor SHALL only ever read the published component catalog. It MUST NOT provide any
affordance to create, edit, delete or publish a component type, and MUST NOT write the catalog
object.

#### Scenario: No in-app catalog editor exists

- **WHEN** an author looks for a way to define a new component type
- **THEN** no such surface exists in the application, because component types are authored in host
  code and synced in

#### Scenario: Unsynced project

- **WHEN** no component catalog has been synced into the project
- **THEN** the palette is empty and says so, rather than falling back to a bundled stub catalog

### Requirement: Palette grouping and search

The palette SHALL present component types grouped by the catalog's declared groups, and SHALL let
the author filter them by name.

#### Scenario: Searching the palette

- **WHEN** the author types into the palette search field
- **THEN** only component types whose localized display name contains the query, case-insensitively,
  remain listed

### Requirement: Page-type filtering

The palette MUST hide component types that do not apply to the page being edited, based on each
type's declared page types.

#### Scenario: Type restricted to another page type

- **WHEN** the page being edited is of a given page type and a component type declares page types
  that include neither `all` nor that page type
- **THEN** that component type is not offered in the palette

#### Scenario: Type with no declared page types

- **WHEN** a component type declares no page types at all
- **THEN** it is treated as applying to `all` page types and remains available

### Requirement: Narrowing to what the host implements

In preview mode, when the connected host has advertised its component registry, the palette SHALL
be narrowed to the types that host actually implements, so an author cannot place a component the
storefront cannot render.

#### Scenario: Host advertises a registry

- **WHEN** the preview host reports a non-empty registry over the visual-editing bridge
- **THEN** the palette shows only catalog types whose type key appears in that registry

#### Scenario: No host manifest available

- **WHEN** no host registry has been reported
- **THEN** the palette falls back to the full published catalog rather than showing nothing

### Requirement: Icons are host-declared names

A component type's icon SHALL be interpreted as a verbatim icon export name from the design
system's icon set. The application performs no normalization or aliasing.

#### Scenario: Unrecognized icon name

- **WHEN** a synced component type declares an icon name that does not exist in the icon set
- **THEN** no icon renders for that type, and the type is otherwise still usable
