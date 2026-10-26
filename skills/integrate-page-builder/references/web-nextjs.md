# Web (Next.js App Router): using the shim

Supports steps 6 to 9 for a web client. Other platforms implement [render-contract.md](render-contract.md) directly instead. The package is `@commercetools-labs/page-builder`; its README and the reference storefront in `examples/` are the working examples.

## What the web integration consists of

Three things, and nothing else:

1. **One mount.** A single catch-all route renders every page: it passes the request path, the shopper's market (locale, currency, country, store) and the search params to the shim's `PageBuilder` component, plus two fallbacks.
   - `fallback`: rendered when the service has no page for the path. Make it a real "not found".
   - `errorFallback`: rendered when the service is unreachable or erroring. Make it a degraded but usable page. It defaults to `fallback`, which would turn every outage into a "not found"; set it.
2. **A component map.** Catalog type key to React component. Components receive the author's settings, already localized, with data in canonical shapes. Server components and async components work. Wrap editable text so the visual editor can edit in place; it is inert for shoppers.
3. **A catalog file.** A JSON file of component types, data sources, sections and theme that validates against the schema shipped in the package.

The client has no commercetools client, resolvers, Tailwind setup or preview/bridge code. The grid CSS is scoped and self-contained.

## Getting the shim into a client in another repository

The shim lives in the page-builder repository. A client in a different repository cannot rely on a relative file link outside its own checkout: it works on a developer machine and fails in the client's CI and hosting build. Pick one deliberately:

| Option | Works locally | Works in client CI | Notes |
|---|---|---|---|
| Relative file link to a checkout | yes | **no** | Fine for the first spike only |
| A packed tarball committed into the client repo | yes | yes | Build the package, pack it, commit the tarball, depend on it by path inside the client repo. Rebuild and recommit on every shim change |
| A git dependency | yes | yes if the build can read the repo | The shim is in a subdirectory of the repository, which plain git dependencies do not support |
| Publish to a registry | yes | yes | The cleanest steady state |

Record the choice in the client's docs and in the integration log. Whatever the option, the package must be **built** (`dist/` exists) before the client installs it.

## Configuration (all also available as props)

| Variable | Meaning |
|---|---|
| `PB_SERVICE_URL` | Service URL including its endpoint path |
| `PB_RENDER_KEY` | The render key |
| `PB_ORIGIN` | The client's public origin, sent as `X-PB-Origin`; must be on the service allowlist |
| `PB_TIMEOUT_MS` | Render call budget, default 2000 |

A missing or invalid value throws in development and logs and shows the error fallback in production.

## Framing for preview

The Merchant Center frames the client to preview it. The client's response headers must allow the Merchant Center origin of the project's region to frame it (`frame-ancestors`, and no conflicting `X-Frame-Options`). Allow it only where preview is needed (staging, local); production can stay unframeable if authors preview on staging.

## Catalog in CI

Three calls against the service with the admin secret, in this order: validate (on change requests, writes nothing), then after the client deploys, push and publish. The reference storefront ships a dependency-free script for this.

## Rendering rules

- Page rendering is dynamic; do not wrap it in a framework cache.
- Keep the market derivation in one place so URLs, `locale` and `store` never disagree.
- Use the client's design system inside components; the shim only owns the grid and theme CSS.
