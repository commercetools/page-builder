# @commercetools-labs/page-builder

The storefront side of the page-builder: one `<PageBuilder>` mount, a component map and a catalog file.
Everything else (reading pages, drafts, preview gating, data resolution, localisation, layout packing)
happens in the per-project [page-builder service](../../page-builder-service). The host holds **no
commercetools credentials, no resolvers and no Tailwind setup**.

**Version 1.0 is a breaking rewrite of 0.x.** `defineBlock`, `buildCatalog`, `buildRegistry`,
`createPageBuilderSections`, the `page-builder` CLI, block-level `resolve` functions and the host
`CTP_*` / `PB_PREVIEW_TOKEN` variables are gone. React / Next.js (App Router) only.

## Integrate

1. **Mount it.** One route renders every page:

   ```tsx
   // app/[[...path]]/page.tsx
   import { PageBuilder } from '@commercetools-labs/page-builder';
   import { components } from '@/components/blocks';

   export default async function Page({ params, searchParams }) {
     const { path = [] } = await params;
     return (
       <PageBuilder
         components={components}
         path={`/${path.join('/')}`}
         context={{ locale: 'en-US', currency: 'USD', country: 'US', store: 'my-store' }}
         searchParams={await searchParams}
         fallback={<NotFound />} // no page for this path; rendering `notFound()` gives a real 404
         errorFallback={<Unavailable />} // service down or erroring; defaults to `fallback`
       />
     );
   }
   ```

2. **Map components.** `components` maps a catalog component `type` to a React component (server or
   client; async is fine). It receives `{ data, editMode? }`: `data` is the author's settings, already
   localised, with every data-source field and route-driven slice resolved by the service into the
   [canonical shapes](../../docs/sdd/canonical-shapes.md). Use `PBText` / `Editable` for inline editing in
   the visual editor; they are inert outside edit mode.

3. **Describe the components.** `page-builder.catalog.json` lists the component types (with their editable
   fields), data sources (with a service-side `resolver.kind`), sections and theme tokens. It validates
   against `catalog.schema.json` (`"$schema": "./node_modules/@commercetools-labs/page-builder/catalog.schema.json"`).

4. **Push it from CI.** Validate on pull requests; push and publish after the deploy
   (see [`skills/integrate-page-builder/scripts/catalog.mjs`](../../skills/integrate-page-builder/scripts/catalog.mjs),
   which has no dependencies).

5. **Configure.**

   | Variable | |
   |---|---|
   | `PB_SERVICE_URL` | the service URL including its Connect path, e.g. `https://service-….commercetools.app/service` |
   | `PB_RENDER_KEY` | the render key (required by the service in production) |
   | `PB_ORIGIN` | this storefront's public origin, sent as `X-PB-Origin` (a server-side fetch has no browser `Origin`) |
   | `PB_TIMEOUT_MS` | render call timeout, default `2000` |

   All four can also be passed as props.

The step-by-step guide for integrating a client is [`skills/integrate-page-builder`](../../skills/integrate-page-builder/SKILL.md).

## Behaviour

- **Failure is a fallback, never stale content.** A path with no page renders `fallback`. A timeout, network
  error, rejected credentials, bad response or a misconfigured service URL renders `errorFallback` (which
  defaults to `fallback`; either renders nothing when unset) and logs the reason. Only the service's own
  `page_not_found` answer counts as "no page": any other 404 is reported as `bad_route`, so a wrong
  `PB_SERVICE_URL` is not mistaken for a missing page. Use the two to show a 404 for a missing page and a
  "temporarily unavailable" page for an outage. There is no host-side cache; the service caches
  commercetools reads for 15 seconds. Page rendering is dynamic; do not wrap it in a cache.
- **Preview and visual editing need no host code.** Forward `searchParams`; the service validates
  `pb_preview` / `pb_edit` and returns drafts, edit mode, the allowed Merchant Center origins and the
  component manifest. In edit mode the shim emits the `data-pb-*` markers and mounts the bridge.
- **Self-contained styling.** The 12-column grid, breakpoints (tablet ≥ 768px, desktop ≥ 1024px) and
  per-device hiding are plain scoped CSS (`pb-*` classes and CSS variables). Section backgrounds, container
  width and gaps come from the catalog `theme`.
- **Wire versioning.** Every call sends `X-PB-Wire-Version`. A service that does not support it answers 426
  with the versions it does; the shim renders the fallback and logs "upgrade the shim".

## Develop

```sh
npm install --legacy-peer-deps   # npm 10 crashes on this package's peer graph without it
npm test           # vitest (shim behaviour, grid output, bridge protocol, wire-contract drift)
npm run test:coverage
npm run generate:api   # regenerate wire types from ../../page-builder-service/openapi.yaml
```
