## ADDED Requirements

### Requirement: The service is the sole writer and reader
The page-builder service SHALL be the only component that reads and writes the page-builder custom-object containers; the MC app and storefronts access them only through the service API.

#### Scenario: MC app saves a page
- **WHEN** the MC app saves a page
- **THEN** the save is a service API call and the MC app issues no direct custom-object mutation

#### Scenario: Permissions
- **WHEN** a user without `manage_key_value_documents` edits pages through the MC app
- **THEN** the edit succeeds if the service authorizes the user's role

### Requirement: Storage layout is unchanged by the service
The container layout and `schemaVersion` SHALL remain as defined by this capability, so that existing projects need no data migration to adopt the service.

#### Scenario: Existing project adopts the service
- **WHEN** the service is deployed against a project with existing page-builder objects
- **THEN** it reads and writes them without a data migration
