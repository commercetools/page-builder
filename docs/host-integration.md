# Host integration

A storefront integrates with three things, none of which touch commercetools:

1. **A component map and one mount** — `<PageBuilder>` from [`@commercetools-labs/page-builder`](../packages/page-builder/README.md) (v1.0, React/Next.js only) renders any page.
2. **A catalog file** — `page-builder.catalog.json` declares the component types (with editable fields), data sources (each naming a service resolver), sections and theme tokens. CI validates it and pushes it to the service.
3. **The page-builder service** — a per-project commercetools Connect service ([`page-builder-service/`](../page-builder-service/README.md)) that reads pages and drafts, gates preview, resolves data into [canonical shapes](sdd/canonical-shapes.md), and returns the render tree. It is the only component holding commercetools credentials.

```
Merchant Center ──(MC user JWT)──▶ service ◀──(render key)── storefront shim
   page-editor                        │                         <PageBuilder/>
                                      ▼
                          commercetools custom objects, products, categories
```

Step by step, for any client (web or native): [the integration guide](../skills/integrate-page-builder/SKILL.md). Contracts: [definitions](sdd/definitions-contract.md), [preview and bridge](sdd/preview-contract.md), [canonical shapes](sdd/canonical-shapes.md), and the HTTP API in [`openapi.yaml`](../page-builder-service/openapi.yaml).

## Wire it up

1. **Deploy the service** to the project, as in [Deploy to Connect](connect-deployment.md) (Connect application `page-builder-service`, endpoint `/service`). Set `PB_RENDER_KEY`, `PB_RENDER_ORIGINS`, `PB_PREVIEW_TOKEN`, `PB_ADMIN_SECRET`, `PB_EDITOR_ORIGINS`, and the API client (`CTP_*`, scope `manage_key_value_documents view_products view_categories view_stores`). Details and verification steps: [`page-builder-service/README.md`](../page-builder-service/README.md).
2. **Install the shim** — `npm i @commercetools-labs/page-builder` — and set `PB_SERVICE_URL`, `PB_RENDER_KEY`, `PB_ORIGIN`.
3. **Mount it** in a catch-all route, passing the request path, the shopper's market (`locale`, `currency`, `country`, `store`) and `searchParams`.
4. **Map components** — each catalog `type` to a React component taking `{ data }`; use `PBText` for inline-editable text.
5. **Write the catalog file** and add the CI steps: validate on pull requests, push and publish after deploy (`skills/integrate-page-builder/scripts/catalog.mjs` has no dependencies).
6. **Point the Merchant Center app** at the service: set `PAGE_BUILDER_SERVICE_URL` and `PAGE_BUILDER_SERVICE_HOOKS` (see [Merchant Center app and the service](host-integration.md#merchant-center-app-and-the-service)), and give the project's preview settings the storefront's route templates.

Preview and visual editing need nothing more in the host: forward `searchParams` and the service decides (token, drafts, edit mode, allowed origins, manifest).

## Storage contract

Pages and the catalog live in the `page-editor*` custom-object containers described under [Custom objects](data-model.md). The service is the only reader the storefront has; do not read them from a host.

## Merchant Center app and the service

The app's page-builder data hooks (pages, components, comments, workflows, preview settings, data-source instances, catalogs, reset) can go through the service instead of the Merchant Center GraphQL gateway, so MC users need no custom-object permission. It is switched by two build-time settings in `page-editor/.env`:

| Variable | |
|---|---|
| `PAGE_BUILDER_SERVICE_URL` | the service URL including `/service`; empty keeps every hook on the GraphQL gateway |
| `PAGE_BUILDER_SERVICE_HOOKS` | `all`, or a comma list of `pages, page-components, comments, workflows, page-workflow, preview-settings, data-sources, sections, components, instances, reset` |

The service must be configured with `PB_MC_ISSUER` (this project's Merchant Center API Gateway, e.g. `gcp-eu`) and, for its audience, the `CONNECT_SERVICE_URL` that Connect provides (its own public URL). Calls go through `/proxy/forward-to`; the service verifies the forwarded JWT, restricts access to the page-builder containers, keeps the host catalog read-only, and audit-logs each write with the acting user. The product/category pickers keep using the Merchant Center gateway. Roll out one family at a time (they are independent) and roll back by editing the list. Run `yarn test:service` in `page-editor/` to run the whole suite through the service transport.

**Local development.** The gateway runs in the cloud and cannot forward to a service on `localhost`, so with `PAGE_BUILDER_SERVICE_URL`
pointing there, `yarn start` can call the service directly with a plain `fetch` instead. Set the same token as
`PB_DEV_TOKEN` on the service (with `PB_EDITOR_ORIGINS=http://localhost:3001`) and as `PAGE_BUILDER_SERVICE_DEV_TOKEN` in
`page-editor/.env.local`, then restart `yarn start`. It is development-only on both sides: the app reads the token only under
`yarn start` and a production bundle does not contain the direct path, and the service refuses to start with `PB_DEV_TOKEN` set when
`NODE_ENV=production`. Details in the [service README](../page-builder-service/README.md#local-development-with-the-merchant-center-app).

## Images and videos

`kind: 'image'` and `kind: 'video'` fields upload to, and pick from, a Google Cloud Storage bucket owned by the **service**. The
editor needs only `PAGE_BUILDER_SERVICE_URL` (no hook family has to use the service); the service needs `PB_MEDIA_BUCKET` and
`PB_MEDIA_SERVICE_ACCOUNT_KEY_B64`. It reuses the same Merchant Center sign-in as everything else, so there is no separate media
service, token, business unit or image URL to configure. A field stores the plain file URL, so existing pages (including ones with a
URL typed or pasted in) keep working. The bucket setup, limits and security rules are in the
[service README](../page-builder-service/README.md#media-uploads). With no bucket configured the picker says so and nothing breaks.
