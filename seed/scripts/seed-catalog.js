#!/usr/bin/env node
/**
 * Pushes `data/catalog.json` (components, data sources, sections, theme) to the page-builder
 * service and publishes it. The service is the only writer of catalog objects.
 *
 * Usage:
 *   PB_SERVICE_URL=https://…/service PB_ADMIN_SECRET=… node scripts/seed-catalog.js [--no-publish] [--validate]
 */

"use strict";

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const base = (process.env.PB_SERVICE_URL || "").replace(/\/+$/, "");
const secret = process.env.PB_ADMIN_SECRET;
if (!base || !secret) {
  console.error("\nError: set PB_SERVICE_URL (including /service) and PB_ADMIN_SECRET.\n");
  process.exit(1);
}

async function post(route, body) {
  const res = await fetch(`${base}${route}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : {} };
}

(async () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "catalog.json"), "utf8"));
  const validateOnly = args.includes("--validate");

  const pushed = await post(validateOnly ? "/v1/catalog/validate" : "/v1/catalog", catalog);
  for (const w of pushed.json.warnings || []) console.warn(`warning: ${w}`);
  if (pushed.status !== 200) {
    for (const e of pushed.json.errors || []) console.error(`error: ${e}`);
    console.error(`\nFailed (${pushed.status}): ${pushed.json.error?.message ?? "catalog invalid"}\n`);
    process.exit(1);
  }
  console.log(validateOnly ? "catalog is valid" : `catalog ${pushed.json.status} (appVersion ${pushed.json.appVersion})`);
  if (validateOnly || args.includes("--no-publish")) return;

  const published = await post("/v1/catalog/publish");
  if (published.status !== 200) {
    console.error(`\nPublish failed (${published.status}): ${published.json.error?.message}\n`);
    process.exit(1);
  }
  console.log(`published appVersion ${published.json.appVersion}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
