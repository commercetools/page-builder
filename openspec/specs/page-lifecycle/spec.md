# Page Lifecycle

## Purpose

Creating and removing the page objects behind the directory. Three distinct creation paths exist
— an arbitrary content page authored from scratch, a dedicated page for a category that
currently inherits a fallback, and a PDP override — and each has different validation and
seeding rules. Implemented by `page-editor/src/components/pages/create-page-drawer.tsx`,
`create-dedicated-page-dialog.tsx`, `use-page-deletion.ts`, and
`page-editor/src/components/page-builder/page-path.ts`.

## Requirements

### Requirement: Slug normalization for new pages

The system SHALL normalize free-text input into a single-segment slug before validating it, so
that ordinary prose typed as a page name yields a usable URL segment.

#### Scenario: Free text becomes a slug

- **WHEN** the author types a name containing capitals, spaces, underscores, or characters
  outside `[a-z0-9-]`
- **THEN** the slug is lowercased, leading and trailing slashes are stripped, spaces and
  underscores become hyphens, unsafe characters are dropped, repeated hyphens are collapsed, and
  leading or trailing hyphens are trimmed

### Requirement: Arbitrary page slug validation

The system MUST reject a new page slug that is empty, malformed, reserved, or already taken, and
MUST report which of those applies rather than failing generically.

#### Scenario: Malformed slug

- **WHEN** the candidate slug does not match a sequence of lowercase alphanumeric groups
  separated by single hyphens
- **THEN** validation fails with a format reason and the page is not created

#### Scenario: Slug reserved by a route template or a host segment

- **WHEN** the candidate slug collides with the first segment of a configured preview route
  template, with a known host-static segment (`account`, `cart`, `checkout`, `search`, `login`,
  `register`, `forgot-password`, `reset-password`), or with a commercetools category id
- **THEN** validation fails with a reserved reason

#### Scenario: Duplicate slug

- **WHEN** the candidate slug matches an existing page id
- **THEN** validation fails with a duplicate reason

#### Scenario: Valid slug

- **WHEN** the candidate slug is well-formed, unreserved, and unused
- **THEN** validation succeeds, an empty draft page is created, and the author is taken directly
  into the Page Builder for it

### Requirement: Creating a dedicated page or PDP override

For a category that currently inherits a fallback, the system SHALL offer to create its own page
either empty or seeded as a copy of the fallback, and a seeded copy MUST be given fresh
component ids so it cannot share component objects with the page it was copied from.

#### Scenario: Seeding from the fallback

- **WHEN** the author chooses to copy from the fallback or global PDP
- **THEN** the fallback page tree is deep-copied with every component id re-minted
- **AND** the Page Builder opens with that content already loaded and marked dirty, so the author
  is prompted to save the copy before it exists in storage

#### Scenario: Starting empty

- **WHEN** the author chooses to start empty
- **THEN** the Page Builder opens with the page's sections present and no layout rows

### Requirement: Deleting a page assignment

Deleting SHALL remove the page object behind the currently active surface, which clears the
assignment and returns the storefront to its default, and MUST be offered only when there is
something to delete.

#### Scenario: Delete targets the active surface

- **WHEN** the PDP surface is active on a category node and the author confirms deletion
- **THEN** the PDP override object is deleted rather than the category's listing page

#### Scenario: Nothing to delete

- **WHEN** the active surface has no page object of its own
- **THEN** deletion is unavailable

#### Scenario: Deleting an arbitrary content page

- **WHEN** an arbitrary (non-category) page is deleted
- **THEN** the selection moves back to the Homepage node, because the deleted page no longer
  exists anywhere in the tree

#### Scenario: Deletion failure is surfaced

- **WHEN** the delete request fails
- **THEN** the confirmation stays open and reports the failure reason
