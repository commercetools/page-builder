## MODIFIED Requirements

### Requirement: Preview requires a matching token
A request MUST be treated as a preview only when its preview parameter equals the service's configured preview token; the host forwards the parameter and does not validate it.

#### Scenario: Correct token
- **WHEN** a request carries a preview parameter equal to the service's configured token
- **THEN** the service reports it as a preview and serves draft content

#### Scenario: Wrong or absent token
- **WHEN** the preview parameter is missing or does not match
- **THEN** the request is not a preview and published content is served

#### Scenario: No token configured
- **WHEN** the service has no preview token configured
- **THEN** no request can qualify as a preview, so the feature is closed by default

### Requirement: Edit mode implies a valid preview
Edit mode MUST require a valid preview request in addition to its own parameter, so that the edit parameter alone can never place a shopper into edit mode. The service decides and reports `editMode` in the render response.

#### Scenario: Edit parameter without a valid token
- **WHEN** a request carries the edit parameter but no valid preview token
- **THEN** the service reports editMode as false

### Requirement: One validated configuration accessor
The host environment contract SHALL consist of the service URL and an optional render key, read through a single accessor in the shim; allowed origins, the preview token and commercetools credentials are service configuration, not host configuration.

#### Scenario: Missing service URL
- **WHEN** the service URL is not configured
- **THEN** the shim reports a clear configuration error in development and renders the fallback in production

## REMOVED Requirements

### Requirement: Forgetting to thread search parameters is a compile error
**Reason**: The shim reads the request's search parameters itself; hosts no longer thread them.
**Migration**: Remove manual `searchParams` plumbing.

### Requirement: The editor's page identity wins over the route
**Reason**: Enforced by the service (see `page-builder-service`).
**Migration**: None for hosts.
