# SDD — Host catalog (definitions) contract

> The vocabulary of a storefront's page-builder content — component types, data-source types,
> sections and theme tokens — is **owned by the host** as one JSON file, validated and pushed to
> the page-builder service by CI. The service writes it into the commercetools custom objects the
> Merchant Center app reads.
>
> Structure is defined by [`packages/page-builder/catalog.schema.json`](../../packages/page-builder/catalog.schema.json)
> (copied to `page-builder-service/src/domain/catalog.schema.json`; a test fails if they differ).
> Referential rules (below) are checked by the service. HTTP surface:
> `page-builder-service/openapi.yaml`. This replaces the 0.x model in which host TypeScript
> registrations and a `page-builder` CLI wrote the objects directly.

## 1. Ownership model

| Concern | Source of truth | Written by | Read by |
|---|---|---|---|
| Component types + schemas + groups | host catalog file | service (catalog ingest) → CT `components` | MC palette + settings pane; service at render |
| Data-source types + config schemas + resolver kinds | host catalog file | service → CT `data-sources` | MC data-source dialog; service resolvers |
| Sections | host catalog file | service → CT `sections` | MC section list |
| Theme tokens (section backgrounds, container width, gaps) | host catalog file | service → CT `theme` (service-owned) | service → shim |
| Data-source **instances** | MC authors | MC app, through the service's object gateway | service at render |
| Pages (`page-*`), preview `settings`, comments, workflows | MC authors / operators | MC app, through the service's object gateway | service at render |

**Invariant:** the service's catalog ingest is the only writer of `components`, `data-sources`,
`sections` and `theme`. The MC object gateway refuses to write them, and ingest never touches
author-owned objects. Exactly one host owns the catalog of a given commercetools project (two
hosts pushing would overwrite each other; there is no merge).

## 2. Shared types

Structural definitions below mirror `catalog.schema.json` and `page-builder-service/src/domain/types.ts`.

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
  type: string;                     // 'namespace/name' — equals the host component-map key
  name: LocalizedString;
  icon: string;
  groupKey: string;                 // → ComponentGroup.key
  pageTypes?: PageTypeId[];         // palette filtering
  description?: LocalizedString;
  schema: SchemaField[];
  inlineTextFields?: string[];      // schema keys the visual editor may edit in place
  fill?: { kind: 'product-detail' | 'category-listing'; slice?: string };  // route-driven data
};
type ComponentGroup = { key: string; name: string | LocalizedString };

type DataSourceType = {             // schema is the CONFIG schema, not the output
  type: string;                     // e.g. 'commercetools/product-list'
  name: LocalizedString;
  icon: string;
  groupKey: string;                 // → DataSourceGroup.key
  description?: LocalizedString;
  schema: SchemaField[];
  resolver: { kind: ResolverKind }; // which service resolver produces its data
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

`ComponentType` and `DataSourceType` both carry `schema: SchemaField[]` (for a data source that
schema describes its **config**, not its output). `ResolverKind` is one of `product`,
`product-list`, `products-by-category`, `product-picks`, `product-pins`, `category`,
`category-list`, `category-picks`, `category-pins`, `category-tree`, `related-products`; what each
returns is in [canonical-shapes.md](./canonical-shapes.md).

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

### 2.5 Manifest / bridge types

```ts
type RegistryManifestEntry = { type: string; inlineTextFields: string[] };
type BridgeCapabilities = { select?; refresh?; dnd?; dropzones?; inlineText?: boolean };
type BridgeMessage = { channel: 'pb-visual-editing'; v: 1; type: string; payload?: unknown };
```

The manifest is derived by the service from the catalog (`type` and `inlineTextFields`) and returned
with the render response in edit mode; the shim hands it to the bridge.

### 2.6 Theme

```ts
type Theme = {
  sectionBackgrounds?: Record<string, { background: string; color?: string }>;
  containerMaxWidth?: string;
  containerPaddingX?: string;
  gap?: { row?: string; column?: string };
};
```

Values are plain CSS values; the shim sanitises them into scoped CSS variables. See
[canonical-shapes.md](./canonical-shapes.md) §4.

## 3. Stored objects

Container `page-editor`. Four keys, each a `CombinedCatalog<T>`:

| Key | Payload `T` |
|---|---|
| `components` | `{ groups: ComponentGroup[]; components: ComponentType[] }` |
| `data-sources` | `{ groups: DataSourceGroup[]; sources: DataSourceType[] }` |
| `sections` | `{ sections: Section[] }` |
| `theme` | `{ theme: Theme }` (service-owned; the MC app does not read it) |

Inner `published.schemaVersion` is **2**; a freshly pushed draft version has `publishedAt: null`.
Draft history is capped at `MAX_VERSIONS = 50` (oldest dropped).

## 4. Push / publish lifecycle

- **Validate** (`POST /v1/catalog/validate`, no writes). Structure against the JSON schema, then the
  referential rules in §5. Every violation is reported; the response is 422 with the full list.
- **Push** (`POST /v1/catalog` → draft). Validates, then for each of the four objects: read it
  (capturing its commercetools `version`), hash the payload, and **no-op** when the draft head's
  `sourceHash` matches (idempotent); otherwise append a draft version, cap history, and write with
  the captured version for optimistic concurrency (retrying on a conflict). `published` is left
  untouched. A catalog that fails validation writes nothing.
- **Publish** (`POST /v1/catalog/publish`). Copy each draft head into `published` and stamp it. This
  is the go-live gate. `GET /v1/catalog?state=draft|published` reads either back.
- **Ordering.** Deploy the host first, then push, then publish, so the published catalog never
  advertises a `type` the live host cannot render. CI: validate on pull requests; push + publish after
  deploy (`skills/integrate-page-builder/scripts/catalog.mjs`). Authentication is the service's
  `PB_ADMIN_SECRET` as a bearer token.

## 5. Referential rules (checked by the service)

- component and data-source `type` keys are unique; section ids are unique;
- every `groupKey` names a defined group; `pageTypes` values are valid;
- every `SchemaField.kind` is valid; `localized` only on `text`/`richtext`/`select`;
  `group` children contain no nested `group`;
- every `dataSource` field's `dataSourceType` names an existing data-source type;
- every data source has a known `resolver.kind`; every `fill.kind` is known;
- every `inlineTextFields` entry is a field of that component's schema.

## 6. Binding chain (for authors)

`SchemaField.key` ⇒ the author sets `ComponentElement.settings[key]` ⇒ the service exposes it to the
component as `data[key]` (localised) ⇒ for `kind: 'dataSource'` the value is a `SavedDataSource.id`,
which the service resolves into the data source's canonical shape (`null` when the instance does not
exist); picker kinds (`product*`, `category*`) are resolved from their stored references.

## 7. Non-goals

- Rendering components inside the MC app (the host renders; the builder embeds).
- Host-side resolvers or non-commercetools data sources.
- Moving author-owned content (`data-source-instances`, `page-*`, `settings`) into code.
