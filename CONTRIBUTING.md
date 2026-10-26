# Contributing

Thank you for wanting to improve the page builder. Issues and pull requests are welcome. This is commercetools-labs reference code, so we can't promise a review time, but we will look when we can. See [SUPPORT.md](SUPPORT.md) for what to expect.

By contributing you agree that your contribution is licensed under the [MIT licence](LICENSE).

## What is where

| Directory | What it is | Check it with |
|---|---|---|
| `page-builder-service/` | The service (Connect application): render API, catalog ingest, Merchant Center object gateway | `npm test`, `npm run typecheck`, `npm run lint:api` |
| `packages/page-builder/` | The storefront shim (`@commercetools-labs/page-builder`) | `npm install --legacy-peer-deps`, then `npm test`, `npm run typecheck` |
| `page-editor/` | The Merchant Center custom application | `yarn test`, `yarn typecheck`, `yarn lint` |
| `examples/nextjs-storefront/` | A small reference storefront | `npm run typecheck` |
| `seed/` | Development scripts that write sample data into a project | |
| `openspec/`, `docs/sdd/` | What the product does and the wire contracts | |

The service runs entirely against an in-memory commercetools in its tests, so you need no credentials to run any of the checks above.

## Before you open a pull request

- Keep the change focused and say what problem it solves.
- Run the checks for every directory you touched. The service enforces coverage floors; please don't lower them.
- If you change behavior, update the matching spec in `openspec/specs/` or the contract in `docs/sdd/`, and the README that describes it.
- If you change the HTTP API, change `page-builder-service/openapi.yaml` and regenerate the types (`npm run generate:api` in the service and in the shim). A test fails when they drift.
- Do not commit secrets, API clients or project-specific values. `.env` files are git-ignored; add placeholders to the `.env.example` next to them.

## Reporting a problem

An issue with the steps to reproduce, what you expected and what happened is the most useful thing you can send. Please leave out credentials and customer data.
