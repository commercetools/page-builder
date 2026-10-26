# nextjs-storefront — reference host

The smallest Next.js (App Router) storefront that renders page-builder content. It is the
documentation for host integration and the integration test for the shim and the service.

The integration is three files:

| File | What it is |
|---|---|
| [`app/[[...path]]/page.tsx`](./app/[[...path]]/page.tsx) | One catch-all route. Supplies the request path, the shopper's market and `searchParams`; the service decides which page that is (home, content, category, product). `fallback` renders `notFound()`, so an unknown path is a real 404. |
| [`components/blocks/index.ts`](./components/blocks/index.ts) | The component map: catalog `type` → React component. Twelve blocks, including the route-driven PDP and PLP ones. |
| [`page-builder.catalog.json`](./page-builder.catalog.json) | The catalog: component types and their editable fields, data sources and the service resolver each uses, sections, theme. Validates against `catalog.schema.json`. |

The storefront has no commercetools client, no resolvers, no Tailwind setup and no preview or
bridge code. (Its blocks use plain HTML and inline styles on purpose: it is a storefront, not
Merchant Center UI, so the Nimbus rules for `page-editor` do not apply.)

## Run it against the local fake service

No commercetools credentials needed. The fake service runs the real service over an in-memory
commercetools with a small shop (categories, products, a store `gap`) and sample pages.

```sh
# terminal 1
cd page-builder-service && npm install && npm run dev:fake       # http://127.0.0.1:8080/service

# terminal 2
cd packages/page-builder && npm install && npm run build         # the example links the shim from here
cd examples/nextjs-storefront && npm install
cp .env.example .env.local
npm run dev                                                       # http://localhost:3000
```

Try:

- `/en-us` — the home page; `/de-de` — the same page in German.
- `/en-us/category/dresses?sort=price-asc` and `?facet.color=red` — a product listing with sort and facets.
- `/en-us/wool-coat/p/COAT-1` — a product page; `/en-us/nope/nope` — a 404.
- `/en-us?pb_preview=dev-preview&pb_edit=1` — preview with edit mode: the page carries the `data-pb-*`
  markers and mounts the bridge. A wrong token renders the published page with no markers.

## Configuration

| Variable | |
|---|---|
| `PB_SERVICE_URL` | the service URL including its Connect path, e.g. `https://service-….commercetools.app/service` |
| `PB_RENDER_KEY` | the render key; required by the service in production |
| `PB_ORIGIN` | this storefront's public origin, sent as `X-PB-Origin`; must be on the service's `PB_RENDER_ORIGINS` |
| `PB_TIMEOUT_MS` | render call timeout, default 2000 |
| `STORE_KEY` | the commercetools store key that scopes products to this storefront |

## Push the catalog (CI)

`scripts/catalog.mjs` has no dependencies. It reads `PB_SERVICE_URL` and `PB_ADMIN_SECRET`:

```sh
npm run pb:validate   # pull requests: structure and references; writes nothing; exit 1 with every error
npm run pb:push       # after the deploy: writes the catalog as a draft (idempotent by content hash)
npm run pb:publish    # after the push: go live
```

Deploy the storefront first, then push, then publish, so the live catalog never names a block the
live storefront cannot render. A sketch of the pipeline:

```yaml
- run: npm run pb:validate            # on pull_request
  env: { PB_SERVICE_URL: ${{ vars.PB_SERVICE_URL }}, PB_ADMIN_SECRET: ${{ secrets.PB_ADMIN_SECRET }} }
# …after the deploy job succeeds, on main:
- run: npm run pb:push && npm run pb:publish
  env: { PB_SERVICE_URL: ${{ vars.PB_SERVICE_URL }}, PB_ADMIN_SECRET: ${{ secrets.PB_ADMIN_SECRET }} }
```

## Verifying against a real project

Everything above is verified against the fake. Against a real project (see the service README):
set `PB_SERVICE_URL`/`PB_RENDER_KEY`/`PB_ORIGIN`/`STORE_KEY`, push and publish the catalog, give the
project's preview settings route templates that match this app (`/{locale}`, `/{locale}/category/{slug}`,
`/{locale}/{slug}/p/{sku}`, `/{locale}/{slug}`), and open the page from the Merchant Center
page-builder's preview to exercise draft, edit mode and the bridge end to end.
