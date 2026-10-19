# Custom Objects

This document covers all CT custom objects used by the pages editor.

---

# Data Sources

The pages editor stores its data source catalog in two CT custom objects: one for the
**draft history** (all saved versions) and one for **published** (the current live version).
Both live in the `page-editor` container.

## Objects

| Purpose   | Container     | Key                      |
|-----------|---------------|--------------------------|
| Draft     | `page-editor` | `data-sources-draft`     |
| Published | `page-editor` | `data-sources-published` |

---

## `data-sources-draft` — version history

Every "Save Draft" click appends a new entry to `versions[]`. The array is capped at 50
entries (oldest dropped). `currentVersion` always equals the latest `appVersion`.

```ts
{
  schemaVersion: 1;          // bump when migrating the shape
  currentVersion: number;    // = versions[last].appVersion
  versions: Array<{
    appVersion:   number;    // monotonically incrementing save counter
    savedAt:      string;    // ISO 8601 timestamp
    publishedAt:  string | null;  // set when this version was published
    groups: Array<{
      key:  string;          // slug, e.g. "product"
      name: string;          // display label
    }>;
    sources: Array<{
      type:         string;                   // unique identifier, e.g. "commercetools/product-list"
      name:         Record<string, string>;   // localized
      icon:         string;                   // Material Symbol name
      groupKey:     string;                   // must match a groups[].key
      description?: Record<string, string>;  // localized, optional
      schema: Array<{
        key:       string;
        label:     string | Record<string, string>;
        kind:      "text" | "richtext" | "number" | "boolean" | "select" | "image" | "link" | "group";
        required?: boolean;
        localized?: boolean;
        options?:  Array<{ key: string; label: string }>;  // kind="select" only
        children?: SchemaField[];                           // kind="group" only
      }>;
    }>;
  }>;
}
```

### Example (single version, unpublished)

```json
{
  "schemaVersion": 1,
  "currentVersion": 3,
  "versions": [
    {
      "appVersion": 1,
      "savedAt": "2026-05-01T10:00:00.000Z",
      "publishedAt": "2026-05-01T10:05:00.000Z",
      "groups": [{ "key": "product", "name": "Product" }],
      "sources": []
    },
    {
      "appVersion": 2,
      "savedAt": "2026-05-02T14:00:00.000Z",
      "publishedAt": null,
      "groups": [{ "key": "product", "name": "Product" }],
      "sources": [{ "type": "commercetools/product-list", "..." : "..." }]
    },
    {
      "appVersion": 3,
      "savedAt": "2026-05-08T09:00:00.000Z",
      "publishedAt": null,
      "groups": [{ "key": "product", "name": "Product" }],
      "sources": [{ "type": "commercetools/product-list", "..." : "..." }]
    }
  ]
}
```

---

## `data-sources-published` — current live version

Always a single flat object. Overwritten on every **Publish** action.
The storefront reads only this object.

```ts
{
  schemaVersion: 1;
  appVersion:   number;   // which draft appVersion this was published from
  publishedAt:  string;   // ISO 8601 timestamp
  groups: Array<{ key: string; name: string }>;
  sources: Array<{ ...same shape as versions[].sources... }>;
}
```

### Example

```json
{
  "schemaVersion": 1,
  "appVersion": 2,
  "publishedAt": "2026-05-01T10:05:00.000Z",
  "groups": [{ "key": "product", "name": "Product" }],
  "sources": [{ "type": "commercetools/product-list", "..." : "..." }]
}
```

---

## Seed data

`docs/data-sources-seed.json` contains the base catalog (5 sources across 5 groups).
The seed script wraps it in the correct envelope per target:

| Target      | Envelope                                                              |
|-------------|-----------------------------------------------------------------------|
| `draft`     | `DraftHistoryPayload` with one version, `publishedAt: null`           |
| `published` | `PublishedPayload` with `publishedAt` set to now                      |
| `both`      | Both of the above, draft version's `publishedAt` set to match published |

---

## How to upload (manual)

### Option A — Merchant Center UI

1. **Settings → Developer → Custom Objects → + Add custom object**
2. Set **Container** to `page-editor`, **Key** to `data-sources-draft`
3. Paste the `DraftHistoryPayload` JSON as the value and save
4. Repeat with **Key** `data-sources-published` and the `PublishedPayload` JSON

### Option B — Seed script (recommended)

