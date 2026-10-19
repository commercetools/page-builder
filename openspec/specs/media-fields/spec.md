# Media Fields

## Purpose

Image and video fields on a component are backed by an external media service rather than a plain
URL box, so an author can browse and upload assets instead of pasting links. The integration is
optional: an unconfigured deployment must degrade visibly rather than break the settings pane.
Implemented by `page-editor/src/components/page-builder/shared/media-field.tsx`,
`shared/image-picker-host.tsx`, and `page-editor/src/hooks/use-image-picker-token`.

## Requirements

### Requirement: Media picker for image and video fields

Schema fields of kind `image` and `video` SHALL render a picker that can both browse the media
library and upload a new asset, and the video variant MUST accept files that are not images.

#### Scenario: Picking an existing asset

- **WHEN** the author opens an image field and selects an asset from the library
- **THEN** the field takes that asset's URL as its value

#### Scenario: Video field presentation

- **WHEN** the field is of kind `video`
- **THEN** the picker accepts any file rather than images only, and no image thumbnail is shown for
  the selection

### Requirement: The stored value stays a plain URL

A media field MUST store nothing but the asset URL, so that the page payload, the render transform
and the storefront hosts are unaffected by where the asset came from.

#### Scenario: Downstream compatibility

- **WHEN** a media field's value is read by the transform or a storefront host
- **THEN** it is an ordinary URL string, indistinguishable from a hand-pasted one

### Requirement: Service credentials come from a shared custom object

The service token SHALL be read from the custom object that the companion media application writes,
under container `contentools-configuration` and key `contentools-jwt-token`, and a refreshed token
MUST be written back so both applications stay in step.

#### Scenario: Token present

- **WHEN** the shared custom object holds a valid token
- **THEN** the picker can browse and upload without prompting the author for credentials

### Requirement: Graceful degradation when unconfigured

When no media service base URL is configured, the field MUST NOT render the picker, and SHALL
instead show that the feature is not configured.

#### Scenario: No base URL configured

- **WHEN** the deployment has no media service base URL set
- **THEN** the field renders a "not configured" note in place of the picker, and the rest of the
  settings pane continues to work
