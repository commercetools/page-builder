#!/usr/bin/env node
/**
 * Catalog CI client: validate / push / publish `page-builder.catalog.json` against the
 * page-builder service. No dependencies beyond Node 20.
 *
 *   node scripts/catalog.mjs validate   # PR check: nothing is written
 *   node scripts/catalog.mjs push       # write the catalog as a draft (idempotent)
 *   node scripts/catalog.mjs publish    # go live (run after the storefront deploy succeeds)
 *
 * Env: PB_SERVICE_URL (e.g. https://service-….commercetools.app/service), PB_ADMIN_SECRET.
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CATALOG_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'page-builder.catalog.json');
const COMMANDS = new Set(['validate', 'push', 'publish']);

function fail(message) {
  console.error(`pb: ${message}`);
  process.exit(1);
}

const command = process.argv[2];
if (!COMMANDS.has(command)) fail(`usage: catalog.mjs <${[...COMMANDS].join('|')}>`);

const base = process.env.PB_SERVICE_URL?.replace(/\/+$/, '');
const secret = process.env.PB_ADMIN_SECRET;
if (!base) fail('PB_SERVICE_URL is not set');
if (!secret) fail('PB_ADMIN_SECRET is not set');

async function call(path, body) {
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    fail(`cannot reach ${base}: ${err.message}`);
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

function report({ errors = [], warnings = [] }) {
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
}

if (command === 'publish') {
  const { status, json } = await call('/v1/catalog/publish');
  if (status !== 200) fail(`publish failed (${status}): ${json.error?.message ?? JSON.stringify(json)}`);
  console.log(`published catalog appVersion ${json.appVersion} at ${json.publishedAt}`);
} else {
  const catalog = JSON.parse(await readFile(CATALOG_FILE, 'utf8'));
  const path = command === 'validate' ? '/v1/catalog/validate' : '/v1/catalog';
  const { status, json } = await call(path, catalog);
  report(json);
  if (status === 422) fail('catalog is invalid; nothing was written');
  if (status !== 200) fail(`${command} failed (${status}): ${json.error?.message ?? JSON.stringify(json)}`);
  console.log(command === 'validate' ? 'catalog is valid' : `catalog ${json.status} (appVersion ${json.appVersion})`);
}
