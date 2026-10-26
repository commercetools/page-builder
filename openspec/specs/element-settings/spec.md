# Element Settings

## Purpose

The settings pane that edits whatever is currently selected on the canvas. Its content is driven
by the selected component type's schema, which is why the same pane can edit any component the
host catalog declares without app changes. Implemented by
`page-editor/src/components/page-builder/settings-pane.tsx`, `settings-pane-sections/`,
`shared/field-editor/`, and `element-styles.ts`.

## Requirements

### Requirement: Pane sections

The settings pane SHALL group its controls into General, Visibility, Content and Advanced
sections, presented as an accordion.

#### Scenario: Editing a component

- **WHEN** a component is selected
- **THEN** the pane offers its general options, its device visibility toggles, and one content
  field per entry in that component type's schema

### Requirement: General options

The General section SHALL edit the element's localized display name, and for a layout row its
width, and its style.

#### Scenario: Localized name

- **WHEN** the author edits the element name
- **THEN** a value can be supplied for each of the project's locales

#### Scenario: Width applies only to rows

- **WHEN** the selected element is a component rather than a layout row
- **THEN** no width control is offered

#### Scenario: Style is an opaque token

- **WHEN** the author picks a style
- **THEN** it is stored as a plain string from a fixed set (empty, light, dark, accent, muted,
  charcoal, sage) for the storefront to interpret, and the app attaches no visual meaning to it

### Requirement: Schema-driven content fields

The Content section MUST render an input per schema field according to the field's declared kind,
and MUST honour the field's localization flag.

#### Scenario: Kinds with a dedicated input

- **WHEN** a schema field declares kind `boolean`, `number`, `select`, `richtext`, `image` or
  `video`
- **THEN** the matching dedicated input is rendered, with `select` driven by the field's declared
  options

#### Scenario: Kinds without a dedicated input

- **WHEN** a schema field declares kind `product`, `productPicks`, `productPins`, `category`,
  `categoryPicks`, `categoryPins` or `link`
- **THEN** it falls through to a plain text input in this pane, because the dedicated pickers for
  those kinds exist only inside the data-source configuration dialog

#### Scenario: Localized field

- **WHEN** a schema field is marked localized
- **THEN** the input is repeated per locale so a value can be given for each

### Requirement: Repeatable group fields

A schema field of kind `group` SHALL render as a repeatable list of sub-items whose shape is
given by the field's children, and nesting MUST be limited to one level.

#### Scenario: Adding and removing items

- **WHEN** the author adds an item to a group field
- **THEN** a new set of the child inputs appears and can be removed independently of the others

### Requirement: Advanced section is not wired up

The Advanced section SHALL be documented as inert: it renders a CSS ID input and a Market
permissions select, but neither holds a value nor persists a change. It exists as a design
placeholder only.

#### Scenario: Editing an advanced control has no effect

- **WHEN** the author types into the CSS ID field or picks a market permission
- **THEN** nothing is stored and the control returns to empty
