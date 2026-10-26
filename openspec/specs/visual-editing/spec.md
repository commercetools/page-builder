# Visual Editing

## Purpose

Turns the read-only storefront preview into an editing surface: clicking a rendered element selects
it, text can be edited in place, and components can be dragged into the live render. Because the
render lives in a cross-origin iframe owned by the host storefront, all of this runs over a narrow,
versioned message protocol. Implemented by
`page-editor/src/components/page-builder/use-preview-bridge.ts` and
`preview/preview-bridge.ts`, `preview-overlay.tsx`, `preview-drop-layer.tsx`, with the host half in
`packages/page-builder/src/react/visual-editing-bridge.tsx`.

## Requirements

### Requirement: Versioned, channel-scoped protocol

All bridge traffic SHALL be carried on a named channel with an explicit protocol version, and any
message not matching the channel MUST be ignored.

#### Scenario: Foreign message on the window

- **WHEN** an unrelated postMessage arrives that does not carry the bridge channel
- **THEN** it is ignored entirely

### Requirement: Origin restriction

The bridge MUST verify the origin of inbound messages and MUST NOT broadcast outbound messages to a
wildcard origin.

#### Scenario: Message from an unexpected origin

- **WHEN** a bridge-shaped message arrives from an origin other than the expected host
- **THEN** it is rejected

### Requirement: Handshake and capability negotiation

The host SHALL announce readiness with the set of capabilities it supports and the component registry
it implements, and the editor MUST only offer the interactions the host has advertised.

#### Scenario: Host advertises a subset

- **WHEN** the host announces readiness without the inline-text capability
- **THEN** the editor does not offer in-place text editing for that preview

### Requirement: Selection from the render

Clicking or hovering an element in the render SHALL drive the editor's selection and hover state, and
selecting MUST open that element's settings.

#### Scenario: Clicking a rendered element

- **WHEN** the host reports a selection for an element id present in the page
- **THEN** that element becomes the current selection and its settings are shown

#### Scenario: Clicking an element the editor does not know

- **WHEN** the host reports a selection for an id that does not exist in the page
- **THEN** the selection is unchanged

### Requirement: Highlighting and scrolling from the editor

The editor SHALL be able to ask the host to highlight an element and to scroll it into view, so
selecting in the outline or the canvas is reflected in the render.

#### Scenario: Selecting in the outline

- **WHEN** the author selects an element in the outline while in preview
- **THEN** the host is asked to highlight it and bring it into view

### Requirement: Geometry-driven overlay

The editor SHALL draw its selection and hover affordances as an overlay positioned from element
geometry reported by the host, and MUST be able to request fresh geometry.

#### Scenario: Render changes shape

- **WHEN** the rendered document's size changes
- **THEN** the editor requests fresh geometry so the overlay stays aligned with the render

### Requirement: On-render element toolbar

The overlay SHALL offer actions on the selected element: commenting on it, duplicating it, and
deleting it.

#### Scenario: Deleting from the render

- **WHEN** the author deletes the selected element from the overlay toolbar
- **THEN** it is removed from the page and the render is refreshed to match

### Requirement: In-place text editing

Where the host advertises inline text editing, a committed text edit SHALL be written into the
component's settings under the edited field key, honouring the active preview locale for a localized
field.

#### Scenario: Committing an inline edit on a localized field

- **WHEN** the host reports a field commit for a localized field while previewing in a given locale
- **THEN** the value is stored for that locale only, leaving the other locales untouched

### Requirement: Dragging components into the render

Where the host advertises dropzones, the author SHALL be able to drag a component from the palette
onto the live render, using dropzone geometry reported by the host to decide the target.

#### Scenario: Dropping onto a reported dropzone

- **WHEN** the author releases a dragged palette component over a host-reported dropzone
- **THEN** a component of that type is inserted at that dropzone's position in the page

### Requirement: Reordering within the render

Where the host advertises drag and drop, the host SHALL be able to report a reorder, and the editor
MUST apply it to the page.

#### Scenario: Reordering inside one layout row

- **WHEN** the host reports a drop that moves an element within the row it already belongs to
- **THEN** the target index is adjusted for the element's removal so it lands where the author
  intended

### Requirement: Autosave and refresh loop

While previewing, a page edit SHALL be saved on a short debounce and the host then asked to refresh,
so the render tracks the author's changes without a manual save.

#### Scenario: Editing while previewing

- **WHEN** the author makes an edit in preview mode and pauses briefly
- **THEN** the draft is saved and the host is asked to re-render

### Requirement: Degradation without a bridge

When no bridge connection is established, the preview MUST remain usable as a read-only render rather
than appearing broken.

#### Scenario: Host has not integrated the bridge

- **WHEN** the previewed host never announces readiness
- **THEN** the preview still displays the rendered page, and the editing affordances are simply absent
