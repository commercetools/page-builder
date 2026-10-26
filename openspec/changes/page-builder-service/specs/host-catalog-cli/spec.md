## REMOVED Requirements

### Requirement: Commands
**Reason**: The `page-builder` CLI is removed; its work is performed by catalog push/validate/publish calls to the service.
**Migration**: Use `POST /v1/catalog`, `/v1/catalog/validate`, `/v1/catalog/publish` from CI (see `host-catalog-file`).

### Requirement: Scaffolding is non-destructive
**Reason**: `init` is removed; the integration is a component map plus a catalog JSON.
**Migration**: Follow the 1.0 migration guide.

### Requirement: Sync validates before it writes
**Reason**: Behavior moves to the service ingest endpoint.
**Migration**: Use the catalog push call.

### Requirement: Sync writes drafts only
**Reason**: Behavior moves to the service ingest endpoint.
**Migration**: Use the catalog push call.

### Requirement: Sync is idempotent
**Reason**: Behavior moves to the service ingest endpoint.
**Migration**: Use the catalog push call.

### Requirement: Publish promotes the draft head
**Reason**: Behavior moves to the service publish endpoint.
**Migration**: Use the catalog publish call.

### Requirement: Pull reads a catalog back out
**Reason**: Catalog is host-owned JSON; the service exposes it via a read endpoint instead.
**Migration**: Use `GET /v1/catalog`.

### Requirement: Credentials come from the environment
**Reason**: Hosts no longer hold commercetools credentials; CI holds the service admin secret.
**Migration**: Remove `CTP_*` variables from host CI; add the service URL and admin secret.
