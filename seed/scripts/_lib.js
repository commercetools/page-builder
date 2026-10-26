'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------
function flag(args, name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}
function hasFlag(args, name) {
  return args.includes(name);
}

// ---------------------------------------------------------------------------
// Load .env file
// ---------------------------------------------------------------------------
function loadEnv(envFile) {
  const envPath = path.resolve(process.cwd(), envFile);
  if (!fs.existsSync(envPath)) {
    console.error(`\nError: env file not found: ${envPath}`);
    console.error(`Copy .env.seed.example to ${envFile} and fill in your values.\n`);
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

// ---------------------------------------------------------------------------
// Validate required env vars
// ---------------------------------------------------------------------------
function requireEnv() {
  const required = ['CTP_PROJECT_KEY', 'CTP_CLIENT_ID', 'CTP_CLIENT_SECRET', 'CTP_AUTH_URL', 'CTP_API_URL', 'CTP_SCOPES'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`\nError: missing required env variables: ${missing.join(', ')}\n`);
    process.exit(1);
  }
  return {
    PROJECT_KEY: process.env.CTP_PROJECT_KEY,
    CLIENT_ID: process.env.CTP_CLIENT_ID,
    CLIENT_SECRET: process.env.CTP_CLIENT_SECRET,
    AUTH_URL: process.env.CTP_AUTH_URL.replace(/\/$/, ''),
    API_URL: process.env.CTP_API_URL.replace(/\/$/, ''),
    SCOPES: process.env.CTP_SCOPES,
  };
}

// ---------------------------------------------------------------------------
// HTTP helper (no external deps)
// ---------------------------------------------------------------------------
function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      { ...options, hostname: parsed.hostname, path: parsed.pathname + (parsed.search || '') },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          else resolve(JSON.parse(data));
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Fetch OAuth token
// ---------------------------------------------------------------------------
async function fetchToken({ AUTH_URL, CLIENT_ID, CLIENT_SECRET, PROJECT_KEY, SCOPES }) {
  console.log('SCOPES:', SCOPES);
  console.log('Fetching OAuth token…');
  const res = await request(
    `${AUTH_URL}/oauth/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
      },
    },
    SCOPES ? `grant_type=client_credentials&scope=${SCOPES}` : `grant_type=client_credentials&scope=manage_key_value_documents:${PROJECT_KEY}`
  );
  console.log('  Token obtained.\n');
  return res.access_token;
}

// ---------------------------------------------------------------------------
// GET a custom object
// ---------------------------------------------------------------------------
async function getCustomObject({ API_URL, PROJECT_KEY }, token, key, container = 'page-editor') {
  return request(
    `${API_URL}/${PROJECT_KEY}/custom-objects/${container}/${key}`,
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
  );
}

// ---------------------------------------------------------------------------
// List all custom objects in a container (auto-paginated)
// ---------------------------------------------------------------------------
async function listCustomObjects({ API_URL, PROJECT_KEY }, token, container = 'page-editor') {
  const limit = 500;
  let offset = 0;
  const results = [];
  while (true) {
    const res = await request(
      `${API_URL}/${PROJECT_KEY}/custom-objects/${container}?limit=${limit}&offset=${offset}`,
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
    );
    results.push(...res.results);
    if (results.length >= res.total) break;
    offset += limit;
  }
  return results;
}

// ---------------------------------------------------------------------------
// Upsert a custom object
// ---------------------------------------------------------------------------
async function putCustomObject({ API_URL, PROJECT_KEY }, token, container, key, value) {
  return request(
    `${API_URL}/${PROJECT_KEY}/custom-objects`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
    JSON.stringify({ container, key, value })
  );
}

module.exports = { flag, hasFlag, loadEnv, requireEnv, request, fetchToken, getCustomObject, listCustomObjects, putCustomObject };
