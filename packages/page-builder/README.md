# @commercetools-labs/page-builder

The host-side page-builder SDK — one package containing:

1. **The render runtime** a host storefront uses to render page-builder content.
2. **The `page-builder` CLI** that syncs component / data-source / section **definitions**
   (authored in host code) into the commercetools custom objects the Merchant Center Page
   Builder reads.
3. **The shared contract types** (single source of truth) both of the above import.

> Normative contract: [`docs/sdd/definitions-contract.md`](../../docs/sdd/definitions-contract.md).

## Install

```sh
npm i @commercetools-labs/page-builder     # runtime + contract (react is an optional peer)
```

## Entrypoints

- **`.`** — framework-agnostic core: the transform/resolve engine
  (`transformPageEditorToSections`, `resolveDataSources`, `localizeConfig`, `pickPage`,
  `pickValid`, `responsiveSize`), registry primitives (`defineBlock`, `defineDataSource`,
  `buildCatalog`, `buildManifest`), resolver/render/page types, preview flag helpers, and
  the full contract types.
- **`./react`** — `createSections({ componentForType, sectionBg })` → the grid render tree
  (Grid/Cell/Item/Sections/MissingItem), React Server Components. `createPageBuilderSections`
  wraps that AND the whole data side (config, `createPageStore`, `dynamicPages` gating,
  `resolvePageBuilderRoute`) into one `<Sections pageType params searchParams>` component a
  route mounts directly — no separate `renderPage` call. Add this package to the host's
  Tailwind `@source` and safelist the dynamic `col-span-*` / visibility classes.
- **`./bridge`** — `<VisualEditingBridge allowedOrigins components onRefresh />`, the
  `'use client'` visual-editing bridge. Framework-agnostic: the host injects `onRefresh`
  (e.g. Next's `router.refresh`).
- **`./contract`** — the contract types only (no runtime), for consumers that just want the
  wire types.

React is an **optional peer** — the `.`, `./contract`, and CLI never import it, so a
CLI-only or non-React consumer isn't forced to install React.

## CLI

```sh
page-builder init                                          # scaffold a starter integration (no CT access)
page-builder validate --input page-builder.catalog.json   # lint (no CT access)
page-builder sync     --input page-builder.catalog.json   # push as draft (idempotent)
page-builder publish                                       # promote draft → published
page-builder pull     --out page-builder.catalog.json      # CT → disk (migration/parity)
```

Flags: `--only components,data-sources,sections`, `--dry-run`, `--diff`, `--force`,
`--env <path>`, `--out <file|dir>`, `--stubs <file>`. Credentials via `CTP_*` env — defaults to
reading `.env` in the current directory (no `--env` needed); the client just needs
`manage_key_value_documents` in addition to whatever the storefront runtime already uses it
for. Pass `--env <path>` only if you want the CLI to use a different client/file. See
`.env.example`.

### `init` — scaffold a host integration

`page-builder init` copies a starter integration into the current repo (`--out <dir>` to
target elsewhere): a TS **catalog** (`lib/page-builder/catalog.ts`) + **registry**
(`registry.tsx`), the **sections** render binding (`createPageBuilderSections` — the full
request → render pipeline as one component, `sections.tsx`), a **bridge** mount
(`components/page-builder/BridgeMount.tsx`), placeholder block components, a checked-in
`page-builder.catalog.json` (so `sync` works immediately), `.env.example`, and an `AGENTS.md`
explaining how to finish wiring. It writes **new files only** (skips existing ones unless
`--force`) and never edits your code — the printed checklist covers the manual steps (Tailwind
`@source`/safelist, mounting the bridge, env). Typical first run:

```sh
npx @commercetools-labs/page-builder init
npx @commercetools-labs/page-builder sync --input page-builder.catalog.json
npx @commercetools-labs/page-builder publish
```

## Host usage sketch

```ts
// lib/layout.ts — bind the engine to this host's resolvers
import { transformPageEditorToSections, pickPage } from '@commercetools-labs/page-builder';
```
```tsx
// components/grid — bind the render layer to this host's registry + theme
import { createSections } from '@commercetools-labs/page-builder/react';
import { VisualEditingBridge } from '@commercetools-labs/page-builder/bridge';
```
```ts
// build:catalog step — serialize definitions for the CLI
import { buildCatalog } from '@commercetools-labs/page-builder';
```

## Lifecycle

`sync` writes **draft** only, idempotently (no-op when the payload's `sourceHash` is
unchanged), preserving draft history (capped at 50). `publish` is the separate go-live step.
Recommended order per deploy: **deploy host → sync (draft) → publish**.
