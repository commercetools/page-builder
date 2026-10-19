#!/usr/bin/env node
/**
 * Seeds the data-sources custom object (schema v2) in a CT project.
 *
 * Usage:
 *   node scripts/seed-data-sources.js [--env <path>] [--dry-run]
 *
 * Defaults:
 *   --env     .env.seed
 *
 * Required .env variables:
 *   CTP_PROJECT_KEY, CTP_CLIENT_ID, CTP_CLIENT_SECRET, CTP_AUTH_URL, CTP_API_URL
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { requireEnv, fetchToken } = require("./_lib");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
};
const hasFlag = (name) => args.includes(name);

const envFile = flag("--env") ?? ".env.seed";
const dryRun = hasFlag("--dry-run");

// ---------------------------------------------------------------------------
// Load .env file (minimal parser — no external deps)
// ---------------------------------------------------------------------------
const envPath = path.resolve(process.cwd(), envFile);
if (!fs.existsSync(envPath)) {
  console.error(`\nError: env file not found: ${envPath}`);
  console.error(
    `Copy .env.seed.example to ${envFile} and fill in your values.\n`,
  );
  process.exit(1);
}

const envLines = fs.readFileSync(envPath, "utf8").split("\n");
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  const val = trimmed
    .slice(eq + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!process.env[key]) process.env[key] = val;
}

// ---------------------------------------------------------------------------
// Validate required env vars
// ---------------------------------------------------------------------------
const required = [
  "CTP_PROJECT_KEY",
  "CTP_CLIENT_ID",
  "CTP_CLIENT_SECRET",
  "CTP_AUTH_URL",
  "CTP_API_URL",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(
    `\nError: missing required env variables: ${missing.join(", ")}\n`,
  );
  process.exit(1);
}

const PROJECT_KEY = process.env.CTP_PROJECT_KEY;
const CLIENT_ID = process.env.CTP_CLIENT_ID;
const CLIENT_SECRET = process.env.CTP_CLIENT_SECRET;
const AUTH_URL = process.env.CTP_AUTH_URL.replace(/\/$/, "");
const API_URL = process.env.CTP_API_URL.replace(/\/$/, "");

const KEY = "data-sources";

// ---------------------------------------------------------------------------
// Build seed payload from base catalog
// ---------------------------------------------------------------------------
const seedFile = path.resolve(__dirname, "../data/data-sources-seed.json");
if (!fs.existsSync(seedFile)) {
  console.error(`\nError: seed file not found: ${seedFile}\n`);
  process.exit(1);
}
const baseCatalog = JSON.parse(fs.readFileSync(seedFile, "utf8"));
const seedTimestamp = new Date().toISOString();

const payload = {
  schemaVersion: 2,
  draft: {
    schemaVersion: 2,
    currentVersion: 1,
    versions: [
      {
        appVersion: 1,
        savedAt: seedTimestamp,
        publishedAt: seedTimestamp,
        groups: baseCatalog.groups,
        sources: baseCatalog.sources,
      },
    ],
  },
  published: {
    schemaVersion: 1,
    appVersion: 1,
    publishedAt: seedTimestamp,
    groups: baseCatalog.groups,
    sources: baseCatalog.sources,
  },
};

// ---------------------------------------------------------------------------
// HTTP helper (no external deps)
// ---------------------------------------------------------------------------
function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        ...options,
        hostname: parsed.hostname,
        path: parsed.pathname + (parsed.search || ""),
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(JSON.parse(data));
          }
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\nPages Editor — Data Sources Seed`);
  console.log(`  Project : ${PROJECT_KEY}`);
  console.log(`  Key     : ${KEY}`);
  console.log(`  Dry run : ${dryRun}\n`);

  // 1. Fetch OAuth token (skipped in dry-run)
  let token = null;
  if (!dryRun) {
    console.log("Fetching OAuth token…");
    const env = requireEnv();
    token = await fetchToken(env);
    console.log("  Token obtained.\n");
  }

  // 2. Upsert the combined object
  const ctPayload = {
    container: "page-editor",
    key: KEY,
    value: payload,
  };

  if (dryRun) {
    console.log(`[dry-run] Would POST custom object:`);
    console.log(JSON.stringify(ctPayload, null, 2));
  } else {
    console.log(`Upserting custom object "${KEY}"…`);
    const result = await request(
      `${API_URL}/${PROJECT_KEY}/custom-objects`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
      JSON.stringify(ctPayload),
    );
    console.log(
      `  Done. CT version: ${result.version}, last modified: ${result.lastModifiedAt}\n`,
    );
  }

  console.log("Seed complete.\n");
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message ?? err);
  process.exit(1);
});
