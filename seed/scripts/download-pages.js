#!/usr/bin/env node
/**
 * Downloads all pages from CT and writes each to data/pages/{pageId}.json.
 * Also downloads the shared data-source-instances into data/data-source-instances.json.
 *
 * Usage:
 *   node scripts/download-pages.js [--env <path>]
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
  listCustomObjects,
  getCustomObject,
} = require("./_lib");

const args = process.argv.slice(2);
const envFile = flag(args, "--env") ?? ".env.seed";

loadEnv(envFile);
const env = requireEnv();

async function main() {
  console.log(`\nPages Editor — Download All Pages`);
  console.log(`  Project : ${env.PROJECT_KEY}\n`);

  const token = await fetchToken(env);

  // Ensure output directory exists
  const pagesDir = path.resolve(__dirname, "../data/pages");
  if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });

  // Prefer the v3 published container (self-contained inline snapshot).
  const publishedObjects = (
    await listCustomObjects(env, token, "page-editor-published")
  ).filter((o) => /^page-(.+)$/.test(o.key));

  const seen = new Set();
  let written = 0;
  for (const obj of publishedObjects) {
    const pageId = obj.key.match(/^page-(.+)$/)[1];
    const page = obj.value?.page;
    if (!page) continue;
    fs.writeFileSync(
      path.join(pagesDir, `${pageId}.json`),
      JSON.stringify({ page }, null, 2) + "\n",
    );
    seen.add(pageId);
    written++;
    console.log(`  Wrote data/pages/${pageId}.json`);
  }

  // Legacy fallback: pre-v3 combined objects still in the `page-editor` container.
  const legacyObjects = (await listCustomObjects(env, token)).filter((o) =>
    /^page-(.+)$/.test(o.key),
  );
  for (const obj of legacyObjects) {
    const pageId = obj.key.match(/^page-(.+)$/)[1];
    if (seen.has(pageId)) continue;
    const v = obj.value;
    const page =
      v?.published?.page ??
      v?.draft?.versions?.[(v.draft.currentVersion ?? 1) - 1]?.page ??
      null;
    if (!page) continue;
    fs.writeFileSync(
      path.join(pagesDir, `${pageId}.json`),
      JSON.stringify({ page }, null, 2) + "\n",
    );
    seen.add(pageId);
    written++;
    console.log(`  Wrote data/pages/${pageId}.json (legacy)`);
  }

  if (written === 0) {
    console.log("No page objects found.\n");
    return;
  }

  // Download shared data-source instances (best-effort)
  try {
    const instancesObj = await getCustomObject(
      env,
      token,
      "data-source-instances",
    );
    // Schema v2: extract from draft subkey
    const instances =
      instancesObj.value?.draft?.instances ??
      instancesObj.value?.instances ??
      [];
    const outFile = path.resolve(
      __dirname,
      "../data/data-source-instances.json",
    );
    fs.writeFileSync(outFile, JSON.stringify({ instances }, null, 2) + "\n");
    console.log(
      `\n  Wrote data/data-source-instances.json (${instances.length} instance(s))`,
    );
  } catch (err) {
    if (err.message.startsWith("HTTP 404")) {
      console.log("\n  No data-source-instances object found — skipping.");
    } else {
      throw err;
    }
  }

  console.log("\nDownload complete.\n");
}

main().catch((err) => {
  console.error("\nDownload failed:", err.message ?? err);
  process.exit(1);
});
