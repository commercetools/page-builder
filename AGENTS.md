# Page builder (commercetools-labs)

Read [README.md](README.md) for what this is and how it is deployed. This file is the working
context for people and agents changing the code.

## Purpose

A page builder for headless storefronts on commercetools: authors compose pages in a Merchant
Center custom application from components the developers define, and a storefront draws them
through a small service. Reference code (MIT, unsupported), published as commercetools-labs.

## The three units

Three independently built units, no root manifest. Run every command from the unit's own
directory.

| Unit | Package | Tooling | What it is |
|---|---|---|---|
| `page-editor/` | `@commercetools-labs/pages-editor` | yarn, Jest | The Merchant Center custom application (Pages view, Page Builder canvas) |
| `page-builder-service/` | `@commercetools-labs/page-builder-service` | npm, Vitest | The per-project Connect service: render API, catalog ingest, Merchant Center object gateway |
| `packages/page-builder/` | `@commercetools-labs/page-builder` | npm, Vitest | The storefront shim (`<PageBuilder/>`, React/Next.js) |

Also in the repo: `docs/sdd/` (wire contracts shared by all three), `skills/integrate-page-builder/`
(integration guide for client apps), and [`connect.yaml`](connect.yaml), which deploys
`page-editor` and `page-builder-service` as Connect applications.

## How to work here

```sh
cd page-editor && yarn start        # http://localhost:3001
cd page-editor && yarn typecheck && yarn lint && yarn test
cd page-builder-service && npm run dev:fake   # in-memory commercetools, no credentials
cd page-builder-service && npm test && npm run typecheck
cd packages/page-builder && npm install --legacy-peer-deps && npm test
```

## Gotchas

- **Contracts live in `docs/sdd/`.** A change to a wire format (definitions, preview/bridge,
  canonical shapes) changes the doc, the service, the shim and the editor together.
- **The HTTP API is `page-builder-service/openapi.yaml`.** Service and shim types are generated from
  it (`npm run generate:api` in each); a test fails when the generated file drifts.
- **`catalog.schema.json` exists twice** (`packages/page-builder/` and the service). Edit the shim's
  and run `npm run sync:schema` in the service; a test fails if they differ.
- **The service is the only holder of commercetools credentials.** The storefront never reads the
  custom objects; the editor reaches them through the service (or the MC GraphQL gateway when
  `PAGE_BUILDER_SERVICE_URL` is empty).
- **Page data lives in `page-editor*` custom objects**, schema v2/v3 with `draft.versions[]` (capped at 50)
  and `published`. The host catalog objects are read-only in the editor.
- **`PAGE_BUILDER_SERVICE_*` are build-time settings** of the editor. `PB_DEV_TOKEN` /
  `PAGE_BUILDER_SERVICE_DEV_TOKEN` are development-only on both sides and must never reach production.
- **Keep `connect.yaml` and the READMEs in step** when a configuration key is added or changed:
  `connect.yaml`, the table in `page-builder-service/README.md`, and `page-editor/.env.example`.
- **Never commit secrets, API clients or project-specific values.** `.env` files are git-ignored; add
  placeholders to the `.env.example` next to them. No customer names or internal hostnames in code,
  docs, fixtures or commit messages: the repo goes through the commercetools-labs publish gate.

## Testing

Each unit has its own runner, coverage report and gate. CI (when present) runs typecheck, tests and
coverage per unit on every pull request.

| Unit | Test | Coverage |
|---|---|---|
| `page-editor/` | `yarn test`, and `yarn test:service` | `yarn test:coverage` |
| `page-builder-service/` | `npm test` | `npm run test:coverage` |
| `packages/page-builder/` | `npm test` | `npm run test:coverage` |

The service and shim run against an in-memory commercetools, so no credentials are needed.

### Two transports in `page-editor`

The data hooks talk to commercetools custom objects either through the Merchant Center GraphQL
gateway (default) or through the page-builder service (`src/service/`). The suite must pass both ways:
`yarn test` and `yarn test:service` (`PB_TEST_TRANSPORT=service`, which routes every hook family
through an in-process stand-in for the service's object gateway, backed by the same MSW store).
Failure injection (`failOperation`, `networkErrorOn`) is honoured by both. A test that sets
`environment` itself controls the transport and is not overridden.

### The coverage floors only ever move up

Each unit declares a `coverageThreshold` (Jest) / `coverage.thresholds` (Vitest) in its own config.
**Raise them when coverage improves; never lower one to make a change pass.** If a change cannot
meet the floor, it needs tests, not a smaller number. Statements and lines are held at the 85%
target; branches and functions sit lower on purpose. Coverage counts the whole source tree;
exclusions are limited to files with no hand-written behaviour (generated types, i18n data,
`messages.ts`, `.d.ts`, re-export barrels, test utilities).

### Shared test harness (`page-editor/src/test-utils/`)

- **`render.tsx`**: `renderWithProviders` / `renderHookWithProviders`, wrapping the MC application
  shell and the Nimbus providers; returns userEvent as `user` (the shell's own user as `appUser`).
- **`msw/`**: an in-memory custom-object store behind MSW handlers. Seed it, render, assert on what
  the store holds. `onUnhandledRequest: 'error'`.
- **`factories/`**: builders for page documents, layout elements, catalogs, preview settings and the
  org directory, each taking a partial override.

### Things that will trip you up

- **`renderWithProviders` suspends.** It returns "Loading…" synchronously, so every assertion must
  `await` (`findBy*`, or `waitFor`).
- **Hover is `fireEvent.mouseOver`, not `user.hover`.**
- **Row actions are hidden with `pointer-events: none`, not unmounted**, so userEvent refuses to
  click them.
- **Chakra compiles style props into classes**: compare generated classes, not inline styles.
- **Nimbus icons are `aria-hidden`**: identify one by its `<path d="…">`.
- **Nimbus `NumberInput` reports on blur**: type, press Enter, then move focus.
- **A component reading `useParams` needs a matching `<Route>`.**
