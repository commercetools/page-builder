# Host Render SDK

## Purpose

The runtime half of `@commercetools-labs/page-builder`: what a storefront imports to turn a stored
page into rendered output. Its design goal is that drift between the editor's palette and the host's
implementations becomes a compile error rather than a blank space on a live page. Implemented by
`packages/page-builder/src/` (`index.ts`, `contract.ts`, `transform.ts`, `registry.ts`,
`page-store.ts`, `device-visibility.ts`, `react/index.tsx`) with a scaffold under `templates/`.

## Requirements

### Requirement: Entry points separate concerns

The package SHALL expose distinct entry points: a framework-agnostic root, a React rendering entry, a
bridge entry, a types-only contract entry, and a Node-only commercetools entry. The Node-only helpers
MUST stay off the root entry so that edge and browser bundles do not pull Node built-ins.

#### Scenario: Bundling for an edge runtime

- **WHEN** a host imports only from the root or React entries
- **THEN** no Node-only module is pulled into the bundle

#### Scenario: Importing types alone

- **WHEN** a host imports from the contract entry
- **THEN** it receives wire types and constants with no runtime code

### Requirement: Authoring definitions in host code

The SDK SHALL provide helpers to define component blocks and data sources in host code, to build a
serializable catalog from them, and to build a registry manifest, so that the same declarations feed
both the CLI's sync and the runtime's rendering.

#### Scenario: One source of truth

- **WHEN** a host declares its blocks once
- **THEN** the same declarations produce the catalog that is synced and the registry that renders

### Requirement: Registry coverage is checked at compile time

Building a registry MUST require an implementation for every declared palette block and MUST reject a
mapping that names a block which was not declared, so palette and registry cannot drift.

#### Scenario: Missing an implementation

- **WHEN** a host declares a block but provides no component for it
- **THEN** the registry does not type-check

#### Scenario: Stray implementation

- **WHEN** a host provides a component keyed by a type it never declared
- **THEN** the registry does not type-check

### Requirement: Route-driven types have an escape hatch

Types that are rendered by a route rather than placed from the palette SHALL be registerable
separately from palette blocks, so they are not forced into the palette to satisfy coverage.

#### Scenario: Registering a system component

- **WHEN** a host supplies a component for a non-palette type as a system component
- **THEN** it renders when encountered without appearing in the palette coverage check

### Requirement: Unknown types degrade by environment

An element whose type has no implementation MUST render a visible placeholder in development and
nothing at all in production, so a mistake is loud while developing and invisible to shoppers.

#### Scenario: Unknown type in development

- **WHEN** a page contains a type absent from the registry and the host runs in development
- **THEN** a placeholder identifying the missing type is rendered

#### Scenario: Unknown type in production

- **WHEN** the same page renders in production
- **THEN** nothing is rendered in that element's place

### Requirement: Layout rows pack into a twelve-column grid

The transform MUST map each element's fractional width onto column counts — full width to 12, half to
6, a third to 4, two-thirds to 8, a quarter to 3, three-quarters to 9 — and pack elements greedily
into rows that do not exceed twelve columns.

#### Scenario: Packing a row

- **WHEN** consecutive elements' column counts would exceed twelve
- **THEN** a new row is started rather than overflowing the grid

#### Scenario: Unrecognized width

- **WHEN** an element declares a width the map does not cover
- **THEN** it is treated as full width

### Requirement: Localized values are collapsed for the render locale

The transform MUST recursively collapse locale-keyed values to the requested locale, falling back to
the default locale, so that host components receive plain values rather than locale maps.

#### Scenario: Value missing for the requested locale

- **WHEN** a localized field has no entry for the requested locale
- **THEN** the default locale's value is used

### Requirement: Data source bindings are resolved at render time

The transform SHALL resolve each element's data-source binding through host-supplied resolvers and
merge the resolved values into the element's configuration.

#### Scenario: Rendering a bound component

- **WHEN** an element binds a saved data-source instance
- **THEN** the resolver for that instance's type is invoked and its result is available to the
  component

### Requirement: Reading a stored page

The SDK SHALL provide a page store that reads the current split layout, resolving component
references when a component reader is supplied, and MUST fall back to the pre-split and older layouts
so a host is not broken by an unmigrated project.

#### Scenario: Published read path

- **WHEN** a published page is requested
- **THEN** it is served from the self-contained published object without resolving references

#### Scenario: Draft read without a component reader

- **WHEN** a draft page is requested but no component reader was supplied
- **THEN** the store falls back to the published page rather than failing

#### Scenario: A referenced component is missing

- **WHEN** a draft references a component object that cannot be read
- **THEN** that child is skipped and the rest of the page still renders

### Requirement: Per-device visibility becomes render classes

The SDK MUST translate an element's per-breakpoint visibility flags into responsive classes, applied
at the section, row and item level, and a section MUST be considered visible at a breakpoint when any
of its elements is visible there.

#### Scenario: Element hidden on mobile

- **WHEN** an element is marked hidden on mobile
- **THEN** the emitted classes hide it at the mobile breakpoint and show it at the others

#### Scenario: Fully visible element

- **WHEN** an element is visible on all three breakpoints
- **THEN** no visibility classes are emitted for it

#### Scenario: Host must safelist the classes

- **WHEN** a host uses a utility-class framework that strips unused classes
- **THEN** the generated visibility classes must be safelisted, or visibility will not take effect
