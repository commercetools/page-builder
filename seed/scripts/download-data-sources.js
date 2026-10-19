#!/usr/bin/env node
/**
 * Downloads the current data-sources config from CT and writes it to
 * data/data-sources-seed.json, so it can be re-seeded to another project.
 *
 * Usage:
 *   node scripts/download-data-sources.js [--env <path>]
 *
 * Defaults:
 *   --env     .env.seed
 */

"use strict";

const fs = require("fs");
const path = require("path");
const {
  flag,
  loadEnv,
  requireEnv,
  fetchToken,
  getCustomObject,
} = require("./_lib");

const args = process.argv.slice(2);
const envFile = flag(args, "--env") ?? ".env.seed";

loadEnv(envFile);
const env = requireEnv();

async function main() {
  console.log(`\nPages Editor — Download Data Sources`);
  console.log(`  Project : ${env.PROJECT_KEY}`);
  console.log(`  Key     : data-sources\n`);

  const token = await fetchToken(env);

  const obj = await getCustomObject(env, token, "data-sources");
  const v = obj.value;

  // Schema v2: extract from draft history
  const version = v.draft.versions[v.draft.currentVersion - 1];
  const { groups, sources } = version;

  const outFile = path.resolve(__dirname, "../data/data-sources-seed.json");
  fs.writeFileSync(
    outFile,
    JSON.stringify({ groups, sources }, null, 2) + "\n",
  );
  console.log(
    `Wrote ${sources.length} data sources in ${groups.length} groups to data/data-sources-seed.json\n`,
  );
}

main().catch((err) => {
  console.error("\nDownload failed:", err.message ?? err);
  process.exit(1);
});
