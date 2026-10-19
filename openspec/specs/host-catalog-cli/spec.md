# Host Catalog CLI

## Purpose

The `page-builder` command-line tool, shipped in the `@commercetools-labs/page-builder` package. It
is how the component, data-source and section vocabulary gets from host storefront code into
commercetools, where the editor reads it. Ownership runs one way: host code is the source of truth
and this tool is the only writer of those three catalog objects. Implemented by
`packages/page-builder/src/cli.ts`, `src/commands/`, `src/catalog/`, and `src/core/`.

## Requirements

### Requirement: Commands

The tool SHALL provide five commands: `init` to scaffold catalog and registry files into a host
project, `validate` to check an authored catalog, `sync` to write it into commercetools as a draft,
`publish` to promote that draft, and `pull` to read a catalog back out. Every command MUST support a
help flag.

#### Scenario: No command given

- **WHEN** the tool is invoked with no command, or with a help flag
- **THEN** usage is printed rather than any action being taken

### Requirement: Scaffolding is non-destructive

`init` MUST write only files that do not already exist, unless explicitly forced, so re-running it in
a project that has begun customizing the scaffold cannot silently discard that work.

#### Scenario: Re-running init

- **WHEN** `init` runs in a project where some scaffold files already exist
- **THEN** the existing files are left untouched and only missing ones are written

#### Scenario: Forcing an overwrite

- **WHEN** `init` runs with the force flag
- **THEN** existing scaffold files are overwritten

### Requirement: Catalog validation rules

`validate` MUST reject a catalog that violates any of the following, reporting each problem: a
duplicate component type key, a duplicate data-source type key, a duplicate section id, a field with
no key, a field of an unrecognized kind, a page type outside the allowed set, a `groupKey` that
resolves to no declared group, a data-source field whose declared type resolves to no declared
source, and a group field nested inside another group field.

#### Scenario: Duplicate type key

- **WHEN** two components declare the same type key
- **THEN** validation reports a duplicate and fails

#### Scenario: Unresolvable group reference

- **WHEN** a component declares a group key that no declared group provides
- **THEN** validation reports it and fails

#### Scenario: Nested group field

- **WHEN** a field of kind group appears among another group field's children
- **THEN** validation reports it and fails

#### Scenario: Ignored children

- **WHEN** a field that is not of kind group declares children
- **THEN** validation warns that the children are ignored, without failing

### Requirement: Sync validates before it writes

`sync` MUST run validation as a hard gate and MUST NOT write anything if validation produced any
error.

#### Scenario: Syncing an invalid catalog

- **WHEN** `sync` is run against a catalog with a validation error
- **THEN** the command fails before any custom object is written

### Requirement: Sync writes drafts only

`sync` SHALL append to the draft history of each catalog object and MUST NOT alter the published
payload, so that pushing definitions is separable from making them live.

#### Scenario: Syncing does not go live

- **WHEN** `sync` completes
- **THEN** the editor's palette is unchanged until `publish` is run, because the editor reads the
  published payload

### Requirement: Sync is idempotent

Each catalog version SHALL carry a hash over its canonical payload, and a sync whose payload matches
the current draft head MUST be reported as unchanged without writing.

#### Scenario: Syncing an unchanged catalog

- **WHEN** `sync` runs twice with no change to the authored catalog
- **THEN** the second run writes nothing and reports the key as unchanged

### Requirement: Catalog history is appended and capped

Sync MUST append to history rather than resetting it, cap the history at 50 versions by dropping the
oldest, and advance the head pointer and version number monotonically.

#### Scenario: Exceeding the cap

- **WHEN** a catalog already holds 50 draft versions and a changed catalog is synced
- **THEN** the new version is appended and the oldest discarded

### Requirement: Publish promotes the draft head

`publish` SHALL copy the current draft head into the published payload and stamp it with a publish
timestamp, and MUST report a key with no draft head as having nothing to publish.

#### Scenario: Publishing with no draft

- **WHEN** `publish` runs for a key that has never been synced
- **THEN** it reports nothing to publish for that key rather than failing

### Requirement: Writes use optimistic concurrency

Every write MUST pass the version it read, so a concurrent modification is rejected by the platform
rather than silently overwritten.

#### Scenario: Concurrent modification

- **WHEN** a catalog object changes between the tool's read and its write
- **THEN** the write is rejected

### Requirement: Per-key writes are concurrent and not transactional

Because each catalog key is an independent object, `sync` and `publish` MAY process keys
concurrently. Neither command is transactional, and callers MUST NOT assume atomicity across keys: a
failure part way through leaves the keys that already succeeded written.

#### Scenario: Partial failure

- **WHEN** `sync` fails on one key after another has been written
- **THEN** the successful key remains written and is not rolled back

### Requirement: Dry run and key selection

All writing commands SHALL support a dry run that reports what would change without writing, and a
selection flag restricting the run to named keys.

#### Scenario: Dry run

- **WHEN** `sync` is run as a dry run
- **THEN** the per-key outcome is reported and nothing is written

#### Scenario: Restricting to one key

- **WHEN** a run is restricted to the components key
- **THEN** the data-source and section keys are left alone

### Requirement: Pull reads a catalog back out

`pull` SHALL write the stored catalog to disk, and MUST be able to emit typed source stubs so a
catalog originally authored in commercetools can be moved into host code once.

#### Scenario: Emitting stubs

- **WHEN** `pull` is run with the stubs option
- **THEN** typed source is written that a host project can adopt as its authored catalog

### Requirement: Credentials come from the environment

The tool SHALL take its commercetools credentials from the environment, loading a local environment
file by default and honouring an explicit path, and MUST default its scope to managing key-value
documents for the target project.

#### Scenario: Missing credentials

- **WHEN** a required credential variable is absent
- **THEN** the command fails with that variable identified, rather than attempting an unauthenticated
  call

### Requirement: Deployment ordering

Operators SHALL deploy host code before syncing, and publish only after syncing, so the editor never
offers a component type the deployed storefront cannot render.

#### Scenario: Publishing ahead of a deploy

- **WHEN** a catalog is published before the host implementing those types is deployed
- **THEN** authors can place components the storefront cannot render, which is why the documented
  order is deploy, then sync, then publish
