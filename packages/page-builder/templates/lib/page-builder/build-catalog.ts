/**
 * Regenerate `page-builder.catalog.json` from the TS catalog (the source of truth).
 *
 * Run from the repo root:
 *   npx tsx lib/page-builder/build-catalog.ts
 * (or add `"pb:build-catalog": "tsx lib/page-builder/build-catalog.ts"` to package.json).
 *
 * The generated JSON is what `page-builder sync` pushes to commercetools. Commit it so
 * `sync` works in CI without a build step. Imports only `catalog.ts` (React-free).
 *
 * Scaffolded by `@commercetools-labs/page-builder init`.
 */
import { writeFileSync } from 'node:fs';
import { buildCatalog } from '@commercetools-labs/page-builder';

import { blocks, componentGroups, sections } from './catalog';

const bundle = buildCatalog({
  blocks,
  componentGroups,
  dataSources: [],
  dataSourceGroups: [],
  sections,
});

const OUT = 'page-builder.catalog.json';
writeFileSync(OUT, JSON.stringify(bundle, null, 2) + '\n');
console.log(`wrote ${OUT}`);
