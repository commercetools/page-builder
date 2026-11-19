# Data model


All app data is stored in CT custom objects under one container, `page-editor`. Each object holds both the draft version history and the current published state together (schema v2: `{ schemaVersion, draft: { versions: [...] }, published: {...} | null }`):

| Object | Key | Owner |
|---|---|---|
| Component type catalog | `components` | Host code, via `page-builder sync`/`publish` — read-only in this app |
| Data source type catalog | `data-sources` | Host code, via `page-builder sync`/`publish` — read-only in this app |
| Section catalog | `sections` | Host code, via `page-builder sync`/`publish` — read-only in this app |
| Saved data source instances | `data-source-instances` | This app (Page Builder canvas) |
| Page content | `page-<pageId>` (e.g. `page-home`) | This app (Pages / Page Builder) |

Every save appends a new entry to `draft.versions[]` (capped at 50); publishing copies the current draft into `published` and stamps it with `publishedAt`. The storefront, and this app's Page Builder for the three catalogs, only ever read `published`.
