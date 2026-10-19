#!/usr/bin/env node
/**
 * Downloads the current components config from CT and writes it to
 * data/components-seed.json, so it can be re-seeded to another project.
 *
 * Usage:
 *   node scripts/download-components.js [--env <path>]
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
  console.log(`\nPages Editor — Download Components`);
  console.log(`  Project : ${env.PROJECT_KEY}`);
  console.log(`  Key     : components\n`);

  const token = await fetchToken(env);

  const obj = await getCustomObject(env, token, "components");
  const v = obj.value;

  // Schema v2: extract from draft history
  const version = v.draft.versions[v.draft.currentVersion - 1];
  const { groups, components } = version;

  const outFile = path.resolve(__dirname, "../data/components-seed.json");
  fs.writeFileSync(
    outFile,
    JSON.stringify({ groups, components }, null, 2) + "\n",
  );
  console.log(
    `Wrote ${components.length} components in ${groups.length} groups to data/components-seed.json\n`,
  );
}

main().catch((err) => {
  console.error("\nDownload failed:", err.message ?? err);
  process.exit(1);
});