See the [README](../README.md#seeding-data) for full instructions.

```bash
# Fresh environment — seed draft only
yarn seed:data-sources

# Seed both so the storefront immediately has data
yarn seed:data-sources:both
```

---

## Versioning notes

- `schemaVersion` — increment this when the object shape changes and you need a migration.
  The connector skips migration logic for now and reads schemaVersion 1 as-is.
- `appVersion` — auto-incremented by the connector on every save. Do not set manually.
- CT `version` — the platform's own optimistic-locking counter. The connector reads it
  back after each mutation and passes it on the next write to prevent conflicts.
- The draft history is capped at **50 versions**. The oldest version is dropped when the
  cap is exceeded.

---

# Components

The component editor follows the same draft-history / published pattern as data sources.

## Objects

| Purpose   | Container     | Key                    |
|-----------|---------------|------------------------|
| Draft     | `page-editor` | `components-draft`     |
| Published | `page-editor` | `components-published` |

## `components-draft` — version history

```ts
{
  schemaVersion: 1;
  currentVersion: number;
  versions: Array<{
    appVersion:  number;
    savedAt:     string;
    publishedAt: string | null;
    groups: Array<{ key: string; name: string }>;
    components: Array<{
      type:         string;
      name:         Record<string, string>;
      icon:         string;
      groupKey:     string;
      schema: Array<{
        key:            string;
        label:          string | Record<string, string>;
        kind:           "text" | "richtext" | "number" | "boolean" | "select" | "image" | "link" | "group" | "dataSource";
        required?:      boolean;
        localized?:     boolean;
        dataSourceType?: string;
        options?:        Array<{ key: string; label: string | Record<string, string> }>;
        children?:       SchemaField[];
      }>;
    }>;
  }>;
}
```

## `components-published` — current live version

```ts
{
  schemaVersion: 1;
  appVersion:   number;
  publishedAt:  string;
  groups:     Array<{ key: string; name: string }>;
  components: Array<{ ...same shape as versions[].components... }>;
}
```

## Seed data

`docs/components-seed.json` contains the built-in catalog (12 components across 3 groups).

```bash
yarn seed:components        # draft only
yarn seed:components:both   # draft + published
```

To seed everything at once:

```bash
yarn seed:all   # data-sources + components + pages, both draft and published
```

---

# Page Builder

The page builder stores each page's content in its own pair of CT custom objects — one for draft history and one for the live published version. Keys are namespaced per page ID.

## Objects

| Purpose   | Container     | Key pattern                   |
|-----------|---------------|-------------------------------|
| Draft     | `page-editor` | `page-{pageId}-draft`         |
| Published | `page-editor` | `page-{pageId}-published`     |

For example, the homepage uses `page-home-draft` and `page-home-published`.

## `page-{pageId}-draft` — version history

```ts
{
  schemaVersion: 1;
  currentVersion: number;
  pageId: string;
  versions: Array<{
    appVersion:  number;
    savedAt:     string;           // ISO 8601
    publishedAt: string | null;    // set when published
    page: {
      HEAD:   LayoutElement[];
      MAIN:   LayoutElement[];
      FOOTER: LayoutElement[];
    };
  }>;
}
```

Where `LayoutElement` is:

```ts
{
  id:         string;
  kind:       "layout";
  width:      "1/1" | "1/2" | "1/3" | "2/3" | "1/4";
  name:       Record<string, string>;   // localized
  visibility: { mobile: boolean; tablet: boolean; desktop: boolean };
  children: Array<{
    id:         string;
    type:       string;               // component type key
    name:       Record<string, string>;
    visibility: { mobile: boolean; tablet: boolean; desktop: boolean };
    settings:   Record<string, unknown>;
  }>;
}
```

## `page-{pageId}-published` — current live version

```ts
{
  schemaVersion: 1;
  appVersion:   number;
  publishedAt:  string;
  pageId:       string;
  page: { HEAD: LayoutElement[]; MAIN: LayoutElement[]; FOOTER: LayoutElement[] };
}
```

## Seed data

`docs/pages-seed.json` contains an initial homepage (3 sections: promo banner, hero + product grid, newsletter footer). The seed script uses `--page-id` to select which page key to populate.

```bash
yarn seed:pages               # draft only  (page-home-draft)
yarn seed:pages:both          # draft + published

# Seed a different page
node scripts/seed-pages.js --page-id about --target both
```

Additional flags:

```bash
# Use a different env file
node scripts/seed-pages.js --env .env.production.seed

# Preview without hitting the API
node scripts/seed-pages.js --dry-run
```
