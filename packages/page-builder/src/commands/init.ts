/**
 * `init` — scaffold a starter page-builder integration into a host repo.
 *
 * Copies the template tree shipped in the package's `templates/` dir into the target
 * directory (default: cwd), skipping files that already exist unless `--force`. No CT
 * access, no network. This writes NEW files only and never edits existing ones — the
 * printed checklist covers the manual wiring (Tailwind, mounting the bridge, env).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** dist/commands/init.js → package root → templates/ */
const TEMPLATES_DIR = path.resolve(HERE, '../../templates');

export type InitOptions = {
  /** Destination root for the scaffold (default: process.cwd()). */
  out: string;
  /** Overwrite files that already exist. */
  force?: boolean;
  /** Report actions without writing. */
  dryRun?: boolean;
};

export type InitResult = {
  wrote: string[];
  skipped: string[];
};

/** All file paths under `dir`, relative to `base`, with POSIX-style separators. */
function walk(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

export function runInit(opts: InitOptions): InitResult {
  const { out, force, dryRun } = opts;
  if (!fs.existsSync(TEMPLATES_DIR)) {
    throw new Error(`templates directory not found: ${TEMPLATES_DIR}`);
  }

  const wrote: string[] = [];
  const skipped: string[] = [];

  for (const rel of walk(TEMPLATES_DIR, TEMPLATES_DIR)) {
    const src = path.join(TEMPLATES_DIR, rel);
    const dest = path.resolve(out, rel);
    if (fs.existsSync(dest) && !force) {
      skipped.push(rel);
      continue;
    }
    if (!dryRun) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
    wrote.push(rel);
  }

  return { wrote, skipped };
}

/** The post-scaffold checklist printed to the user. */
export const NEXT_STEPS = `
Next steps (init writes files only — do these by hand; see lib/page-builder/AGENTS.md):
  1. Tailwind: add this package to your @source and safelist col-span-*/visibility classes.
  2. Point lib/page-builder/sections.tsx's getCustomObjectValue import at your CT reader.
  3. Mount <BridgeMount/> in app/layout.tsx inside <body>.
  4. Copy .env.example into your .env and fill in CTP_* + PB_* values (one file covers both
     the storefront runtime and the CLI below — no separate deploy-only env file needed).
  5. Push the catalog to commercetools:
       npx @commercetools-labs/page-builder sync --input page-builder.catalog.json
       npx @commercetools-labs/page-builder publish
  6. In every route that renders page-builder content, mount <Sections pageType=... params=...
     searchParams=...>, passing params/searchParams straight through from Next.
  7. Open your app with ?pb_edit=1 from the Merchant Center to verify the bridge.
  8. Replace the <Placeholder/> entries in lib/page-builder/registry.tsx with your
     real components, then re-run build-catalog + sync if you changed catalog.ts.
`;
