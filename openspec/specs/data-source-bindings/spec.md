# Data Source Bindings

## Purpose

How a component gets dynamic content. Data source *types* are host-owned and synced in like
component types, but the saved *instances* of those types — a named, configured "New Arrivals" or
"Current Category" — are authored in this application and bound into component fields by id. This
is the one catalog-adjacent object content authors own. Implemented by
`page-editor/src/components/page-builder/data-source-config-dialog.tsx`, `data-source-dialog/`,
`data-source-dialog-state.ts`, `settings-pane-sections/data-source-slot.tsx`, `shared/`
product and category picker fields, and `page-editor/src/hooks/use-data-source-instances-connector`.

## Requirements

### Requirement: Data source types are read-only

The editor SHALL read data source types from the published catalog only, and MUST NOT offer to
create, edit or delete a type.

#### Scenario: Type catalog consumption

- **WHEN** the configuration dialog is opened for a component field
- **THEN** the available types come from the published data-source catalog

### Requirement: Data source slot states

A component schema field of kind `dataSource` SHALL render as a slot that communicates whether it
is bound, and MUST offer to change or clear an existing binding.

#### Scenario: Unbound slot

- **WHEN** the field holds no instance id
- **THEN** the slot invites the author to configure a data source

#### Scenario: Bound slot

- **WHEN** the field holds an instance id that resolves to a saved instance
- **THEN** the slot shows that instance's name, its type, and a summary of its configuration
- **AND** offers to edit or replace the binding, and to clear it

#### Scenario: Bound instance not yet published

- **WHEN** a bound reusable instance has unpublished changes
- **THEN** the slot marks it as unpublished, so the author knows the storefront will not see the
  current configuration

### Requirement: Configuration dialog modes

The dialog SHALL offer three modes — pick an existing saved instance, create a new one, or edit an
existing one's configuration — and MUST open on the mode that fits the current state.

#### Scenario: Opening with matching saved instances

- **WHEN** the dialog opens and at least one saved instance matches the field's required type
- **THEN** it opens on the existing-instances mode, preselecting the currently bound instance if
  there is one, otherwise the first match

#### Scenario: Opening with no matching saved instances

- **WHEN** the dialog opens and no saved instance matches the required type
- **THEN** it opens on the create-new mode, since there is nothing to pick

#### Scenario: Cancelling an edit

- **WHEN** the author starts editing an instance and then cancels
- **THEN** the dialog returns to the existing-instances mode and the edit is discarded

### Requirement: Type-restricted instance choice

The existing-instances list MUST be restricted to instances whose type matches the type the
component field requires.

#### Scenario: Instance of a different type

- **WHEN** a saved instance exists whose type differs from the field's declared data source type
- **THEN** it is not offered for that field

### Requirement: Editing an instance in place versus forking it

Editing a saved instance SHALL offer both saving in place and saving as a copy, because an instance
may be bound by more than one component.

#### Scenario: Saving changes in place

- **WHEN** the author saves an edited instance in place
- **THEN** the change applies to every component bound to that instance

#### Scenario: Saving as a copy

- **WHEN** the author saves an edited instance as a copy
- **THEN** a new instance is created and bound to the current field only, leaving the original
  untouched

### Requirement: Binding is by instance id

Binding a data source SHALL store only the instance id in the component's settings, so that later
edits to the instance are picked up without touching the page.

#### Scenario: Binding a picked instance

- **WHEN** the author confirms an instance for a field
- **THEN** that instance's id is written into the component's settings for that field

### Requirement: Configuration inputs including catalog pickers

The configuration form SHALL render one input per field of the type's schema, and MUST provide
dedicated commercetools pickers for the product and category field kinds. These pickers exist only
here, not in the component settings pane.

#### Scenario: Searching for a product or category

- **WHEN** the author uses a product or category field
- **THEN** results are searched from commercetools as the author types, and a selection can be added

#### Scenario: Ordered picks

- **WHEN** a field is of a picks kind
- **THEN** selected entries can be added, removed, and reordered, and their order is preserved

#### Scenario: Pinned positions

- **WHEN** a field is of a pins kind
- **THEN** an entry can be pinned to a specific numbered position

### Requirement: Reuse flag

Each instance SHALL carry a flag marking it as saved for reuse, defaulting to enabled for a new
instance, which determines whether it appears in the existing-instances list for other components.

#### Scenario: Creating a non-reusable instance

- **WHEN** the author creates an instance with reuse disabled
- **THEN** it is bound to the current field but is not offered as a saved instance elsewhere

### Requirement: Instances persist with the page

Saved instances SHALL be written alongside every page save and publish, so a page and the instances
it binds cannot drift apart in a single authoring session.

#### Scenario: Saving a page that added an instance

- **WHEN** the author saves a page after creating a new instance on it
- **THEN** the instance collection is persisted in the same operation as the page draft
