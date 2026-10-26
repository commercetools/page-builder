# Cross-repo contracts

> [!IMPORTANT]
> **`openspec/specs/` is authoritative for what this product does.** 22 capability specs
> describe the code as-built and are validated with `openspec validate --specs --strict`.
> Start there.
>
> This directory holds only what those specs deliberately do *not* reproduce: the **wire
> formats and message protocols** shared between the service, the storefront shim and the
> builder. Specs describe the bridge's *behavior*; these documents describe its *encoding*.

| Document | Scope |
|---|---|
| [preview-contract.md](./preview-contract.md) | The host ↔ builder contract: page JSON wire format, component type-key vocabulary, data-source binding, the preview/draft URL flags, the `data-pb-*` DOM markers, and the full `postMessage` protocol with its capability and security rules. |
| [definitions-contract.md](./definitions-contract.md) | The host-owns-definitions contract: the catalog file (components, data sources with service resolver kinds, sections, theme), the schema model, the persistence envelope, the push/publish lifecycle through the service, and the referential rules. |
| [canonical-shapes.md](./canonical-shapes.md) | What the service resolves data sources and route-driven system components (PDP/PLP) into: the request context, `ProductCard`/`ProductDetail`/`CategoryNode`/`SearchResult`, the fill slice keys, listing URL parameters, and the theme tokens. |

The HTTP surface (render, catalog ingest, Merchant Center object gateway) is
[`page-builder-service/openapi.yaml`](../../page-builder-service/openapi.yaml).

They are referenced as normative from source: `packages/page-builder/catalog.schema.json` and
`src/contract.ts` / `src/bridge.tsx` (shim), `page-builder-service/src/domain/` (catalog validation
and envelope, page storage) and `src/commerce/shapes.ts` (canonical shapes), and the builder's
`preview/preview-bridge.ts` / `use-preview-bridge.ts`.

## Where the behavior specs live

| Area | Spec |
|---|---|
| Page directory, page creation and deletion | `openspec/specs/page-directory/`, `page-lifecycle/` |
| The edit canvas, settings pane, undo/redo | `openspec/specs/page-composition/`, `element-settings/`, `undo-redo/` |
| Host-synced catalogs and data bindings | `openspec/specs/component-catalog/`, `section-catalog/`, `data-source-bindings/`, `media-fields/` |
| Draft/publish and approval gates | `openspec/specs/draft-publish/`, `approval-workflows/` |
| Comments, mentions | `openspec/specs/commenting/` |
| Preview and the visual-editing bridge | `openspec/specs/storefront-preview/`, `visual-editing/` |
| Custom-object storage, migration, reset | `openspec/specs/content-storage/`, `storage-maintenance/` |
| The service, the shim and repo ops | `openspec/changes/page-builder-service/specs/` (`page-builder-service`, `host-shim`, `host-catalog-file`; supersede `host-catalog-cli`, `host-render-sdk`, `host-preview-gating` in `openspec/specs/` once the change is archived), `seed-tooling/`, `deployment-config/` |

## History

This directory previously held nine feature specs written in a Purpose / Actors / User
stories / Functional requirements / Acceptance criteria template. They were removed once
`openspec/specs/` superseded them, because they had drifted: three described in-app catalog
editors that no longer exist (component types, data source types and section presets are
authored in host code and pushed in by the `page-builder` CLI (since v1.0, a catalog JSON file pushed to the service)), two were still labelled
"Proposed" after shipping, all of them documented the pre-split `schemaVersion: 2` page
storage, and a host-side work plan had been superseded by `packages/page-builder` itself.
Their content lives on in the specs above; `git log -- docs/sdd/` recovers the originals.
