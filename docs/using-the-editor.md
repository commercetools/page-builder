# Using the editor

What content authors see in the Merchant Center: the page kinds, the Pages view and the Page Builder canvas.

| Area | Route | Purpose |
|---|---|---|
| **Pages** | `/pages` | Browse the page tree, inspect each page's status, open the builder, and edit the project's settings (preview environments, locales, route templates) |
| **Page Builder** | `/builder/:pageId` | Drag-and-drop canvas for composing a page from layout sections, components and data sources | For how the pieces fit together see [architecture.md](architecture.md).

## Page kinds and the mental model

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
- **Edit** — opens the Page Builder for that page. In a category's PDP view it is disabled until the category has a PDP override.

## Page Builder

The Page Builder (`/builder/:pageId`) is a drag-and-drop editor for composing a page from layout elements and components.

### Canvas sections

Every page is split into sections — by default **HEAD**, **MAIN**, and **FOOTER** — but the actual set comes from the `sections` catalog synced from host code (see [Catalogs](catalogs.md)); the app falls back to the HEAD/MAIN/FOOTER default if that catalog is empty. Each section holds one or more *layout elements* (rows, grids, carousels, etc.) and each layout element holds one or more *component slots*.

### Element styles

Every layout and component element has a **Style** dropdown in its settings panel. The selected value is stored as a plain string on the element (`style` property) and is intended to be consumed by the storefront renderer to apply a visual theme.

The available options are defined centrally in:

```
page-editor/src/components/page-builder/element-styles.ts
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

1. Add the new string literal to the `ElementStyle` union in `page-editor/src/components/page-builder/types.ts`.
2. Add a matching entry (with all locale labels) to `ELEMENT_STYLE_OPTIONS` in `page-editor/src/components/page-builder/element-styles.ts`.

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
