#!/usr/bin/env node
/**
 * Downloads the current sections config from CT and writes it to
 * data/sections-seed.json, so it can be re-seeded to another project.
 *
 * Usage:
 *   node scripts/download-sections.js [--env <path>]
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
  console.log(`\nPages Editor — Download Sections`);
  console.log(`  Project : ${env.PROJECT_KEY}`);
  console.log(`  Key     : sections\n`);

  const token = await fetchToken(env);

  const obj = await getCustomObject(env, token, "sections");
  const v = obj.value;

  // Schema v2: extract from draft history
  const version = v.draft.versions[v.draft.currentVersion - 1];
  const { sections } = version;

  const outFile = path.resolve(__dirname, "../data/sections-seed.json");
  fs.writeFileSync(outFile, JSON.stringify({ sections }, null, 2) + "\n");
  console.log(`Wrote ${sections.length} sections to data/sections-seed.json\n`);
}

main().catch((err) => {
  console.error("\nDownload failed:", err.message ?? err);
  process.exit(1);
});
