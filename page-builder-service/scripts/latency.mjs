#!/usr/bin/env node
/**
 * Measure render latency against a deployed service (task 3.7).
 *
 *   PB_SERVICE_URL=https://…/service PB_RENDER_KEY=… PB_ORIGIN=https://shop.example.com \
 *     node scripts/latency.mjs --path /en-us --requests 100 --concurrency 5
 *
 * The first request is reported on its own (it pays any cold start and the first commercetools
 * token and reads); the rest are warm and summarised as p50/p95/p99/max. Run it against a
 * production-type deployment: sandbox deployments scale to zero and cold-start in ~15s.
 * Add --preview <token> to measure the uncached draft path.
 */

import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    path: { type: 'string', default: '/' },
    locale: { type: 'string', default: 'en-US' },
    currency: { type: 'string', default: 'USD' },
    country: { type: 'string', default: 'US' },
    store: { type: 'string' },
    requests: { type: 'string', default: '50' },
    concurrency: { type: 'string', default: '5' },
    preview: { type: 'string' },
  },
});

const base = process.env.PB_SERVICE_URL?.replace(/\/+$/, '');
if (!base) {
  console.error('latency: PB_SERVICE_URL is not set');
  process.exit(1);
}

const params = new URLSearchParams({
  path: values.path,
  locale: values.locale,
  currency: values.currency,
  country: values.country,
  ...(values.store ? { store: values.store } : {}),
  ...(values.preview ? { search: `pb_preview=${values.preview}` } : {}),
});
const url = `${base}/v1/render?${params}`;
const headers = {
  'x-pb-wire-version': '1',
  ...(process.env.PB_RENDER_KEY ? { 'x-pb-render-key': process.env.PB_RENDER_KEY } : {}),
  ...(process.env.PB_ORIGIN ? { 'x-pb-origin': process.env.PB_ORIGIN } : {}),
};

async function once() {
  const start = performance.now();
  const res = await fetch(url, { headers });
  await res.arrayBuffer();
  return { ms: performance.now() - start, status: res.status };
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
const fmt = (ms) => `${ms.toFixed(0)}ms`;

const first = await once();
console.log(`first request (cold): ${fmt(first.ms)}  status ${first.status}`);
if (first.status !== 200) console.warn('warning: the first response was not 200; the numbers below measure an error path');

const total = Number(values.requests);
const workers = Math.max(1, Number(values.concurrency));
const results = [];
let next = 0;
await Promise.all(
  Array.from({ length: workers }, async () => {
    while (next++ < total) results.push(await once());
  })
);

const times = results.map((r) => r.ms).sort((a, b) => a - b);
const statuses = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
console.log(`warm (${results.length} requests, concurrency ${workers}):`);
console.log(`  p50 ${fmt(percentile(times, 50))}  p95 ${fmt(percentile(times, 95))}  p99 ${fmt(percentile(times, 99))}  max ${fmt(times.at(-1))}`);
console.log(`  statuses ${JSON.stringify(statuses)}`);
console.log('Compare p95 with the shim timeout (PB_TIMEOUT_MS, default 2000ms).');
