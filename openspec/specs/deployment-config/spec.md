# Deployment Configuration

## Purpose

How this repository's parts are configured and shipped, and which behaviors are switched on or off by
deployment configuration. Several features are optional by design and must disappear cleanly when
their configuration is absent. Defined by `connect.yaml`, `netlify.toml`,
and `page-editor/custom-application-config.mjs`.

## Requirements

### Requirement: Merchant Center application deployment

The editor SHALL be deployable as a single Merchant Center custom application, configured entirely
through standard configuration values, with no secured configuration and no commercetools API
credentials of its own — it acts through the operator's Merchant Center session.

#### Scenario: Deploying the application

- **WHEN** the application is deployed
- **THEN** it is configured with an application id, an entry point path, an initial project key and a
  cloud identifier as required values, and needs no API client secret

### Requirement: Optional features are configuration switches

The media picker and the media storage namespace SHALL be optional configuration.
Leaving a feature's value empty MUST disable that feature cleanly rather than producing an error.

#### Scenario: Media picker not configured

- **WHEN** no media service base URL is configured
- **THEN** media fields report themselves as not configured and the rest of the editor is unaffected

#### Scenario: Media namespace omitted

- **WHEN** no media business unit key is configured
- **THEN** a default namespace is used

### Requirement: Static hosting alternative

The editor SHALL also be deployable as a static build served with a single-page-application fallback,
so every in-application route resolves when entered directly.

#### Scenario: Deep link into a route

- **WHEN** a user opens an application route directly in a static deployment
- **THEN** the request is served the application shell rather than a not-found response

### Requirement: Navigation exposes only the author-facing routes

The application menu SHALL link only to the pages and workflows routes. The maintenance reset route
MUST NOT be listed.

#### Scenario: Menu contents

- **WHEN** the application is registered with the Merchant Center
- **THEN** it declares a Pages link and a Workflows link, and nothing for the reset route

### Requirement: Content security policy allowances

The application's declared content security policy MUST permit the origins the features actually need:
storefront origins for the preview frame and its bridge, the media service origin for
requests, and the asset hosts for images.

#### Scenario: Previewing a storefront

- **WHEN** the preview frame loads a storefront on a permitted origin
- **THEN** it is allowed to be framed and to be communicated with

### Requirement: The other components deploy out of band

Only the Merchant Center application is described by this repository's deployment configuration. The
host SDK package and the seed scripts SHALL each be released by their own
route: the SDK to the npm registry, and the seed scripts run by an operator on demand.

#### Scenario: Releasing the SDK

- **WHEN** the host SDK changes
- **THEN** it is published to the registry and consumed by storefront repositories, whose own
  pipelines run the sync and publish steps
