#!/usr/bin/env node
/**
 * Seeds page-builder custom objects (schema v3) in a CT project.
 *
 * Pages are split by lifecycle across three containers:
 *   - page-editor-components : one object per component instance (key `component-<uuid>`)
 *   - page-editor-draft      : the draft page (layout children are references), key `page-<id>`
 *   - page-editor-published  : the frozen inline published snapshot, key `page-<id>`
 * Data-source instances stay in the shared `page-editor` container (key `data-source-instances`).
 *
 * Usage:
 *   node scripts/seed-pages.js [--env <path>] [--page-id <id>] [--dry-run]
 *
 * Defaults:
 *   --env      .env.seed
 *   --page-id  (all pages in data/pages/)
 *
 * Required .env variables:
 *   CTP_PROJECT_KEY, CTP_CLIENT_ID, CTP_CLIENT_SECRET, CTP_AUTH_URL, CTP_API_URL
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
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
const singlePageId = flag("--page-id") ?? null;
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
const AUTH_URL = process.env.CTP_AUTH_URL.replace(/\/$/, "");
const API_URL = process.env.CTP_API_URL.replace(/\/$/, "");

const DRAFT_CONTAINER = "page-editor-draft";
const PUBLISHED_CONTAINER = "page-editor-published";
const COMPONENTS_CONTAINER = "page-editor-components";
const LEGACY_CONTAINER = "page-editor"; // data-source-instances still lives here

const instancesKey = "data-source-instances";
const pagesDir = path.resolve(__dirname, "../data/pages");

// ---------------------------------------------------------------------------
// Resolve page IDs to seed
// ---------------------------------------------------------------------------
const allPageIds = fs
  .readdirSync(pagesDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

const pageIds = singlePageId ? [singlePageId] : allPageIds;

// ---------------------------------------------------------------------------
// Load the authored (embedded) page for a given pageId
// ---------------------------------------------------------------------------
function loadBasePage(pageId) {
  const perPageFile = path.resolve(pagesDir, `${pageId}.json`);
  const legacyFile = path.resolve(__dirname, "../data/page-builder-seed.json");
  const seedFile = fs.existsSync(perPageFile) ? perPageFile : legacyFile;
  if (!fs.existsSync(seedFile)) {
    throw new Error(`Seed file not found: ${perPageFile} or ${legacyFile}`);
  }
  const seedData = JSON.parse(fs.readFileSync(seedFile, "utf8"));
  return seedData.page ?? seedData;
}

// ---------------------------------------------------------------------------
// v3 payload builders
// ---------------------------------------------------------------------------
const ALL_VISIBLE = { mobile: true, tablet: true, desktop: true };

function componentValue(pageId, componentId, child, ts) {
  const version = {
    appVersion: 1,
    savedAt: ts,
    publishedAt: ts,
    name: child.name ?? {},
    visibility: child.visibility ?? { ...ALL_VISIBLE },
    settings: child.settings ?? {},
  };
  if (child.style !== undefined) version.style = child.style;
  return {
    schemaVersion: 3,
    type: child.type,
    pageId,
    draft: {
      schemaVersion: 3,
      currentVersion: 1,
      componentId,
      versions: [version],
    },
  };
}

function draftValue(pageId, refPage, ts) {
  return {
    schemaVersion: 3,
    publishedAt: ts,
    draft: {
      schemaVersion: 3,
      currentVersion: 1,
      pageId,
      versions: [{ appVersion: 1, savedAt: ts, publishedAt: ts, page: refPage }],
    },
  };
}

function publishedValue(pageId, basePage, ts) {
  return {
    schemaVersion: 3,
    appVersion: 1,
    publishedAt: ts,
    pageId,
    page: basePage,
  };
}

// ---------------------------------------------------------------------------
// Build instances payload
// ---------------------------------------------------------------------------
function buildInstancesPayload() {
  const instancesFile = path.resolve(
    __dirname,
    "../data/data-source-instances.json",
  );
  const baseInstances = fs.existsSync(instancesFile)
    ? (JSON.parse(fs.readFileSync(instancesFile, "utf8")).instances ?? [])
    : [];
  return {
    schemaVersion: 2,
    draft: { schemaVersion: 1, instances: baseInstances },
    published: { schemaVersion: 1, instances: baseInstances },
  };
}

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

function post(container, key, value, token) {
  return request(
    `${API_URL}/${PROJECT_KEY}/custom-objects`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
    JSON.stringify({ container, key, value }),
  );
}

// ---------------------------------------------------------------------------
// Seed one page (split components -> draft refs + inline published)
// ---------------------------------------------------------------------------
async function seedPage(pageId, token, ts) {
  const basePage = loadBasePage(pageId);

  if (dryRun) {
    let count = 0;
    for (const layouts of Object.values(basePage)) {
      for (const layout of layouts ?? []) count += (layout.children ?? []).length;
    }
    console.log(
      `[dry-run] page-${pageId}: would write ${count} component object(s) + draft + published`,
    );
    return;
  }

  const refPage = {};
  let compCount = 0;
  for (const [sectionId, layouts] of Object.entries(basePage)) {
    refPage[sectionId] = [];
    for (const layout of layouts ?? []) {
      const children = [];
      for (const child of layout.children ?? []) {
        const componentId = crypto.randomUUID();
        const res = await post(
          COMPONENTS_CONTAINER,
          `component-${componentId}`,
          componentValue(pageId, componentId, child, ts),
          token,
        );
        children.push({ typeId: "key-value-document", id: res.id });
        compCount++;
      }
      refPage[sectionId].push({ ...layout, children });
    }
  }

  await post(DRAFT_CONTAINER, `page-${pageId}`, draftValue(pageId, refPage, ts), token);
  await post(
    PUBLISHED_CONTAINER,
    `page-${pageId}`,
    publishedValue(pageId, basePage, ts),
    token,
  );
  console.log(
    `  Seeded page-${pageId}: ${compCount} component(s) + draft + published.`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\nPages Editor — Page Seed (schema v3)`);
  console.log(`  Project  : ${PROJECT_KEY}`);
  console.log(`  Pages    : ${pageIds.join(", ")}`);
  console.log(`  Dry run  : ${dryRun}\n`);

  let token = null;
  if (!dryRun) {
    console.log("Fetching OAuth token…");
    const env = requireEnv();
    token = await fetchToken(env);
    console.log("  Token obtained.\n");
  }

  const seedTimestamp = new Date().toISOString();

  for (const pageId of pageIds) {
    console.log(`Seeding "page-${pageId}"…`);
    await seedPage(pageId, token, seedTimestamp);
  }

  // Seed data-source instances once (unchanged container).
  const instancesPayload = buildInstancesPayload();
  if (dryRun) {
    console.log(`[dry-run] Would POST custom object: ${instancesKey}`);
  } else {
    console.log(`\nUpserting custom object "${instancesKey}"…`);
    const result = await post(
      LEGACY_CONTAINER,
      instancesKey,
      instancesPayload,
      token,
    );
    console.log(`  Done. CT version: ${result.version}\n`);
  }

  console.log("Seed complete.\n");
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message ?? err);
  process.exit(1);
});
