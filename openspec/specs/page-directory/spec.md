# Page Directory

## Purpose

The `/pages` route is the entry point of the application: it presents every page an author can
edit as a single browsable tree, shows at a glance whether each page is published or only
drafted, and hands off to the Page Builder. It is the only surface that reconciles three
different sources of pages into one list. Implemented by `page-editor/src/components/pages/`
(`pages.tsx`, `use-merged-page-tree.ts`, `page-tree-row.tsx`, `state-tag.tsx`, `page-detail.tsx`,
`page-detail-parts/`, `use-page-detail-data.ts`).

## Requirements

### Requirement: Merged page tree

The directory SHALL present one tree merged from three sources: the static `PAGE_TREE`
skeleton (`Homepage` and `All categories`), the live commercetools category tree grafted as the
children of the `cat-root` node, and a synthetic content-pages folder holding arbitrary pages
that have actually been built.

#### Scenario: Categories are grafted under the category root

- **WHEN** the category fetcher resolves with at least one category node
- **THEN** those nodes replace the `cat-root` node's children
- **AND** the rest of the static skeleton is left unchanged

#### Scenario: Category tree unavailable

- **WHEN** the category fetcher is still loading, or resolves with zero nodes
- **THEN** the `cat-root` node keeps its statically declared children rather than rendering empty

#### Scenario: Content-page folder appears only when needed

- **WHEN** at least one built page is neither a reserved id (`home`, `cat-root`,
  `pdp-cat-root`), nor prefixed `pdp-`, nor a known category id, nor typed `category` or `pdp`
- **THEN** a `__content__` folder node is appended to the tree containing those pages
- **AND** when no such page exists the folder is omitted entirely

### Requirement: Tree search

The directory SHALL let the user filter the tree by text, keeping ancestors of matches visible
so a match nested inside collapsed folders is reachable.

#### Scenario: Filtering to matches

- **WHEN** the user types a query into the tree search field
- **THEN** only nodes matching the query and the ancestor path leading to them remain visible
- **AND** the branches containing matches are expanded

### Requirement: Per-node state and assignment badges

Each tree row SHALL communicate the page's publication state and, for category nodes, which
assignment it carries.

#### Scenario: Publication state badge

- **WHEN** a page's resolved state is `published`
- **THEN** the row shows a positive-toned badge
- **AND** any other non-empty state (for example a draft that has never been published) shows a
  warning-toned badge
- **AND** a page with no state at all shows no badge

#### Scenario: Category assignment badge

- **WHEN** a category node has a dedicated PLP page, a PDP override, or both
- **THEN** the row is badged accordingly, and a category relying on an inherited page is marked
  as a fallback rather than as its own page

### Requirement: Page detail panel

Selecting a node SHALL open a detail panel describing that page: an About card (slug, page
type, a deep link to the linked commercetools category, markets, languages, last edited), an
assignment card (state, version, published date, count of unpublished changes), and a read-only
recent-activity list.

#### Scenario: Recent activity is capped and newest-first

- **WHEN** the selected page has a draft version history
- **THEN** the panel lists at most the 5 most recent versions, newest first
- **AND** each entry distinguishes a plain save from a publish

#### Scenario: Version history is read-only

- **WHEN** the user views the recent-activity list
- **THEN** no affordance is offered to restore or preview an individual past version

### Requirement: PLP and PDP surface toggle

For a category node the panel SHALL offer a toggle between the category listing page and the
product detail page, and report for each whether it is a dedicated page or an inherited
fallback.

#### Scenario: Switching to the PDP surface

- **WHEN** the user selects the PDP side of the toggle on a category node
- **THEN** the panel describes the PDP override for that category
- **AND** the assignment state distinguishes an existing override from inheriting the global PDP

### Requirement: Deep-linkable selection

The directory SHALL encode the selected node and the active surface in the URL so a page can be
linked to and so returning from the Page Builder restores the previous position.

#### Scenario: Selecting a node updates the URL

- **WHEN** the user selects a tree node
- **THEN** the `node` query parameter is set to that node's id
- **AND** the `view` parameter is cleared so the surface falls back to its default

#### Scenario: Restoring from the URL

- **WHEN** the route is entered with `?node=<id>&view=pdp`
- **THEN** that node is selected, the tree is expanded to reveal it, and the PDP surface is active
- **AND** a request with no `view` parameter defaults to the PLP surface
