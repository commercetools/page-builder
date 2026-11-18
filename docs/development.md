# Development

Three parts, each installed, tested and built on its own from its own folder. There is no root manifest.
The working context for contributors and coding agents (shared contracts, the test harness and its gotchas,
coverage rules) is in [AGENTS.md](../AGENTS.md).

## Run the service locally

```bash
cd page-builder-service
npm install
npm run dev:fake       # http://127.0.0.1:8080/service against an in-memory commercetools
```

To run it against a real project, and to let the local editor call it directly, see the
[service README](../page-builder-service/README.md#local-development-with-the-merchant-center-app).

## Run the editor locally

```bash
cd page-editor
cp .env.example .env     # then fill in your application id and project key
yarn install
yarn start
```

The app is served at `http://localhost:3001` by default. To run it for real in your project, see [Deploy to Connect](connect-deployment.md).

## Editor commands

All dev commands run from the `page-editor/` directory:

| Command | Description |
|---|---|
| `yarn start` | Start the dev server |
| `yarn build` | Production build |
| `yarn typecheck` | TypeScript type check |
| `yarn lint` | ESLint |
| `yarn test` | Jest tests |
| `yarn test:service` | The same suite with every hook family routed through the page-builder service transport |
| `yarn format` | Prettier |

## Repository layout

```
page-editor/                  # Merchant Center Custom Application (the webapp)
  src/
    components/
      pages/                  # Pages view — tree + detail panel
        pages.tsx             # Root container
        page-tree-row.tsx     # Tree row component
        page-detail.tsx       # Detail panel (fetches per-page CT data)
        state-tag.tsx         # Draft/Published badge
      page-builder/           # Visual page builder — canvas, settings pane, menu bar
    hooks/
      use-page-builder-connector/          # CT hooks — per-page draft/published (read/write)
      use-components-connector/            # CT hooks — component catalog (read-only, host-pushed)
      use-data-sources-connector/          # CT hooks — data source type catalog (read-only, host-pushed)
      use-sections-connector/              # CT hooks — section catalog (read-only, host-pushed)
      use-data-source-instances-connector/ # CT hooks — saved data source instances (read/write)
      use-categories-connector/            # CT hooks — category tree
    service/                  # Transport to the page-builder service (Apollo link, config, forward-to)

packages/
  page-builder/                # @commercetools-labs/page-builder 1.0 — the storefront shim (see Host integration)

connect.yaml                   # Connect deployment: page-editor (MC custom app) + page-builder-service

page-builder-service/          # The per-project Connect service: render, catalog ingest, MC object gateway
  openapi.yaml                 # The /v1 API; shim and service types are generated from it

docs/sdd/                      # Wire contracts shared by the service, shim and builder

skills/
  integrate-page-builder/       # The step-by-step guide for integrating a client application
```
