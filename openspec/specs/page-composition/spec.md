# Page Composition

## Purpose

The edit canvas at `/builder/:pageId`: how an author assembles a page out of sections, layout
rows and components, and how the current selection is tracked. This is the core authoring loop
of the product. Implemented by `page-editor/src/components/page-builder/page-builder.tsx`,
`layout-canvas/` (notably `use-page-mutations.ts`), `use-element-selection.ts`,
`element-location.ts`, `left-pane.tsx`, `left-pane-components.tsx`, `outline-tree.ts`, and
`layout-picker-dialog.tsx`.

## Requirements

### Requirement: Page structure

A page SHALL consist of sections, each holding an ordered list of layout rows, each holding an
ordered list of component instances. A layout row MUST carry one of six fractional widths that
map onto a twelve-column grid.

#### Scenario: Adding a layout row

- **WHEN** the author adds a layout element to a section
- **THEN** a width picker offers full width (12 columns), half (6), third (4), two-thirds (8),
  quarter (3), and three-quarters (9)
- **AND** the chosen row is appended to that section

### Requirement: Placing components from the palette

The author SHALL be able to drag a component type from the palette onto a layout row, and a drag
onto a section that has no rows yet MUST still succeed.

#### Scenario: Dropping onto an existing row

- **WHEN** a palette component is dropped onto a layout row
- **THEN** a new component instance of that type is appended to the row's children

#### Scenario: Dropping onto an empty section

- **WHEN** a palette component is dropped onto a section containing zero layout rows
- **THEN** a full-width row is synthesized to hold it, with the dropped component as its only
  child, so the first drag onto an empty section is not a no-op

### Requirement: Rearranging and removing elements

The author SHALL be able to reorder, duplicate and delete both layout rows and components, and
duplicating MUST produce independent ids so the copy is not aliased to the original.

#### Scenario: Reordering rows within a section

- **WHEN** a layout row is dragged onto another row's position in the same section
- **THEN** the rows are reordered accordingly
- **AND** dropping a row onto its own position changes nothing

#### Scenario: Duplicating a row

- **WHEN** a layout row is duplicated
- **THEN** the clone receives a new row id and every child component receives a new component id

### Requirement: Section collapse

The author SHALL be able to collapse and expand a section to reduce canvas noise, and this state
is view-only and not persisted with the page.

#### Scenario: Toggling a section

- **WHEN** the author toggles a section header
- **THEN** that section's rows are hidden or revealed without modifying the page content

### Requirement: Device width switcher

The canvas SHALL be constrainable to a device width so the author can judge a layout at that
size: 1240px for desktop, 820px for tablet, 390px for mobile.

#### Scenario: Narrowing the canvas

- **WHEN** the author selects the mobile device
- **THEN** the canvas is constrained to a maximum width of 390px

### Requirement: Selection model

Exactly one element SHALL be the selection target at a time, tracked as a layout row and an
optional component within it, so that selecting a component retains knowledge of its parent row.

#### Scenario: Selecting a component

- **WHEN** the author selects a component
- **THEN** both the component and its parent layout row are recorded as the current selection
- **AND** the effective selected element resolves to the component

#### Scenario: Selecting a row

- **WHEN** the author selects a layout row directly
- **THEN** the component part of the selection is cleared and the row becomes the selected element

### Requirement: Selection is deep-linkable

The current selection SHALL be reflected in the URL so a specific element can be linked to and
restored on reload.

#### Scenario: Selection round-trips through the URL

- **WHEN** a component inside a row is selected
- **THEN** the `layout` and `comp` query parameters are set to their ids
- **AND** entering the builder with those parameters present restores that selection

### Requirement: Left pane

The builder SHALL provide a left pane with two mutually exclusive panels — the component palette
and a page outline — collapsible to an icon rail that can reopen either panel directly.

#### Scenario: Collapsed rail

- **WHEN** the left pane is collapsed
- **THEN** a narrow rail exposes an entry point for each panel
- **AND** activating one opens that specific panel rather than the last used one

#### Scenario: Navigating by outline

- **WHEN** the author selects an entry in the outline tree
- **THEN** the corresponding section, row or component becomes the current selection

### Requirement: Locating an element by id

The system SHALL be able to resolve any element id to its position in the page tree, so
selections arriving from outside the canvas can be applied.

#### Scenario: Resolving an id

- **WHEN** an element id is looked up against the page
- **THEN** its section, its layout row, and its component id when applicable are returned
- **AND** an id present nowhere in the page resolves to nothing rather than throwing
