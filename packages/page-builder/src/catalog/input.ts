/**
 * Load the host's serialized definitions (a CatalogBundle) from --input.
 *
 * Accepts either a single JSON file whose shape is a CatalogBundle
 * (`{ components, "data-sources", sections }`), or a directory containing
 * `components.json`, `data-sources.json`, `sections.json`. The host produces this via its
 * `buildCatalog()` build step; the sync tool stays framework-agnostic by consuming JSON.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CatalogBundle } from '../contract.js';

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function emptyBundle(): CatalogBundle {
  return {
    components: { groups: [], components: [] },
    'data-sources': { groups: [], sources: [] },
    sections: { sections: [] },
  };
}

export function loadCatalogBundle(inputPath: string): CatalogBundle {
  const resolved = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`--input not found: ${resolved}`);
  }
  const stat = fs.statSync(resolved);

  if (stat.isDirectory()) {
    const bundle = emptyBundle();
    const comp = path.join(resolved, 'components.json');
    const ds = path.join(resolved, 'data-sources.json');
    const sec = path.join(resolved, 'sections.json');
    if (fs.existsSync(comp)) bundle.components = readJson(comp) as CatalogBundle['components'];
    if (fs.existsSync(ds))
      bundle['data-sources'] = readJson(ds) as CatalogBundle['data-sources'];
    if (fs.existsSync(sec)) bundle.sections = readJson(sec) as CatalogBundle['sections'];
    return bundle;
  }

  const parsed = readJson(resolved) as Partial<CatalogBundle>;
  const bundle = emptyBundle();
  if (parsed.components) bundle.components = parsed.components;
  if (parsed['data-sources']) bundle['data-sources'] = parsed['data-sources'];
  if (parsed.sections) bundle.sections = parsed.sections;
  return bundle;
}
