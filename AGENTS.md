# Custom Application Template Starter (TypeScript)

See root `AGENTS.md` for monorepo-wide context.

## Purpose

TypeScript starter template for Merchant Center Custom Applications, used both as living documentation and as the source directory that `create-mc-app` copies to scaffold new projects.

## Key Context

- This is a fully functional Custom Application -- it includes routes, components, hooks, i18n, tests, type definitions, and config files.
- `create-mc-app` clones this directory verbatim (minus `CHANGELOG.md`) into the user's new project. Every file, config, and directory name matters.
- Dependencies use `workspace:*` protocol in the monorepo, which pnpm's publish pipeline replaces with pinned versions in the published tarball.
- Has additional directories not in the JS starter: `@types/`, `@types-extensions/`, `schemas/`, and a `tsconfig.json`.
- Typechecked from the monorepo root via `pnpm typecheck:starter:custom-applications`.

## How To Work Here

This template has its own scripts that mirror a standalone app:

```sh
pnpm --filter @commercetools-applications/merchant-center-template-starter-typescript run start
pnpm --filter @commercetools-applications/merchant-center-template-starter-typescript run test
pnpm --filter @commercetools-applications/merchant-center-template-starter-typescript run build
pnpm --filter @commercetools-applications/merchant-center-template-starter-typescript run typecheck
```

The monorepo root also exposes convenience scripts: `pnpm template-custom-application-starter-typescript:start`, `pnpm template-custom-application-starter-typescript:build`.

## Gotchas

- Every file in this directory becomes part of the scaffolded output. Adding internal-only files (e.g. workspace tooling config, monorepo-specific scripts) will leak into end-user projects.
- The TypeScript starter must stay in sync with `starter` (JS) -- feature changes should be mirrored in both templates.
- This package is `private: true` and not published to npm directly. It is distributed via `create-mc-app`'s git-clone mechanism.

## Testing

Four independently-built units, each with its own runner, its own coverage report and its
own gate. There is no root manifest — `page-editor` installs with yarn, the others with npm —
so every command below is run from that unit's directory.

| Unit | Runner | Test | Coverage |
|---|---|---|---|
| `page-editor/` | Jest (`jest-preset-mc-app`) | `yarn test`, and `yarn test:service` (see below) | `yarn test:coverage` |
| `page-builder-service/` | Vitest | `npm test` | `npm run test:coverage` |
| `packages/page-builder/` (the shim) | Vitest | `npm test` | `npm run test:coverage` |
| `examples/nextjs-storefront/` | — (typechecked and built) | `npm run typecheck && npm run build` | — |

`.github/workflows/ci.yml` runs typecheck + tests (+ coverage) for each as a matrix on every pull
request and on pushes to `main` and `builder`. Typed clients are generated from
`page-builder-service/openapi.yaml`; the service and shim each have a test that fails when the
generated file drifts (`npm run generate:api`). `catalog.schema.json` exists twice (shim package,
service) and a service test fails if they differ (`npm run sync:schema` in the service).

### Two transports in `page-editor`

The page-builder data hooks talk to commercetools custom objects either through the Merchant Center
GraphQL gateway (default) or through the page-builder service (`src/service/`). The suite must pass
both ways: `yarn test` and `yarn test:service` (`PB_TEST_TRANSPORT=service`, which routes every hook
family through an in-process stand-in for the service's object gateway, backed by the same MSW store).
Failure injection (`failOperation`, `networkErrorOn`) is honoured by both. A test that sets
`environment` itself controls the transport and is not overridden.

### The coverage floors only ever move up

Each unit declares a `coverageThreshold` (Jest) / `coverage.thresholds` (Vitest) in its own
config. **Raise them when coverage improves; never lower one to make a change pass.** If a
change cannot meet the floor, it needs tests, not a smaller number. Statements and lines are
held at the 85% target; branches and functions sit lower on purpose, because branch coverage
on provider-heavy React costs far more than it detects.

Coverage counts the whole source tree, not just files a test imports. Exclusions are limited
to files with no hand-written behaviour — generated CT types, i18n data, `messages.ts`
catalogues, `.d.ts` declarations, re-export barrels and the test utilities.

### Shared test harness (`page-editor/src/test-utils/`)

- **`render.tsx`** — `renderWithProviders` / `renderHookWithProviders`. Wraps the MC
  application shell together with the Nimbus providers the app mounts in `entry-point.tsx`,
  and returns userEvent as `user` (the shell's own user fixture is re-exposed as `appUser`).
- **`msw/`** — an in-memory commercetools custom-object store behind MSW handlers. Seed it,
  render, then assert on what the store holds. `onUnhandledRequest: 'error'`, so a request
  no handler covers fails the test by name instead of silently returning nothing.
- **`factories/`** — builders for page documents, layout elements, catalogs, preview
  settings and the org directory, each taking a partial override.

### Things that will trip you up

- **`renderWithProviders` suspends.** It returns "Loading…" synchronously, so every
  assertion must `await` (`findBy*`, or `waitFor`).
- **Hover is `fireEvent.mouseOver`, not `user.hover`** — React synthesizes `onMouseEnter`
  from a root-level `mouseover`, and `mouseenter` does not bubble to a parent handler.
- **Row actions are hidden with `pointer-events: none`, not unmounted.** userEvent refuses
  to click them, which is the honest way to assert "not available yet".
- **Chakra compiles style props into classes** — there is no inline `transform` to assert
  on; compare the generated class between states.
- **Nimbus icons are `aria-hidden`** — identify one by its `<path d="…">` glyph rather than
  by DOM position.
- **Nimbus `NumberInput` reports its value on blur, not per keystroke** — type, press
  Enter, *then* move focus.
- **A component reading `useParams` needs a matching `<Route>`** — setting `route:` alone
  leaves the param undefined.

`jest-preset-mc-app.config.js` silences two third-party console messages (MSW's simulated
network errors and Nimbus `Tabs`' empty `href`); everything else still fails the test.
