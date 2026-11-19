/**
 * Media storage configuration, read from the same environment as the rest of the service.
 *
 * Optional as a whole: with neither `PB_MEDIA_BUCKET` nor a key set, media is off and its routes answer
 * 501. Setting only one of the two is always a mistake and is reported. Problems name configuration
 * keys, never values — the key is a credential.
 */

import { DEFAULT_ALLOWED_MIME_TYPES, SUPPORTED_MIME_TYPES } from './mime.js';

export interface GcsServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

export interface MediaConfig {
  bucket: string;
  serviceAccount: GcsServiceAccount;
  /** Object key prefix, no leading or trailing slash. */
  pathPrefix: string;
  maxUploadBytes: number;
  allowedMimeTypes: ReadonlySet<string>;
}

export const DEFAULT_PATH_PREFIX = 'page-builder/media';
export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** The whole file is held in memory while it is checked and stored, so there is a hard ceiling. */
export const MAX_UPLOAD_CEILING = 25 * 1024 * 1024;

type Env = Record<string, string | undefined>;

const clean = (env: Env, key: string): string | undefined => env[key]?.trim() || undefined;

function parseServiceAccount(raw: string): GcsServiceAccount | null {
  try {
    const json: unknown = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    if (typeof json !== 'object' || json === null) return null;
    const o = json as Record<string, unknown>;
    if (typeof o.client_email !== 'string' || typeof o.private_key !== 'string') return null;
    return {
      client_email: o.client_email,
      private_key: o.private_key,
      ...(typeof o.project_id === 'string' && { project_id: o.project_id }),
    };
  } catch {
    return null;
  }
}

function parsePrefix(env: Env, problems: string[]): string {
  const prefix = (clean(env, 'PB_MEDIA_PATH_PREFIX') ?? DEFAULT_PATH_PREFIX).replace(/^\/+|\/+$/g, '');
  if (!/^[A-Za-z0-9/_-]{1,200}$/.test(prefix) || prefix.includes('//')) {
    problems.push('PB_MEDIA_PATH_PREFIX must match [A-Za-z0-9/_-], 1 to 200 characters, without empty segments');
  }
  return prefix;
}

function parseMaxBytes(env: Env, problems: string[]): number {
  const raw = clean(env, 'PB_MEDIA_MAX_BYTES') ?? String(DEFAULT_MAX_UPLOAD_BYTES);
  const max = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(max) || max < 1024 || max > MAX_UPLOAD_CEILING) {
    problems.push(`PB_MEDIA_MAX_BYTES must be an integer between 1024 and ${MAX_UPLOAD_CEILING}`);
  }
  return max;
}

function parseAllowedTypes(env: Env, problems: string[]): ReadonlySet<string> {
  const raw = clean(env, 'PB_MEDIA_ALLOWED_TYPES');
  const list = raw === undefined ? [...DEFAULT_ALLOWED_MIME_TYPES] : raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  const unsupported = list.filter((t) => !SUPPORTED_MIME_TYPES.includes(t));
  if (list.length === 0 || unsupported.length > 0) {
    problems.push(`PB_MEDIA_ALLOWED_TYPES must list at least one of: ${SUPPORTED_MIME_TYPES.join(', ')}`);
  }
  return new Set(list);
}

/** `null` when media is not configured; problems are appended, never thrown, so one error lists them all. */
export function loadMediaConfig(env: Env, problems: string[]): MediaConfig | null {
  const bucket = clean(env, 'PB_MEDIA_BUCKET');
  const key = clean(env, 'PB_MEDIA_SERVICE_ACCOUNT_KEY_B64');
  if (!bucket && !key) return null;

  const pathPrefix = parsePrefix(env, problems);
  const maxUploadBytes = parseMaxBytes(env, problems);
  const allowedMimeTypes = parseAllowedTypes(env, problems);

  if (!bucket || !key) {
    problems.push('PB_MEDIA_BUCKET and PB_MEDIA_SERVICE_ACCOUNT_KEY_B64 must be set together');
    return null;
  }
  const serviceAccount = parseServiceAccount(key);
  if (!serviceAccount) {
    problems.push('PB_MEDIA_SERVICE_ACCOUNT_KEY_B64 is not base64 of a service-account JSON key');
    return null;
  }
  return { bucket, serviceAccount, pathPrefix, maxUploadBytes, allowedMimeTypes };
}
