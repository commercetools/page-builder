/**
 * Minimal, zero-dependency commercetools client for custom objects.
 *
 * Uses only Node built-ins (https/http). Ported and extended from seed/scripts/_lib.js —
 * adds `putCustomObject` with optimistic concurrency (sends `version`) so the sync tool is
 * non-destructive (preserves draft history) rather than blindly overwriting.
 */

import * as https from 'node:https';
import * as http from 'node:http';
import type { CtEnv } from './env.js';
import { CATALOG_CONTAINER } from '../contract.js';

export type CtCustomObject<T = unknown> = {
  id: string;
  version: number;
  container: string;
  key: string;
  value: T;
  lastModifiedAt?: string;
};

function request<T = unknown>(
  url: string,
  options: https.RequestOptions,
  body?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        ...options,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: parsed.pathname + (parsed.search || ''),
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status === 404) {
            // Signal "not found" to callers that tolerate it.
            reject(new HttpError(status, data));
            return;
          }
          if (status >= 400) {
            reject(new HttpError(status, data));
            return;
          }
          try {
            resolve(data ? (JSON.parse(data) as T) : (undefined as T));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public body: string
  ) {
    super(`HTTP ${status}: ${body}`);
    this.name = 'HttpError';
  }
}

/** Client-credentials OAuth token for the configured scopes. */
export async function fetchToken(env: CtEnv): Promise<string> {
  const res = await request<{ access_token: string }>(
    `${env.authUrl}/oauth/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${env.clientId}:${env.clientSecret}`).toString('base64'),
      },
    },
    `grant_type=client_credentials&scope=${encodeURIComponent(env.scopes)}`
  );
  return res.access_token;
}

/** GET a custom object by key; returns null on 404. */
export async function getCustomObject<T = unknown>(
  env: CtEnv,
  token: string,
  key: string,
  container: string = CATALOG_CONTAINER
): Promise<CtCustomObject<T> | null> {
  try {
    return await request<CtCustomObject<T>>(
      `${env.apiUrl}/${env.projectKey}/custom-objects/${container}/${key}`,
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null;
    throw err;
  }
}

/**
 * List all custom objects in a container (auto-paginated).
 *
 * The awaits below are sequential by necessity, not by oversight: `offset`
 * advances from the previous response and the loop ends on the accumulated
 * `results.length >= res.total`, so the page count is not known up front.
 */
export async function listCustomObjects<T = unknown>(
  env: CtEnv,
  token: string,
  container: string = CATALOG_CONTAINER
): Promise<CtCustomObject<T>[]> {
  const limit = 500;
  let offset = 0;
  const results: CtCustomObject<T>[] = [];
  for (;;) {
    const res = await request<{ results: CtCustomObject<T>[]; total: number }>(
      `${env.apiUrl}/${env.projectKey}/custom-objects/${container}?limit=${limit}&offset=${offset}`,
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
    );
    results.push(...res.results);
    if (results.length >= res.total) break;
    offset += limit;
  }
  return results;
}

/**
 * Batch-fetch custom objects by their CT-assigned ids (chunked; tolerant of an empty list).
 * Used to hydrate a draft page's component references for preview rendering.
 */
export async function getCustomObjectsByIds<T = unknown>(
  env: CtEnv,
  token: string,
  ids: string[],
  container: string = CATALOG_CONTAINER
): Promise<CtCustomObject<T>[]> {
  if (ids.length === 0) return [];
  const CHUNK = 100;
  const out: CtCustomObject<T>[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const where = encodeURIComponent(
      `id in (${chunk.map((id) => `"${id}"`).join(', ')})`
    );
    const res = await request<{ results: CtCustomObject<T>[] }>(
      `${env.apiUrl}/${env.projectKey}/custom-objects/${container}?where=${where}&limit=${chunk.length}`,
      { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
    );
    out.push(...res.results);
  }
  return out;
}

/**
 * Upsert a custom object. When `version` is provided, CT enforces optimistic
 * concurrency and rejects a stale write (409) rather than clobbering a concurrent update.
 */
export async function putCustomObject<T = unknown>(
  env: CtEnv,
  token: string,
  key: string,
  value: T,
  version: number | undefined,
  container: string = CATALOG_CONTAINER
): Promise<CtCustomObject<T>> {
  const draft: Record<string, unknown> = { container, key, value };
  if (typeof version === 'number') draft.version = version;
  return request<CtCustomObject<T>>(
    `${env.apiUrl}/${env.projectKey}/custom-objects`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
    JSON.stringify(draft)
  );
}
