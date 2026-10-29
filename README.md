# Page builder

> **commercetools-labs.** Reference code we are glad to share: freely available under the MIT licence, provided as-is and not covered by commercetools support. See [SUPPORT.md](SUPPORT.md).

Storefront pages are usually built by developers and changed by developers. Every new landing page, seasonal campaign or reordered homepage becomes a ticket and a release, even though the people who know what the page should say are in content and merchandising.

The page builder lets those teams assemble and publish pages themselves, inside the Merchant Center they already use, **from components your developers define and control**. Authors drag approved building blocks onto a canvas, bind them to live commercetools data such as product lists and categories, preview the draft in the real storefront, and publish. Developers keep ownership of the design system and of what is allowed on a page.

It is made for teams that run a headless storefront on commercetools and want content-led pages (home, landing, category and product templates) without giving authors a way to break the site.

What you get when it works:

- A **Page Editor** in the Merchant Center with a page tree, a drag-and-drop canvas, draft and publish, version history and live preview.
- A small **service** (a commercetools Connect application) that is the only thing touching the stored pages. It resolves data into clean, localized shapes and serves a ready-to-draw page to your storefront.
- A thin **storefront integration** (a React shim, or the HTTP contract for any other client) that draws the page with your own components. The storefront needs no commercetools credentials and no data-fetching code for these pages.

This repo serves two audiences:

