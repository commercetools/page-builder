# Catalogs: components, data sources, sections

Component types, data source types, and section presets are **defined in host (storefront) code, not in this app**. A host's `page-builder.catalog.json` declares them, and the page-builder service ingests it into this project's custom objects — `components`, `data-sources`, `sections` (and a service-owned `theme`) — that the Page Builder canvas reads to populate its component palette, data-source picker, and section options. See [Host integration](host-integration.md) for how a host defines and pushes them.

There's no separate editor screen for these in this app — if a catalog hasn't been synced yet, its palette/picker is simply empty.

## Concepts

| Term | Meaning |
|---|---|
| **Component type** | A reusable building block (e.g. `hero`, `productGrid`). Identified by a unique `type` key. |
| **Data source type** | A template describing what data is fetched and what configuration it needs (e.g. `commercetools/product-list`). Identified by a unique `type` key. |
| **Section** | A named top-level canvas region (default: HEAD/MAIN/FOOTER) a page's layout elements are grouped into. |
| **Schema** | The list of editable fields belonging to a component or data source type. |
| **Group** | A label used to organise types in their palette/catalog (e.g. `content`, `commerce`, `product`, `category`). |
| **Saved data source** | An in-app, named instance of a data source type with filled-in field values — see below. |

## Schema field kinds

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

## Saved data source instances

Unlike the *types* above, saved **instances** are still authored directly in this app, inside the Page Builder canvas. A saved instance is a named, configured copy of a data source type (e.g. *"Bestsellers — homepage"*), reusable across pages; a component's `dataSource` field stores the saved instance's `id`.

The configure-data-source dialog has three modes:

- **Use saved** — pick from existing saved instances of the matching type; each row has its own Edit button.
- **Create new** — name + schema form; submitting creates a fresh instance.
- **Edit configuration** — opens with the saved instance pre-filled. *Save changes* updates it in place (propagates to every page binding that references it); *Save as copy* forks into a new instance — the right choice when other pages depend on the current values.

A `savedForReuse: true` instance is a shared, project-wide resource — editing in place propagates everywhere, so *Save as copy* is the only way to diverge without breaking sibling bindings.
