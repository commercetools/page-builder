# Page builder

A Merchant Center Custom Application that gives content and merchandising teams a visual way to build and manage storefront pages. Component types, data source types, and page-section presets are defined once in host (storefront) code and pushed in by the `@commercetools-demo/page-builder` npm package; content authors then compose pages from that catalog on a drag-and-drop canvas and publish — all stored as commercetools custom objects that the same npm package renders at request time in the storefront.

This repo serves two audiences:

- **Content/platform teams running this app** — see [Getting started](#getting-started) onward.
- **Storefront engineers integrating the rendering SDK** — see [Host integration](#host-integration).

## Overview

The app has two main areas:

| Area | Route | Purpose |
|---|---|---|
| **Pages** | `/pages` | Browse the page tree, inspect per-page builder status, and open the builder |
| **Page Builder** | `/builder/:pageId` | Drag-and-drop canvas for composing a page from layout sections, components, and data sources |

There is no in-app editor for component types, data source types, or section presets — those catalogs are authored in host code and synced in via the `@commercetools-demo/page-builder` CLI (see [Catalogs](#catalogs-components-data-sources-sections) and [Host integration](#host-integration)). This app only reads the *published* catalog to populate the Page Builder's palette, data-source picker, and section options.

Pages, and saved data source instances, still follow the same **draft → publish** pattern: every save appends to a version history inside that object's custom object; publishing updates the same object's `published` field, which is what the storefront reads.

---

## Table of contents

- [Getting started](#getting-started)
- [Development](#development)
- [Seeding data](#seeding-data)
- [Domain model](#domain-model)
- [Pages view](#pages-view)
- [Page Builder](#page-builder)
- [Catalogs: components, data sources, sections](#catalogs-components-data-sources-sections)
- [Host integration](#host-integration)
- [Custom objects](#custom-objects)
- [Roadmap and TODO](#roadmap-and-todo)
- [Project structure](#project-structure)

---

## Getting started

```bash
cd page-editor
yarn install
yarn start
```

The app is served at `http://localhost:3001` by default.

---

## Development

All dev commands run from the `page-editor/` directory:

| Command | Description |
|---|---|
| `yarn start` | Start the dev server |
| `yarn build` | Production build |
| `yarn typecheck` | TypeScript type check |
| `yarn lint` | ESLint |
| `yarn test` | Jest tests |
| `yarn format` | Prettier |

---

## Seeding data

Seed scripts live in `seed/` — a standalone directory separate from the webapp. They have no runtime dependencies and use only Node.js built-ins.

Components, data sources, and sections are normally supplied by host code via the `@commercetools-demo/page-builder` CLI (see [Host integration](#host-integration)) — these scripts are a quick way to put sample catalogs on a fresh CT project before a host repo exists. Pages need seeding (or authoring) either way.

### 1. Create a CT API client

In the Merchant Center go to **Settings → Developer → API clients** and create a client with the scope:

```
manage_key_value_documents:<your-project-key>
```

### 2. Create `seed/.env.seed`

Copy the example file and fill in your credentials:

```bash
cp seed/.env.seed.example seed/.env.seed
```

`seed/.env.seed` is git-ignored — never commit real credentials.

| Variable | Description |
|---|---|
| `CTP_PROJECT_KEY` | Your CT project key |
| `CTP_CLIENT_ID` | API client ID |
| `CTP_CLIENT_SECRET` | API client secret |
| `CTP_AUTH_URL` | Auth endpoint for your region (e.g. `https://auth.europe-west1.gcp.commercetools.com`) |
| `CTP_API_URL` | API endpoint for your region (e.g. `https://api.europe-west1.gcp.commercetools.com`) |

### 3. Run the seed scripts

From the `seed/` directory:

```bash
cd seed

# Seed everything at once (recommended for a fresh environment)
npm run all          # data sources + components + sections + pages, each already published

# Or seed individually:
npm run data-sources
npm run components
npm run sections
npm run pages         # every page in seed/data/pages/ (pass --page-id to seed just one)

# Pull the current catalog back down to disk, e.g. before editing it locally:
npm run download:all
npm run download:components
```

Additional flags (run scripts directly for more control):

```bash
# Use a different env file
node scripts/seed-pages.js --env .env.production.seed

# Seed a specific page
node scripts/seed-pages.js --page-id about

# Preview what would be sent without hitting the API
node scripts/seed-pages.js --dry-run
```

Each script fetches an OAuth token, then upserts one CT custom object holding both the draft history and the published state. On success it prints the CT `version` and `lastModifiedAt`.

Seed data lives in `seed/data/`:

| File / directory | Contents |
|---|---|
| `data-sources-seed.json` | Data source type catalog |
| `components-seed.json` | Component type catalog |
| `sections-seed.json` | Page-section presets (the HEAD/MAIN/FOOTER-style catalog) |
| `data-source-instances.json` | Example saved data source instances |
| `pages/*.json` | One file per seeded page (`home.json`, `cat-root.json`, `pdp-cat-root.json`, …) |

`seed/custom-objects.md` predates the current single-object-per-catalog shape — treat [Custom objects](#custom-objects) below as authoritative for container/key names.

---

## Domain model

### Page kinds

The page tree mixes several page kinds that are authored, bound, and rendered differently:

| Kind | Example | Notes |
|---|---|---|
| **Static page** | Homepage, About us, Size guide | Hand-authored, one canonical URL. |
| **Category page** (PLP) | Women → Dresses | Bound to a CT category. Renders the category landing. A category without a dedicated page falls back to *All categories*. |
| **Product detail page** (PDP) | `Product detail` template | Renders for every product. One global template by default; categories can have *PDP overrides* that apply to all products in that subtree. |
| **Dynamic page** | Search results | Driven by URL parameters at runtime. |
| **Folder** | "Shop", "Content" | Organisational only — no canvas. |

### Categories have two editable surfaces

Selecting a category in Pages exposes a **PLP / PDP** toggle. The right panel shows the metadata, status, and CTA for whichever surface is active:

- **Category page (PLP)** — the landing for that category.
  - *Dedicated* — the category has its own page in the builder.
  - *Fallback* — no dedicated page; renders the *All categories* fallback. A "Create dedicated page" CTA is shown.
- **Product detail page (PDP)** — applies to every product in the category subtree. Two states:
  - *Inherits global* — products render with the global PDP template. Options: "Create override" or "Edit global PDP".
  - *Override* — a category-specific PDP exists. A "Forked from global PDP" tag makes the lineage explicit.

### Shared mental model

Developers shape the **vocabulary** in host (storefront) code — a `catalog.ts` defines component types (what fields exist) and data source types (what data can be fetched), pushed into CT by the `@commercetools-demo/page-builder` CLI. Content authors **assemble** with it in this app — they drag components onto the canvas and bind saved data sources to component slots. The component, data-source, and section catalogs stored in CT custom objects are the single source of truth every host and this app share.

---

## Pages view

The Pages view (`/pages`) is the landing screen for content authors. It shows the full page tree — static pages, templates, and the category tree from the CT catalog — in a two-panel layout.

**Left panel — page tree**

- Displays all pages and category nodes in a collapsible tree.
- Each row shows a live **Draft** or **Published** badge derived from the CT custom objects for that page, so authors can see at a glance which pages have builder content and what state they are in.
- Category nodes that fall back to the root "All categories" page are marked as fallback.

**Right panel — page detail**

Selecting a node shows:

- **About** — slug, type, markets, languages, and last-saved date (from the draft history).
- **Page assignment** — live status, version, published date, and number of unpublished changes, all read from the draft/published custom objects.
- **Version history** — the five most recent saves, showing whether each was a draft save or a publish event.
- **Open in Page Builder** — navigates to the builder for that page. The button is disabled until builder content exists.

---

## Page Builder

The Page Builder (`/builder/:pageId`) is a drag-and-drop editor for composing a page from layout elements and components.

### Canvas sections

Every page is split into sections — by default **HEAD**, **MAIN**, and **FOOTER** — but the actual set comes from the `sections` catalog synced from host code (see [Catalogs](#catalogs-components-data-sources-sections)); the app falls back to the HEAD/MAIN/FOOTER default if that catalog is empty. Each section holds one or more *layout elements* (rows, grids, carousels, etc.) and each layout element holds one or more *component slots*.

### Element styles

Every layout and component element has a **Style** dropdown in its settings panel. The selected value is stored as a plain string on the element (`style` property) and is intended to be consumed by the storefront renderer to apply a visual theme.

The available options are defined centrally in:

```
src/components/page-builder/element-styles.ts
```

Each entry has an `id` (the stored value) and a localized `label` object:

```typescript
export const ELEMENT_STYLE_OPTIONS: ElementStyleOption[] = [
  {
    id: '',           // empty string = inherit from page (default)
    label: { 'en-US': 'Inherit from page', 'de-DE': 'Von Seite erben', ... },
  },
  {
    id: 'light',
    label: { 'en-US': 'Light', 'de-DE': 'Hell', ... },
  },
  // ...
];
```

The `id` values are constrained by the `ElementStyle` union type in `types.ts`:

```typescript
export type ElementStyle = '' | 'light' | 'dark' | 'accent' | 'muted' | 'charcoal' | 'sage';
```

**To add a new style:**

1. Add the new string literal to the `ElementStyle` union in `src/components/page-builder/types.ts`.
2. Add a matching entry (with all locale labels) to `ELEMENT_STYLE_OPTIONS` in `src/components/page-builder/element-styles.ts`.

### Menu bar

The menu bar is split into discrete affordances:

- **Back button** — returns to Pages, highlighting the originating category and restoring the PLP/PDP toggle state via `?node=` and `?view=` URL params.
- **Page name + icon** — identifies the page being edited.
- **Status pill** — color-coded by state (unsaved = amber, saved/draft = info, published = green). Shows the app version in monospace. The pill and the history icon in the top-right share one handler — a single, predictable entry point for version history.
- **Device switcher** — toggles the canvas max-width between desktop (1240 px), tablet (820 px), and mobile (390 px).
- **Undo / Redo** — step through in-session page history.
- **Save state indicator** — centered; shows a spinner while saving, a cloud icon once saved, or a pencil icon for unsaved changes.
- **Save split button** — primary action saves the draft; the dropdown option "Save and make live" saves then immediately publishes.
- **Publish button** — enabled whenever a saved draft has not yet been published (`publishedAt === null` on the latest draft version).

### Save & publish flow

- **Save Draft** — appends a new version to the page's draft history, stored alongside `published` in one combined custom object at key `page-<pageId>` (up to 50 versions retained). The new version always has `publishedAt: null`, which enables the Publish button.
- **Publish** — writes the current state to that same object's `published` field and marks the just-saved draft version with a `publishedAt` timestamp. After publishing, the Publish button is disabled until the next save.
- **Save and make live** — runs Save then Publish in sequence in a single action.

---

## Catalogs: components, data sources, sections

Component types, data source types, and section presets are **defined in host (storefront) code, not in this app**. A host's `catalog.ts` declares them with the SDK's `defineBlock`/`defineDataSource` helpers, and the `@commercetools-demo/page-builder` CLI pushes them into this app's CT project as three custom objects — `components`, `data-sources`, `sections` — that the Page Builder canvas reads to populate its component palette, data-source picker, and section options. See [Host integration](#host-integration) for how a host defines and syncs them.

There's no separate editor screen for these in this app — if a catalog hasn't been synced yet, its palette/picker is simply empty.

### Concepts

| Term | Meaning |
|---|---|
| **Component type** | A reusable building block (e.g. `hero`, `productGrid`). Identified by a unique `type` key. |
| **Data source type** | A template describing what data is fetched and what configuration it needs (e.g. `commercetools/product-list`). Identified by a unique `type` key. |
| **Section** | A named top-level canvas region (default: HEAD/MAIN/FOOTER) a page's layout elements are grouped into. |
| **Schema** | The list of editable fields belonging to a component or data source type. |
| **Group** | A label used to organise types in their palette/catalog (e.g. `content`, `commerce`, `product`, `category`). |
| **Saved data source** | An in-app, named instance of a data source type with filled-in field values — see below. |

### Schema field kinds

Component and data source schemas share the same field vocabulary:

| Kind | Description | Extra options |
|---|---|---|
| `text` | Single-line text | `localized: true` for per-locale values |
| `richtext` | Multi-line rich text (bold, italic, links) | `localized: true` |
| `number` | Numeric value | — |
| `boolean` | On/off toggle | — |
| `select` | Dropdown — choose from a fixed option list | `options: [{key, label}]`, `localized: true` for per-locale labels |
| `image` | Image URL / asset reference | — |
| `link` | URL / navigation target | — |
| `group` | Repeatable list of sub-fields | `children: SchemaField[]` — nesting is one level deep |
| `dataSource` | Bind a saved data source (e.g. a product list query) — components only | `dataSourceType` to restrict which data source types are allowed |

All field kinds also accept `key` (unique identifier, used as the settings key in the page JSON), `label` (`string \| LocalizedString`), and `required` (`boolean`).

```jsonc
// Plain text, localized
{ "key": "title", "label": "Title", "kind": "text", "localized": true }

// Fixed-option select
{ "key": "ratio", "label": "Aspect ratio", "kind": "select",
  "options": [{ "key": "16:9", "label": "16:9" }, { "key": "4:3", "label": "4:3" }]
}

// Group — repeatable list of sub-fields (one level deep)
{ "key": "slides", "label": "Slides", "kind": "group",
  "children": [
    { "key": "headline", "label": "Headline", "kind": "text" },
    { "key": "image", "label": "Image", "kind": "image" }
  ]
}

// Data source — binds a saved query/feed at page-edit time (components only)
// omit dataSourceType to accept any type
{ "key": "products", "label": "Products", "kind": "dataSource",
  "dataSourceType": "commercetools/product-list" }
```

### Saved data source instances

Unlike the *types* above, saved **instances** are still authored directly in this app, inside the Page Builder canvas. A saved instance is a named, configured copy of a data source type (e.g. *"Bestsellers — homepage"*), reusable across pages; a component's `dataSource` field stores the saved instance's `id`.

The configure-data-source dialog has three modes:

- **Use saved** — pick from existing saved instances of the matching type; each row has its own Edit button.
- **Create new** — name + schema form; submitting creates a fresh instance.
- **Edit configuration** — opens with the saved instance pre-filled. *Save changes* updates it in place (propagates to every page binding that references it); *Save as copy* forks into a new instance — the right choice when other pages depend on the current values.

A `savedForReuse: true` instance is a shared, project-wide resource — editing in place propagates everywhere, so *Save as copy* is the only way to diverge without breaking sibling bindings.

---

## Host integration

Storefronts render page-builder content, and push their component/data-source/section catalog into this app, via the **`@commercetools-demo/page-builder`** npm package (`packages/page-builder` in this repo). Full API reference: [`packages/page-builder/README.md`](packages/page-builder/README.md). Normative contract: [`docs/sdd/definitions-contract.md`](docs/sdd/definitions-contract.md).

```sh
npm i @commercetools-demo/page-builder
```

### Scaffold a new integration

```sh
npx @commercetools-demo/page-builder init
```

Copies a starter `catalog.ts` + `registry.tsx` + `sections.tsx` + bridge mount + placeholder blocks + `.env.example` into the current repo — new files only, never edits existing code.

### Wire it up

1. **Tailwind** — add the package to `@source` and safelist the render grid's dynamic `{block,hidden}` / breakpoint / `col-span-*` classes.
2. **Types** — re-export `LayoutSection`, `LayoutElement`, `ItemProps`, etc. from the package instead of keeping local copies.
3. **Catalog** (`lib/page-builder/catalog.ts`) — define blocks with `defineBlock`; a block's `type` must match what's stored in page objects.
4. **Registry** (`lib/page-builder/registry.tsx`) — `buildRegistry(blocks, components, { resolvers, systemComponents })`. A missing or stray palette component is a **compile error**, not a silent placeholder.
5. **Sections** (`lib/page-builder/sections.tsx`) — bind everything once: `createPageBuilderSections(registry, { sectionBg, getCustomObjectValue })`.
6. **Routes** — every route (home/category/PDP/content) mounts `<Sections pageType params searchParams>{fallback}</Sections>` identically; skipping `params`/`searchParams` is a type error, not a silent no-op.
7. **Inline text** — render editable fields with `<PBText field value as html? />` instead of raw markup.
8. **Bridge** — mount `<BridgeMount allowedOrigins components />` once in the root layout. `PB_ALLOWED_ORIGINS` must match this app's **exact runtime origin**, scheme included — the most common reason the bridge silently never connects.
9. **Sync the catalog** — pushes your `components`/`data-sources`/`sections` definitions into this app's CT project, the same container/keys the Page Builder reads (see [Catalogs](#catalogs-components-data-sources-sections)):
   ```sh
   npm run pb:build-catalog   # regenerate page-builder.catalog.json from catalog.ts
   npm run pb:sync            # push as draft (idempotent)
   npm run pb:publish         # promote draft → published
   ```
   The API client needs `manage_key_value_documents` granted in Merchant Center, in addition to whatever it already needs for the storefront runtime.
10. **Seed a page** — pages are read from CT container `page-editor`, key `page-<id>` — the same object this app's Page Builder writes to (see [Custom objects](#custom-objects)).

### Storage contract

Pages and all three catalogs live in **one CT container, `page-editor`**. Catalog keys are `components` / `data-sources` / `sections`; page content is `page-<id>`. Don't invent a different container or key — a storefront reading from anywhere else will still render, but this app's preview/click-to-select will never match it up (an "id-mismatch" banner, or hovering/clicking that does nothing).

### Verify

```sh
npx tsc --noEmit       # registry/type drift and missed searchParams wiring are compile errors here
```
Then run the storefront and confirm: `data-section-id` is present (rendering via the SDK, not a fallback), there are zero `Unknown block type` occurrences, and — with a valid preview/edit URL — hovering and clicking a rendered element in this app's Page Builder preview highlights it and opens the properties panel.

---

## Custom objects

All app data is stored in CT custom objects under one container, `page-editor`. Each object holds both the draft version history and the current published state together (schema v2: `{ schemaVersion, draft: { versions: [...] }, published: {...} | null }`):

| Object | Key | Owner |
|---|---|---|
| Component type catalog | `components` | Host code, via `page-builder sync`/`publish` — read-only in this app |
| Data source type catalog | `data-sources` | Host code, via `page-builder sync`/`publish` — read-only in this app |
| Section catalog | `sections` | Host code, via `page-builder sync`/`publish` — read-only in this app |
| Saved data source instances | `data-source-instances` | This app (Page Builder canvas) |
| Page content | `page-<pageId>` (e.g. `page-home`) | This app (Pages / Page Builder) |

Every save appends a new entry to `draft.versions[]` (capped at 50); publishing copies the current draft into `published` and stamps it with `publishedAt`. The storefront, and this app's Page Builder for the three catalogs, only ever read `published`.

`seed/custom-objects.md` predates this shape (it still documents separate `*-draft`/`*-published` objects) — treat the table above as authoritative.

---

## Roadmap and TODO

Known gaps identified during a codebase review (July 2026), grouped by priority. Not yet scheduled — tracked here so they aren't lost.

### Delivery / last mile

- [ ] **Ship a committed storefront consumer.** Publishing only writes the `page-<id>` custom object (`use-page-builder-connector.ts`); the `@commercetools-demo/page-builder` SDK can render it, but no running host in this repo actually reads published objects, and the reference hosts have `DYNAMIC_PAGES` off (hardcoded fallbacks). Wire at least one host to read live published pages end-to-end.
- [ ] **Media library / asset upload.** Image fields are URL-paste only (`shared/field-editor.tsx`) — add file upload and an asset picker.
- [ ] **In-app dynamic-data resolution (at least for preview).** Dynamic pages store product/category IDs but never resolve them in-app; resolution is deferred entirely to the host.

### Robustness

- [ ] **Handle version conflicts on save/publish.** The main path passes a stale `ctVersion` and never refetches on a 409 (`page-builder.tsx` save/publish handlers), so retries keep failing until a full reload. Reuse the read-modify-retry pattern already in `use-comments-connector.ts`.
- [ ] **Surface real error causes.** Save/publish/workflow handlers discard the structured error from `extractErrorFromGraphQlResponse` in bare `catch {}` and show a generic toast — show the actual reason (permission / validation / conflict / network).
- [ ] **Cap or split the page payload.** Up to 50 full page-tree snapshots (plus a full `published` copy) live in one custom object and are re-serialized on every save (`use-page-builder-connector.ts`) — risks CT's value-size limit on rich pages. Move to per-version or externalized history.
- [ ] **Add automated tests.** Jest/RTL/MSW are scaffolded but there are zero tests. Start with the pure, high-value logic: slug validation (`page-path.ts`), version slicing, comment merge/retry.
- [ ] **Gate actions by MC permission.** View-only users currently see enabled Save/Publish/Delete — add `useIsAuthorized` / `RestrictedByPermissions` checks, and remove the stale permission groups in `constants.ts`.

### Builder depth

- [ ] **Real per-element styling.** Only a 7-value theme enum exists — add color, typography, and spacing/padding controls, and either wire up or remove the dead "CSS ID" and "Market permissions" inputs (`settings-pane.tsx`).
- [ ] **Usable version history.** 50 snapshots are stored but write-only — add restore and per-version preview. The menu-bar history button currently opens the workflow drawer only.
- [ ] **Keyboard support.** Undo/redo have no shortcut (Cmd/Ctrl+Z is a no-op) and are lost on reload (in-memory only) — add shortcuts and consider persisting the stacks.
- [ ] **Editing-model gaps:** multi-select, cross-page copy/paste, cross-layout component drag in the edit canvas, and true per-breakpoint styling (only show/hide toggles exist today).
- [ ] **Page organization:** folders, tags, filter, sort, and page duplication. Wire up or remove the no-op "Import" (`pages.tsx`) and detail "Preview" (`page-detail.tsx`) buttons.
- [ ] **Generic primitives in the seed catalog:** rich-text block, standalone image, spacer/divider, columns container, button, video, HTML embed.

### Polish and collaboration follow-ups

- [ ] **i18n regression.** The comments and workflows surfaces, plus all save/publish/workflow toasts, are hardcoded English — extract into `defineMessages` so `extract-intl` picks them up.
- [ ] **Accessibility.** Page-building is mouse-only native HTML5 drag-and-drop — add a keyboard path, roles/landmarks, and React error boundaries to contain a canvas crash.
- [ ] **Workflow enforcement is UI-only** (tamper-able via the API); true approval gates need a backend service.
- [ ] **@-mention notifications are poll-based** (no email/push; unread is per-device) — a notification service could push these.

---

## Project structure

```
page-editor/                  # Merchant Center Custom Application (the webapp)
  src/
    components/
      pages/                  # Pages view — tree + detail panel
        pages.tsx             # Root container
        page-tree-row.tsx     # Tree row component
        page-detail.tsx       # Detail panel (fetches per-page CT data)
        state-tag.tsx         # Draft/Published badge
      page-builder/           # Visual page builder — canvas, settings pane, menu bar
    hooks/
      use-page-builder-connector/          # CT hooks — per-page draft/published (read/write)
      use-components-connector/            # CT hooks — component catalog (read-only, host-synced)
      use-data-sources-connector/          # CT hooks — data source type catalog (read-only, host-synced)
      use-sections-connector/              # CT hooks — section catalog (read-only, host-synced)
      use-data-source-instances-connector/ # CT hooks — saved data source instances (read/write)
      use-categories-connector/            # CT hooks — category tree

packages/
  page-builder/                # @commercetools-demo/page-builder — render runtime + CLI + contract (see Host integration)

openspec/                     # Behavior specs — authoritative for what the app does today
  specs/                      # One directory per capability (22), each with a spec.md
  changes/                    # In-flight change proposals

seed/                         # Standalone seed scripts (no webapp dependency)
  scripts/
    seed-data-sources.js      # Seed data source type catalog
    seed-components.js        # Seed component type catalog
    seed-sections.js          # Seed section catalog
    seed-pages.js             # Seed page content (data/pages/*.json)
    download-*.js             # Pull the current catalog back down to disk
  data/
    data-sources-seed.json    # Data source type catalog
    components-seed.json      # Component type catalog
    sections-seed.json        # Section catalog
    data-source-instances.json # Example saved data source instances
    pages/                    # One file per seeded page
  custom-objects.md           # Custom object schemas (predates schema v2 — see Custom objects)
  .env.seed.example           # Template for CT credentials
  package.json                # npm scripts for running the seed commands
```