- **Content/platform teams running this app** — see [Getting started](#getting-started) onward.
- **Storefront engineers integrating the rendering SDK** — see [Host integration](#host-integration).

## Overview

The app has two main areas:

| Area | Route | Purpose |
|---|---|---|
| **Pages** | `/pages` | Browse the page tree, inspect per-page builder status, and open the builder |
| **Page Builder** | `/builder/:pageId` | Drag-and-drop canvas for composing a page from layout sections, components, and data sources |

There is no in-app editor for component types, data source types, or section presets — those catalogs are authored in the host's catalog file and pushed to the page-builder service by CI (see [Catalogs](#catalogs-components-data-sources-sections) and [Host integration](#host-integration)). This app only reads the *published* catalog to populate the Page Builder's palette, data-source picker, and section options.

Pages, and saved data source instances, still follow the same **draft → publish** pattern: every save appends to a version history inside that object's custom object; publishing updates the same object's `published` field, which is what the storefront reads.

---

## Table of contents

- [Getting started](#getting-started)
- [Development](#development)
- [Domain model](#domain-model)
- [Pages view](#pages-view)
- [Page Builder](#page-builder)
- [Catalogs: components, data sources, sections](#catalogs-components-data-sources-sections)
- [Host integration](#host-integration)
- [Custom objects](#custom-objects)
- [Project structure](#project-structure)

---

## Getting started

```bash
cd page-editor
cp .env.example .env     # then fill in your application id and project key
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
| `yarn test:service` | The same suite with every hook family routed through the page-builder service transport |
| `yarn format` | Prettier |

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

Developers shape the **vocabulary** in host (storefront) code — a catalog file defines component types (what fields exist) and data source types (what data can be fetched, by naming a service resolver), pushed into CT by the page-builder service. Content authors **assemble** with it in this app — they drag components onto the canvas and bind saved data sources to component slots. The component, data-source, and section catalogs stored in CT custom objects are the single source of truth every host and this app share.

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

Component types, data source types, and section presets are **defined in host (storefront) code, not in this app**. A host's `page-builder.catalog.json` declares them, and the page-builder service ingests it into this project's custom objects — `components`, `data-sources`, `sections` (and a service-owned `theme`) — that the Page Builder canvas reads to populate its component palette, data-source picker, and section options. See [Host integration](#host-integration) for how a host defines and pushes them.

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

A storefront integrates with three things, none of which touch commercetools:

1. **A component map and one mount** — `<PageBuilder>` from [`@commercetools-labs/page-builder`](packages/page-builder/README.md) (v1.0, React/Next.js only) renders any page.
2. **A catalog file** — `page-builder.catalog.json` declares the component types (with editable fields), data sources (each naming a service resolver), sections and theme tokens. CI validates it and pushes it to the service.
3. **The page-builder service** — a per-project commercetools Connect service ([`page-builder-service/`](page-builder-service/README.md)) that reads pages and drafts, gates preview, resolves data into [canonical shapes](docs/sdd/canonical-shapes.md), and returns the render tree. It is the only component holding commercetools credentials.

```
Merchant Center ──(MC user JWT)──▶ service ◀──(render key)── storefront shim
   page-editor                        │                         <PageBuilder/>
                                      ▼
                          commercetools custom objects, products, categories
```

Step by step, for any client (web or native): [the integration guide](skills/integrate-page-builder/SKILL.md). Contracts: [definitions](docs/sdd/definitions-contract.md), [preview and bridge](docs/sdd/preview-contract.md), [canonical shapes](docs/sdd/canonical-shapes.md), and the HTTP API in [`openapi.yaml`](page-builder-service/openapi.yaml).

### Wire it up

1. **Deploy the service** to the project (Connect application `page-builder-service`, endpoint `/service`). Set `PB_RENDER_KEY`, `PB_RENDER_ORIGINS`, `PB_PREVIEW_TOKEN`, `PB_ADMIN_SECRET`, `PB_EDITOR_ORIGINS`, and the API client (`CTP_*`, scope `manage_key_value_documents view_products view_categories view_stores`). Details and verification steps: [`page-builder-service/README.md`](page-builder-service/README.md).
2. **Install the shim** — `npm i @commercetools-labs/page-builder` — and set `PB_SERVICE_URL`, `PB_RENDER_KEY`, `PB_ORIGIN`.
3. **Mount it** in a catch-all route, passing the request path, the shopper's market (`locale`, `currency`, `country`, `store`) and `searchParams`.
4. **Map components** — each catalog `type` to a React component taking `{ data }`; use `PBText` for inline-editable text.
5. **Write the catalog file** and add the CI steps: validate on pull requests, push and publish after deploy (`skills/integrate-page-builder/scripts/catalog.mjs` has no dependencies).
6. **Point the Merchant Center app** at the service: set `PAGE_BUILDER_SERVICE_URL` and `PAGE_BUILDER_SERVICE_HOOKS` (see [Merchant Center app and the service](#merchant-center-app-and-the-service)), and give the project's preview settings the storefront's route templates.

Preview and visual editing need nothing more in the host: forward `searchParams` and the service decides (token, drafts, edit mode, allowed origins, manifest).

### Storage contract

Pages and the catalog live in the `page-editor*` custom-object containers described under [Custom objects](#custom-objects). The service is the only reader the storefront has; do not read them from a host.

### Merchant Center app and the service

The app's page-builder data hooks (pages, components, comments, workflows, preview settings, data-source instances, catalogs, reset) can go through the service instead of the Merchant Center GraphQL gateway, so MC users need no custom-object permission. It is switched by two build-time settings in `page-editor/.env`:

| Variable | |
|---|---|
| `PAGE_BUILDER_SERVICE_URL` | the service URL including `/service`; empty keeps every hook on the GraphQL gateway |
| `PAGE_BUILDER_SERVICE_HOOKS` | `all`, or a comma list of `pages, page-components, comments, workflows, page-workflow, preview-settings, data-sources, sections, components, instances, reset` |

The service must be configured with `PB_MC_ISSUER` (this project's Merchant Center API Gateway, e.g. `gcp-eu`) and, for its audience, the `CONNECT_SERVICE_URL` that Connect provides (its own public URL). Calls go through `/proxy/forward-to`; the service verifies the forwarded JWT, restricts access to the page-builder containers, keeps the host catalog read-only, and audit-logs each write with the acting user. The product/category pickers keep using the Merchant Center gateway. Roll out one family at a time (they are independent) and roll back by editing the list. Run `yarn test:service` in `page-editor/` to run the whole suite through the service transport.

**Local development.** The gateway runs in the cloud and cannot forward to a service on `localhost`, so with `PAGE_BUILDER_SERVICE_URL`
pointing there, `yarn start` can call the service directly with a plain `fetch` instead. Set the same token as
`PB_DEV_TOKEN` on the service (with `PB_EDITOR_ORIGINS=http://localhost:3001`) and as `PAGE_BUILDER_SERVICE_DEV_TOKEN` in
`page-editor/.env.local`, then restart `yarn start`. It is development-only on both sides: the app reads the token only under
`yarn start` and a production bundle does not contain the direct path, and the service refuses to start with `PB_DEV_TOKEN` set when
`NODE_ENV=production`. Details in the [service README](./page-builder-service/README.md#local-development-with-the-merchant-center-app).

### Images and videos

`kind: 'image'` and `kind: 'video'` fields upload to, and pick from, a Google Cloud Storage bucket owned by the **service**. The
editor needs only `PAGE_BUILDER_SERVICE_URL` (no hook family has to use the service); the service needs `PB_MEDIA_BUCKET` and
`PB_MEDIA_SERVICE_ACCOUNT_KEY_B64`. It reuses the same Merchant Center sign-in as everything else, so there is no separate media
service, token, business unit or image URL to configure. A field stores the plain file URL, so existing pages (including ones with a
URL typed or pasted in) keep working. The bucket setup, limits and security rules are in the
[service README](./page-builder-service/README.md#media-uploads). With no bucket configured the picker says so and nothing breaks.

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
      use-components-connector/            # CT hooks — component catalog (read-only, host-pushed)
      use-data-sources-connector/          # CT hooks — data source type catalog (read-only, host-pushed)
      use-sections-connector/              # CT hooks — section catalog (read-only, host-pushed)
      use-data-source-instances-connector/ # CT hooks — saved data source instances (read/write)
      use-categories-connector/            # CT hooks — category tree
    service/                  # Transport to the page-builder service (Apollo link, config, forward-to)

packages/
  page-builder/                # @commercetools-labs/page-builder 1.0 — the storefront shim (see Host integration)

page-builder-service/          # The per-project Connect service: render, catalog ingest, MC object gateway
  openapi.yaml                 # The /v1 API; shim and service types are generated from it

docs/sdd/                      # Wire contracts shared by the service, shim and builder

skills/
  integrate-page-builder/       # The step-by-step guide for integrating a client application
```
