# SDD — Host ↔ Page Builder contract

> The contract between the page-builder **service**, the storefront **shim**
> (`packages/page-builder`, v1.0) and the Merchant Center editor. Behavior that consumes it is
> specified in `openspec/specs/storefront-preview/` (the MC app's preview mode) and
> `openspec/specs/visual-editing/` (the editing bridge).
>
> **v1.0 changes who does what.** A host no longer reads custom objects, resolves data sources,
> validates the preview token or ships a registry/Tailwind setup. The service reads the pages (§2
> is its storage format, not something a host parses), resolves data (§4), validates the token (§5)
> and returns a render tree; the shim renders it and delivers the bridge. The host's whole
> surface is the component map, one `<PageBuilder>` mount and a catalog file. See
> `page-builder-service/openapi.yaml` for the render wire format and `canonical-shapes.md` for
> resolved data. Compatibility with 0.x hosts is not preserved.

## 1. Purpose

The Page Builder is host-agnostic and multi-tenant (installed on any MC project). Hosts differ
in components and styling but nothing else: data comes from the service in canonical shapes.
This document defines the **narrow, stable contract** shared by the service, the shim and the
builder so the builder can render previews and drive in-place editing regardless of host
internals.

The contract has five layers:

| Layer | Direction | Phase | Where defined |
|---|---|---|---|
| A. Page JSON wire format | editor writes → host reads | 1 | here §2 |
| B. Component type-key vocabulary | shared | 1 | here §3 |
| C. Data-source binding | shared | 1 | here §4 |
| D. Preview settings + draft flag | editor → host (URL) | 1 | `openspec/specs/storefront-preview/` (recap §5) |
| E. Visual-editing bridge | editor ↔ host (`postMessage`) | 2–3 | here §6–9 |

Layers A–D exist today (hosts already consume them); layer E is new.

## 2. Layer A — Page JSON wire format

Persisted in CT custom objects, split across three containers (`schemaVersion: 3`).
The two sides have deliberately different shapes: **published is self-contained** so the
storefront hot path is a single read, while **draft holds references** so each component
instance has its own object and version history.

```ts
// container `page-editor-published`, key `page-<id>` — frozen, inline, self-contained
{ schemaVersion: 3, pageId, pageType?, appVersion, publishedAt, page: Page }

// container `page-editor-draft`, key `page-<id>` — layout children are refs, not content
{
  schemaVersion: 3, pageId, pageType?,
  publishedAt: string | null,          // denormalized, so the page list needn't read published
  draft: {
    currentVersion,
    versions: Array<{ appVersion; savedAt; publishedAt: string | null; page: RefPage }>,
  },
}

// container `page-editor-components`, key `component-<uuid>` — one per component instance
{ schemaVersion: 3, type, pageId, draft: { componentId; currentVersion; versions: [...] } }
```

A `RefPage` is a `Page` whose layout `children` are `ComponentRef` objects
(`{ typeId: 'key-value-document', id }`) rather than embedded `ComponentElement`s.

The service renders the published object directly. Under a valid preview token (§5) it reads
the **draft head** and resolves its refs (`page-builder-service/src/domain/page-store.ts`),
skipping a component whose object is missing rather than failing the page.

> Pre-split pages (one combined `schemaVersion: 2` object in container `page-editor`, with
> `draft.versions[]` and an inline `published`) are still readable as a fallback. The editor
> forces a one-time migration; see `openspec/specs/storage-maintenance/`.

The service renders `published.page` normally, and under the preview token (§5) the **latest
draft version** — `draft.versions[draft.versions.length - 1].page`, **not** `draft.page`
(there is none). Note the `data-source-instances` object differs: its `draft` is a flat
`{ instances: [...] }`, not versioned.

```ts
Page = { HEAD: LayoutElement[]; MAIN: LayoutElement[]; FOOTER: LayoutElement[] }
LayoutElement  { id; kind: 'layout'; width: '1/1'|'1/2'|'1/3'|'2/3'|'1/4'|'3/4';
                 name: LocalizedString; visibility: Visibility; style?: string;
                 children: ComponentElement[] }
ComponentElement { id; type: string; name: LocalizedString; visibility: Visibility;
                   style?: string; settings: Record<string, unknown> }
Visibility { mobile: boolean; tablet: boolean; desktop: boolean }
```

**Invariants the bridge depends on:**
- **Element `id`s are stable and unique** within a page (both `LayoutElement.id` and
  `ComponentElement.id`). They are the anchor that maps rendered DOM ↔ model (§7).
- Only `MAIN` is rendered; `HEAD`/`FOOTER` are reserved. The service row-packs consecutive
  elements into a 12-col grid by `width` (`1/1→12, 1/2→6, 1/3→4, 2/3→8, 1/4→3, 3/4→9`); the
  shim draws it with its own CSS.
- `LocalizedString` = `Record<locale, string>`; the service localizes at render (a key is a
  locale only when it is a two-letter language with an optional region, so three-letter field
  names such as `url`/`alt` are never mistaken for one).

## 3. Layer B — Component type-key vocabulary

`ComponentElement.type` is a `namespace/name` string. The **host's catalog file is the
source of truth** (`catalog.schema.json`, pushed by CI to the service); the host's component
map keys must match it exactly, or the block renders as nothing in production and as a
placeholder in development.

Conventional namespaces: `content/*`, `category/*`, `product/*`. Divergence between hosts is
allowed; unknown types degrade to nothing.

**Contract rule:** adding a component type = add it to the host's catalog file **and** its
component map under the same key. A route-driven (system) component declares `fill:
{ kind, slice }` in the catalog and the service supplies its data from the request path.

**Manifest.** In edit mode the render response carries `manifest` (each catalog component's
`type` and `inlineTextFields`) and the shim passes it to the bridge, which advertises it in the
`ready` handshake as `components` (§8). The builder uses it to filter its palette to the types
the host implements and to learn which fields are inline-editable.

## 4. Layer C — Data-source binding

A `settings` value that is a **string equal to a saved data-source instance id** is a
binding. The **service** resolves it at render to commercetools data in the canonical shapes
(`canonical-shapes.md`); the builder never resolves it (it stores only the id — see
`openspec/specs/data-source-bindings/`). A `dataSource` field whose id names no instance
renders as `null`, never as the raw id.

- Instances live in custom object `page-editor` / `data-source-instances`
  (`{ draft, published }`, each `{ instances: SavedDataSource[] }`).
- `SavedDataSource { id; type; name; config; savedForReuse }`.
- The catalog maps each data-source type to a service resolver `kind`
  (`product`, `product-list`, `products-by-category`, `category`, `category-list`,
  `related-products`, `*-picks`, `*-pins`, `category-tree`). There is no host resolver code.
- Resolution context is the request's `locale, currency, country, store` plus route params the
  service derives from the path (category, sku).

## 5. Layer D — Preview settings + draft flag (recap)

Specified in `openspec/specs/storefront-preview/`. In brief: a per-project `PreviewSettings`
custom object (`page-editor/settings`) gives the builder the host `baseUrl`, locales,
per-page-type route templates, PDP sample sku/slug, optional `vars` (e.g. `brand`), and
a shared `token`. The builder builds a URL and appends `?pb_preview=<token>` plus
`pb_page_id=<pageId>`. The host forwards its query string to the service, which compares the
token in constant time with its `PB_PREVIEW_TOKEN`; on a match it reads the draft (not the
published object), skips its cache, and honours `pb_page_id` over the route. Without a match the
parameters are ignored. The route templates double as the service's path-to-page map. Arbitrary pages live at the route root (`/{locale}/{brand}/<slug>`), **not**
under a `/content/` namespace.

**Extension for editing:** editing mode is signalled by an additional flag on the same
URL, `pb_edit=1`, plus `pb_origin=<mc-app-origin>` so the host bridge knows where to
post (see §8 security). The draft flag remains required (you edit the draft).

## 6. Layer E — Visual-editing bridge: overview

Because the iframe is **cross-origin** (host domain ≠ `*.commercetools.com`), the
builder cannot touch the frame's DOM. All interaction is a versioned `postMessage`
protocol plus server-emitted DOM markers. Two parts: **DOM instrumentation** (§7) and
**the message protocol** (§8). Both are inert unless `pb_edit=1` is present, so nothing
ships to real shoppers.

## 7. DOM instrumentation

Emitted **server-side** by the host on the existing wrappers (grounded: the single
per-block `<div>` in `components/grid/Item.tsx`, the column `<div>` in `Cell.tsx`, and
the section `<div>` in `Sections.tsx` — which already emits `data-section-id`).

| Attribute | On | Value | Phase |
|---|---|---|---|
| `data-pb-id` | block + layout wrappers | the element `id` (Component/LayoutElement) | 2 |
| `data-pb-type` | block wrapper | the `type` (e.g. `content/hero`) | 2 |
| `data-pb-kind` | each wrapper | `section` \| `layout` \| `component` | 2 |
| `data-pb-section` | section wrapper | `HEAD` \| `MAIN` \| `FOOTER` | 2 |
| `data-pb-dropzone` | layout/cell containers | JSON `{section, layoutId, index}` insertion point | 3 |
| `data-pb-field` | text nodes inside a block | settings key path (e.g. `title`) | 3 |

**Invariant:** `data-pb-id` **equals** the wire-format element `id`. The builder maps
DOM→model with a direct id lookup — no positional guessing. The builder already tracks
selection as `(layoutId, compId)` (persisted to `?layout=&comp=`), so a `select` for a
component id resolves to its parent layout unambiguously.

**`data-pb-field` (phase 3, resolved).** The value is the component's **settings key**
(the catalog `SchemaField.key`), placed by the component author on the DOM node that
renders that field's text. The host does **not** derive it from a schema and the builder
does **not** read the host's schema — it's a per-component opt-in. Scope it to
`kind: 'text'` fields; `richtext`/structured fields stay in the settings pane. The host
posts the **raw new string** in `field` and does **not** encode locale — the builder
writes to the active preview locale automatically (localized fields, stored as an object,
get `settings[key][locale]`; plain fields get `settings[key]`).

## 8. Message protocol

Envelope (both directions), validated on receipt:

```ts
interface BridgeMessage { channel: 'pb-visual-editing'; v: 1; type: string; payload?: unknown }
```

**Handshake**
1. Builder loads the iframe with `?pb_preview=<token>&pb_edit=1&pb_origin=<mcOrigin>`.
2. Host bridge (client component, edit mode on) posts **`ready`** to
   `pb_origin` (validated against the `allowedOrigins` the service returns in edit mode).
3. Builder replies **`init`**; steady state begins.

**Host → Builder**

| type | payload | when |
|---|---|---|
| `ready` | `{ v, capabilities, components? }` | bridge mounted. `components` = the host's registry manifest `[{ type, inlineTextFields? }]`; the builder filters its palette to these types (§3). |
| `select` | `{ id }` | user clicked a block on the render |
| `hover` | `{ id \| null }` | pointer entered/left a block |
| `rects` | `{ items: [{ id, rect }], dropzones?: [{ section, layoutId, index, rect }] }` | after `requestRects`, and on scroll/resize/DOM mutation; include `dropzones` only if that capability is advertised |
| `docsize` | `{ width, height }` | content size changed (for iframe auto-size) |
| `navigate` | `{ href }` | a link was clicked in edit mode (builder decides to block/allow) |
| `field` | `{ id, key, value }` | inline text committed (phase 3) |
| `drop` | `{ dragId?, type?, target: {section, layoutId, index} }` | a drag that started on the render was dropped (phase 3); builder mutates + `refresh` |
| `error` | `{ message }` | bridge-side failure |

**Builder → Host**

| type | payload | effect |
|---|---|---|
| `init` | `{ mode, selectedId, locale }` | initialize bridge state |
| `requestRects` | `{ ids? }` | host replies with `rects` |
| `highlight` | `{ id \| null }` | outline a block (mirror tree selection onto the render) |
| `scrollTo` | `{ id }` | scroll the block into view |
| `refresh` | `{}` | host calls `router.refresh()` to re-pull the server render with fresh draft + resolved data |
| `setMode` | `{ mode }` | toggle edit/preview affordances |
| `drop` | `{ dragId?, type?, target: {section, layoutId, index} }` | commit a palette drop the builder computed from dropzone rects (phase 3); builder mutates JSON then `refresh` |
| `commitField` | `{ id, key, value }` | acknowledge inline edit (phase 3) |

**Key flows**
- *Select:* click → host `select {id}` → builder selects `(layout, comp)`, opens settings pane, sends `highlight {id}`.
- *Edit + reflect:* pane edit → builder mutates JSON → **debounced** draft save → `refresh` → host `router.refresh()` re-renders with real data; overlay re-anchors from a fresh `rects`.
- *Drag (phase 3):* two cases. **Palette → render:** the builder's overlay owns the pointer, hit-tests `data-pb-dropzone` rects, and computes the target. **Reorder on the render:** the drag starts in the host DOM, so the host owns the pointer and posts `drop` with the computed target. Either way the **builder** mutates the page JSON and `refresh`es — the host never mutates, only reports geometry and re-renders. Target is `{section, layoutId, index}` because components live inside layouts (`layoutId: null` creates a new full-width row). `index` is the destination among the **current** siblings (before the dragged item is removed); the builder adjusts for same-layout moves.
- *Inline text (phase 3):* `contenteditable` on `data-pb-field` → host `field {id,key,value}` → builder persists to `settings[key]` → `refresh`.

## 9. Versioning, capabilities & security

- **Versioning.** `v` is negotiated; the host advertises `capabilities` in `ready` so the
  builder enables features per host — gradual, per-tenant adoption. Each capability is
  independent; advertise only what the host actually honors:
  - `select`, `refresh` — phase 2 (click-to-select, `router.refresh()`).
  - `inlineText` — host annotates `data-pb-field` text nodes and posts `field`. Needs no
    geometry export; pinned and buildable on its own.
  - `dnd` — **on-render reorder only**: the drag starts in the host DOM, so the host owns
    the pointer, computes the target, and posts `drop { dragId, target }`. No geometry is
    sent to the builder. Buildable on its own.
  - `dropzones` — host additionally reports `rects.dropzones`, letting the builder own the
    pointer for **palette → render** drops (the one case native DnD can't cross the
    cross-origin boundary). Distinct from `dnd`; a host may honor `dnd` without it. This is
    the piece both sides co-develop last.
- **Origin checks.** Builder validates `event.origin === new URL(settings.baseUrl).origin`;
  the bridge validates `event.origin` against `allowedOrigins` from the render response (the
  service's `PB_EDITOR_ORIGINS`; sent only in edit mode) and only ever posts to the validated
  `pb_origin` (never `'*'`).
- **Edit-mode gating.** Instrumentation and bridge are emitted/active only when
  `pb_edit=1` (which itself requires the valid `pb_preview` token). Real shopper traffic
  gets none of it.
- **No cross-origin DOM access.** Everything is messages; the builder never reads the
  frame DOM directly.

## 10. Non-goals

- Host-side data fetching: the service owns all commercetools reads and resolution (layer C).
- Rendering components inside the MC app — the host renders; the builder embeds.
- Defining MC-app behavior (see `openspec/specs/visual-editing/`) or the shim and service
  implementations (see `packages/page-builder/`, `page-builder-service/`).
