# SDD — Host ↔ Page Builder **definitions** contract

> The contract that moves the page-builder **vocabulary** — component types,
> data-source types, and sections, each with its `SchemaField[]` schema — out of the
> Merchant Center app and into **host code**, synced back into the same commercetools
> custom objects the MC app already reads.
>
> This **extends** [preview-contract.md](./preview-contract.md) §3 (Layer B, component
> type-key vocabulary) and §4 (Layer C, data-source binding): those layers said host
> registry keys must *match* the MC catalog; this contract makes host code the **source
> of truth** for the whole definition, not just the key. It also resolves the
> "Registry ↔ catalog sync" open question in
> `packages/page-builder/` (the shipped implementation).
>
> **Status: Proposed.** Reference host: a storefront `site`. _Drafted 2026-07-15._

## 1. Purpose & ownership model

Today the definitions live in the MC app (routes `/component-editor`, `/data-sources`,
`/sections-editor`) and are stored in CT custom objects (container `page-editor`, keys
`components`, `data-sources`, `sections`). The host separately declares implementations in
`components/grid/registry.ts` with **no schema** — only `{ component, inlineTextFields }`.
The vocabulary therefore exists twice and can drift.

This contract makes **host code the single source of truth**. A published npm package
(`@commercetools-labs/page-builder`) provides the `page-builder` CLI, which reads the host's
definitions and writes them into those same three CT objects; the MC app keeps reading them
exactly as before (no runtime change).

| Concern | Source of truth | Written by | Read by |
|---|---|---|---|
| Component types + schemas + groups | **host code** (block registrations) | sync tool → CT `components` | MC palette + settings pane; host at render |
| Data-source types + config schemas + groups | **host code** (registrations, co-located with resolvers) | sync tool → CT `data-sources` | MC data-source config dialog; host resolvers |
| Sections | **host code** | sync tool → CT `sections` | MC section list |
| Data-source **instances** | MC authors | MC app (unchanged) | host at render (resolve by `id`) |
| Pages (`page-*`), preview `settings` | MC authors / operators | MC app (unchanged) | host at render |

**Invariant:** after this change the MC app never writes `components` / `data-sources` /
`sections`. The sync tool is their **only** writer. Author-owned content
(`data-source-instances`, `page-*`, `settings`) stays MC-writable and is never touched by
the sync tool.

## 2. Shared types

Published from `@commercetools-labs/page-builder` (available from its `.` and `./contract`
entrypoints) and imported by the host runtime, the CLI, and any consumer of the wire types.
Lifted verbatim from the current source of truth
`page-editor/src/components/page-builder/types.ts` and unified with the host's local copies
to remove drift.

### 2.1 Schema model

```ts
type LocalizedString = Record<string, string>;               // locale → string
type PageTypeId = 'all' | 'static' | 'category' | 'pdp' | 'dynamic';

type SchemaFieldKind =
  | 'text' | 'richtext' | 'number' | 'boolean' | 'select' | 'image' | 'video' | 'link'
  | 'group' | 'dataSource'
  | 'product' | 'productPicks' | 'productPins'
  | 'category' | 'categoryPicks' | 'categoryPins';           // 16 kinds

type SelectOption = { key: string; label: string | LocalizedString };

type SchemaField = {
  key: string;
  label: string | LocalizedString;
  kind: SchemaFieldKind;
  required?: boolean;
  localized?: boolean;              // offered only for text/richtext/select
  options?: SelectOption[];         // select only
  dataSourceType?: string;          // dataSource only ('' = any type)
  children?: SchemaField[];         // group only (one level; no nested groups)
};
```

### 2.2 Definition types

```ts
type ComponentType = {
  type: string;                     // 'namespace/name' — equals the host registry key
  name: LocalizedString;
  icon: string;
  groupKey: string;                 // → ComponentGroup.key
  pageTypes?: PageTypeId[];         // palette filtering
  description?: LocalizedString;
  schema: SchemaField[];
};
type ComponentGroup = { key: string; name: string | LocalizedString };

type DataSourceType = {             // same shape minus pageTypes; schema is the CONFIG schema
  type: string;                     // resolver key, e.g. 'commercetools/product-list'
  name: LocalizedString;
  icon: string;
  groupKey: string;                 // → DataSourceGroup.key
  description?: LocalizedString;
  schema: SchemaField[];
};
type DataSourceGroup = { key: string; name: string };

type Section = {
  id: string;                       // 'HEAD' | 'MAIN' | 'FOOTER' | custom
  name: LocalizedString;
  description: LocalizedString;
  icon: string;
  pageTypes: PageTypeId[];
};

type SavedDataSource = {            // an INSTANCE (config values), NOT a definition
  id: string;                       // a settings value equal to this id is a binding
  type: string;                     // → DataSourceType.type
  name: LocalizedString;
  config: Record<string, unknown>;
  savedForReuse: boolean;
};
```

`ComponentType` and `DataSourceType` are structurally identical except `ComponentType`
adds `pageTypes`. Both carry `schema: SchemaField[]` (for a data source that schema
describes its **config**, not its output).

### 2.3 Authored wire format (layer A)

