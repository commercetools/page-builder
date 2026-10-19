#!/usr/bin/env node
/**
 * page-builder-sync — sync host-owned page-builder definitions into commercetools.
 *
 * Commands (one package, arg-driven):
 *   sync      Push definitions to CT as a DRAFT (idempotent, non-destructive).
 *   publish   Copy the latest draft head into `published` (go-live).
 *   pull      Read the current CT catalog to disk (+ optional TS stubs).
 *   validate  Lint a catalog bundle for referential integrity (no CT access).
 *
 * Credentials come from the environment (CTP_PROJECT_KEY / CTP_CLIENT_ID /
 * CTP_CLIENT_SECRET / CTP_AUTH_URL / CTP_API_URL, optional CTP_SCOPES) — defaulting to the
 * host's own `.env` (best-effort; no error if absent, since CI usually sets real env vars
 * directly), the same file/client the storefront runtime uses. The client needs
 * `manage_key_value_documents` in addition to whatever the runtime already uses it for. Pass
 * --env <path> to point at a different file/client instead, if your deploy pipeline prefers
 * to keep one dedicated to this CLI.
 */

import { loadEnv, requireEnv } from './core/env.js';
import { fetchToken } from './core/ct-client.js';
import { loadCatalogBundle } from './catalog/input.js';
import { ALL_KEYS, type SyncContext } from './commands/context.js';
import { runSync } from './commands/sync.js';
import { runPublish } from './commands/publish.js';
import { runPull } from './commands/pull.js';
import { runValidate } from './commands/validate.js';
import { runInit, NEXT_STEPS } from './commands/init.js';
import type { CatalogKey } from './contract.js';

type Flags = {
  input?: string;
  only?: CatalogKey[];
  env?: string;
  out?: string;
  stubs?: string;
  dryRun: boolean;
  diff: boolean;
  force: boolean;
  yes: boolean;
  help: boolean;
};

const VALUE_FLAGS = new Set(['--input', '--only', '--env', '--out', '--stubs']);

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { dryRun: false, diff: false, force: false, yes: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (VALUE_FLAGS.has(arg)) {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${arg} requires a value`);
      if (arg === '--input') flags.input = value;
      else if (arg === '--env') flags.env = value;
      else if (arg === '--out') flags.out = value;
      else if (arg === '--stubs') flags.stubs = value;
      else if (arg === '--only') flags.only = parseOnly(value);
    } else if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--diff') flags.diff = true;
    else if (arg === '--force' || arg === '-f') flags.force = true;
    else if (arg === '--yes' || arg === '-y') flags.yes = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return flags;
}

function parseOnly(value: string): CatalogKey[] {
  const keys = value.split(',').map((s) => s.trim()) as CatalogKey[];
  const invalid = keys.filter((k) => !ALL_KEYS.includes(k));
  if (invalid.length) {
    throw new Error(
      `--only: unknown key(s) ${invalid.join(', ')}; valid: ${ALL_KEYS.join(', ')}`
    );
  }
  return keys;
}

function hydrateEnv(flags: Flags): void {
  if (flags.env) loadEnv(flags.env);
  else loadEnv('.env', true); // best-effort default; CI usually sets real env vars
}

async function connect(flags: Flags): Promise<SyncContext> {
  hydrateEnv(flags);
  const env = requireEnv();
  const token = await fetchToken(env);
  return { env, token };
}

const HELP = `page-builder <command> [flags]

Commands:
  init       Scaffold a starter integration into a host repo (no CT access).
             --out <dir>          destination root (default: current directory)
             --force              overwrite existing files
             --dry-run            report files without writing
  sync       Push definitions to CT as a draft (idempotent).
             --input <file|dir>   host catalog bundle (required)
             --only <keys>        comma list: components,data-sources,sections
             --dry-run            report actions without writing
             --diff               alias for --dry-run with per-key report
             --env <path>         dotenv file with CTP_* credentials
  publish    Promote the latest draft head to published (go-live).
             --only <keys>  --dry-run  --env <path>
  pull       Write the current CT catalog to disk.
             --out <file|dir>     default page-builder.catalog.json
             --stubs <file>       also emit a contract-typed .ts stub
             --only <keys>  --env <path>
  validate   Lint a catalog bundle (no CT access).
             --input <file|dir>   (required)
`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  if (!command || flags.help || command === 'help') {
    console.log(HELP);
    return;
  }

  const now = new Date().toISOString();

  switch (command) {
    case 'init': {
      const out = flags.out ?? '.';
      const result = runInit({ out, force: flags.force, dryRun: flags.dryRun });
      for (const f of result.wrote) console.log(`  ${flags.dryRun ? 'would write' : 'wrote'} ${f}`);
      for (const f of result.skipped) console.log(`  skipped (exists) ${f}`);
      if (result.skipped.length && !flags.force) {
        console.log('\n  re-run with --force to overwrite the skipped files.');
      }
      console.log(flags.dryRun ? '\ninit dry-run complete (no writes).' : NEXT_STEPS);
      return;
    }

    case 'validate': {
      if (!flags.input) throw new Error('validate requires --input');
      const bundle = loadCatalogBundle(flags.input);
      const result = runValidate(bundle);
      for (const w of result.warnings) console.warn(`warning: ${w}`);
      if (!result.ok) {
        for (const e of result.errors) console.error(`error: ${e}`);
        process.exitCode = 1;
        return;
      }
      console.log('catalog is valid.');
      return;
    }

    case 'sync': {
      if (!flags.input) throw new Error('sync requires --input');
      const bundle = loadCatalogBundle(flags.input);
      const ctx = await connect(flags);
      const dryRun = flags.dryRun || flags.diff;
      const result = await runSync({ ctx, bundle, only: flags.only, dryRun, now });
      for (const w of result.validation.warnings) console.warn(`warning: ${w}`);
      for (const r of result.perKey) {
        console.log(`  ${r.key}: ${r.action} (${r.versionCount} draft versions)`);
      }
      console.log(dryRun ? 'sync dry-run complete (no writes).' : 'sync complete (draft).');
      return;
    }

    case 'publish': {
      const ctx = await connect(flags);
      const result = await runPublish({
        ctx,
        only: flags.only,
        dryRun: flags.dryRun,
        now,
      });
      for (const r of result.perKey) {
        console.log(
          `  ${r.key}: ${r.action}${r.appVersion ? ` (appVersion ${r.appVersion})` : ''}`
        );
      }
      console.log(flags.dryRun ? 'publish dry-run complete.' : 'publish complete.');
      return;
    }

    case 'pull': {
      const ctx = await connect(flags);
      const result = await runPull({
        ctx,
        only: flags.only,
        out: flags.out ?? 'page-builder.catalog.json',
        stubs: flags.stubs,
      });
      for (const r of result.perKey) {
        console.log(`  ${r.key}: ${r.found ? 'pulled' : 'not found (empty)'}`);
      }
      for (const f of result.wrote) console.log(`  wrote ${f}`);
      console.log('pull complete.');
      return;
    }

    default:
      console.error(`unknown command: ${command}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`\npage-builder failed: ${err?.message ?? err}\n`);
  process.exitCode = 1;
});
