# Cross-repo contracts

This directory holds the **wire formats and message protocols** shared between the service, the storefront
shim and the Merchant Center editor, which is what a client implementer needs: how a page and a catalog are
encoded, what data arrives in, and how preview and visual editing talk to the host.

To integrate a client, follow [the integration guide](../../skills/integrate-page-builder/SKILL.md); it points
back here for the details.

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
