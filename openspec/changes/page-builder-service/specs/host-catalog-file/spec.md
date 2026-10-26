## ADDED Requirements

### Requirement: Host-owned catalog JSON
The catalog SHALL be a plain JSON document owned by the host, containing component types with schemas, data-source types with built-in resolver kinds and schemas, section presets, per-component `inlineTextFields`, and theme tokens.

#### Scenario: Authoring without helpers
- **WHEN** a host writes the catalog JSON by hand or generates it with its own tooling
- **THEN** it is accepted if it satisfies the validation rules, with no SDK helper required

### Requirement: Validation rules
Validation SHALL reject duplicate type keys, unknown schema field kinds, unknown resolver kinds, dangling data-source references, invalid group keys, and unresolved icon names, listing all violations in one response.

#### Scenario: Unknown resolver kind
- **WHEN** a data source names a resolver kind the service does not provide
- **THEN** validation fails naming that entry

#### Scenario: Multiple errors
- **WHEN** a catalog contains several violations
- **THEN** all of them are reported together

### Requirement: Push is a CI step
The catalog SHALL be delivered by an authenticated HTTP call from the host's CI or deploy pipeline, followed by an explicit publish call, in the order deploy host, push catalog, publish.

#### Scenario: Deploy ordering
- **WHEN** a host deploys a new component that is in the catalog
- **THEN** the catalog is pushed and published after the host deploy so the palette never offers a component the host cannot render

### Requirement: Dry-run validation
The service SHALL provide a validate-only call that returns the same results as push without writing.

#### Scenario: Validate in CI
- **WHEN** CI calls validate-only with a catalog
- **THEN** violations are returned and nothing is written