Owned by the contract so the host imports these instead of re-declaring a conflicting
`LayoutElement`. (The host's post-transform render shape stays host-local.)

```ts
type Visibility = { mobile: boolean; tablet: boolean; desktop: boolean };
type ElementStyle = '' | 'light' | 'dark' | 'accent' | 'muted' | 'charcoal' | 'sage';
type ComponentElement = { id; type; name: LocalizedString; visibility: Visibility;
                          style?: ElementStyle; settings: Record<string, unknown> };
type LayoutElement = { id; kind: 'layout';
                       width: '1/1'|'1/2'|'1/3'|'2/3'|'1/4'|'3/4';
                       name: LocalizedString; visibility: Visibility;
                       style?: ElementStyle; children: ComponentElement[] };
type Page = Record<string, LayoutElement[]>;   // keyed by section id (HEAD/MAIN/FOOTER)
```

### 2.4 Persistence envelope

```ts
type Version<T> = {
  appVersion: number;
  savedAt: string;                 // ISO
  publishedAt: string | null;      // null until published
  sourceHash?: string;             // idempotency key over the payload
} & T;

type Published<T> = {
  schemaVersion: 2;
  appVersion: number;
  publishedAt: string;
} & T;

type CombinedCatalog<T> = {
  schemaVersion: 2;
  draft: { schemaVersion: 2; currentVersion: number; versions: Version<T>[] };
  published: Published<T> | null;
};
```

### 2.5 Manifest / bridge types (unify the two current copies)

One definition each, replacing the MC app's `HostComponentInfo`
(`preview/preview-bridge.ts`) and the host's `RegistryManifestEntry` (`registry.ts`),
and the two hand-rolled bridge envelopes/capabilities:

```ts
type RegistryManifestEntry = { type: string; inlineTextFields: string[] };
type BridgeCapabilities = { select?; refresh?; dnd?; dropzones?; inlineText?: boolean };
type BridgeMessage = { channel: 'pb-visual-editing'; v: 1; type: string; payload?: unknown };
const BRIDGE_CHANNEL = 'pb-visual-editing';
const BRIDGE_VERSION = 1;
```

## 3. Synced CT objects (exact wire format)

Container `page-editor`. Three keys, each a `CombinedCatalog<T>`:

| Key | Payload `T` |
|---|---|
| `components` | `{ groups: ComponentGroup[]; components: ComponentType[] }` |
| `data-sources` | `{ groups: DataSourceGroup[]; sources: DataSourceType[] }` |
| `sections` | `{ sections: Section[] }` |

Fixing today's seed quirks: inner `published.schemaVersion` is **2** (the app connectors
write `2`; the old seed wrote `1`); a freshly synced draft version has `publishedAt: null`
(matches the app's `saveDraft`, not the seed's already-published stamp). Draft history is
capped at `MAX_VERSIONS = 50` (oldest dropped).

## 4. Sync / publish lifecycle

- **`sync` (default → draft).** GET the object (capture CT `version`); build the payload
  from host registrations; compute `sourceHash` over it. If the current draft head's
  `sourceHash` matches → **no-op** (idempotent). Otherwise append a new draft version
  (`publishedAt: null`), bump `currentVersion`, cap at 50, and PUT with the captured
  `version` for optimistic concurrency. `published` is left untouched.
- **`publish` (separate step).** Copy the latest draft head into `published` and stamp
  that draft version's `publishedAt`. This is the go-live gate; it replaces the MC publish
  button that is being deleted.
- **Ordering.** Deploy the host first, then `sync` (draft), then `publish` — so the
  published catalog never advertises a `type` the live host can't render (which would show
  as `MissingItem`).

## 5. Anti-drift & binding rules

- **Registry key ≡ `ComponentType.type`.** Because the host registry entry and the synced
  catalog entry derive from **one** registration object, they cannot diverge.
- **`validate`** (a sync-tool command, no CT access) enforces: unique component and
  data-source `type` keys; every `SchemaField.kind` is valid; every `dataSource` field's
  `dataSourceType` references an existing `DataSourceType` (or is `''` = any); every
  `groupKey` references an existing group; localized only on `text`/`richtext`/`select`;
  `group` children contain no nested `group`.
- **Binding chain** (for authors): `SchemaField.key` ⇒ author sets
  `ComponentElement.settings[key]` ⇒ the host transform exposes it as `configuration[key]`
  ⇒ for `kind: 'dataSource'` the value is a `SavedDataSource.id` the host resolves
  server-side (layer C).
- **Bridge manifest vs schema source.** The bridge `ready` manifest
  (`RegistryManifestEntry[]`) stays a **runtime** palette-filter / inline-edit hint; the
  **schema** source is CT (synced). Both derive from the same host registrations, so they
  stay consistent.

## 6. Non-goals

- Rendering components inside the MC app (the host renders; the builder embeds — see
  `openspec/specs/storefront-preview/`).
- Multi-host-per-CT-project: exactly **one** host owns the catalog for a given CT project
  (two hosts syncing the same object would clobber each other; the push model has no merge).
- Moving author-owned content (`data-source-instances`, `page-*`, `settings`) to code.
- A data API — the host still owns all CT fetching/resolution (layer C unchanged).
