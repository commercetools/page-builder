#!/usr/bin/env node
/**
 * Catalog CI client: validate / push / publish the client's catalog file against the
 * page-builder service. No dependencies beyond Node 20. Copy it into the client's repository.
 *
 *   node catalog.mjs validate [file]   # change-request check: nothing is written
 *   node catalog.mjs push [file]       # write the catalog as a draft (idempotent)
 *   node catalog.mjs publish           # go live (run after the client's deploy succeeds)
 *
 * `file` defaults to $PB_CATALOG_FILE, then ./page-builder.catalog.json in the current directory.
 * Env: PB_SERVICE_URL (the service URL including /service, e.g.
 * https://service-….commercetools.app/service) and PB_ADMIN_SECRET. Keep the secret in CI secrets only.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const COMMANDS = new Set(['validate', 'push', 'publish']);

function fail(message) {
  console.error(`pb: ${message}`);
  process.exit(1);
}

const command = process.argv[2];
if (!COMMANDS.has(command)) fail(`usage: catalog.mjs <${[...COMMANDS].join('|')}> [catalog file]`);
const CATALOG_FILE = resolve(process.argv[3] ?? process.env.PB_CATALOG_FILE ?? 'page-builder.catalog.json');

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
  let catalog;
  try {
    catalog = JSON.parse(await readFile(CATALOG_FILE, 'utf8'));
  } catch (err) {
    fail(`cannot read the catalog file ${CATALOG_FILE}: ${err.message}`);
  }
  const path = command === 'validate' ? '/v1/catalog/validate' : '/v1/catalog';
  const { status, json } = await call(path, catalog);
  report(json);
  if (status === 422) fail('catalog is invalid; nothing was written');
  if (status !== 200) fail(`${command} failed (${status}): ${json.error?.message ?? JSON.stringify(json)}`);
  console.log(command === 'validate' ? 'catalog is valid' : `catalog ${json.status} (appVersion ${json.appVersion})`);
}
