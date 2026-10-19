# Contributing

Contributions are welcome — thank you for considering one. This is a commercetools Labs project
(see [SUPPORT.md](SUPPORT.md)), so reviews happen when time allows.

## Getting set up

- `page-editor/` — the Merchant Center custom application. Use yarn: `yarn install`, `yarn test`,
  `yarn typecheck`.
- `packages/page-builder/` — the rendering SDK and CLI. Use npm: `npm ci`, `npm test`,
  `npm run typecheck`.
- `seed/` — scripts that put sample data into a commercetools project.

See [AGENTS.md](AGENTS.md) for conventions and commands.

## Pull requests

1. Open an issue or start a discussion first for anything larger than a small fix.
2. Branch from `develop` and open your pull request against `develop`.
3. Keep changes focused, and add or update tests for behaviour you change.
4. Make sure typecheck and tests pass in each unit you touched.

By contributing, you agree your contribution is licensed under the [MIT License](LICENSE).
