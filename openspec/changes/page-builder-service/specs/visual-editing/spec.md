## MODIFIED Requirements

### Requirement: Handshake and capability negotiation
The host SHALL announce readiness with the set of capabilities it supports and the component registry it implements, and the editor MUST only offer the interactions the host has advertised. The shim derives the announced registry from its component map and the editable text fields from the catalog served by the service, and takes the allowed editor origins from the render response.

#### Scenario: Host advertises a subset
- **WHEN** the host announces readiness without the inline-text capability
- **THEN** the editor does not offer in-place text editing for that preview

#### Scenario: Origins come from the service
- **WHEN** the shim mounts the bridge in edit mode
- **THEN** the allowed origins used for validation are those returned by the service, not host configuration
