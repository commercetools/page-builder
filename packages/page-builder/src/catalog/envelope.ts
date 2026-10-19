/**
 * Build and mutate the `CombinedCatalog` envelope stored in CT.
 *
 * Design goals (see docs/sdd/definitions-contract.md §4):
 * - Non-destructive: `appendVersion` preserves prior draft history instead of resetting.
 * - Idempotent: a `sourceHash` over the payload lets a repeated sync no-op.
 * - Draft/publish split: `appendVersion` writes draft only; `copyDraftToPublished` is the
 *   separate go-live step.
 */

import * as crypto from 'node:crypto';
import {
  CATALOG_SCHEMA_VERSION,
  MAX_VERSIONS,
  type CombinedCatalog,
  type Published,
  type Version,
} from '../contract.js';

const VERSION_META_KEYS = [
  'appVersion',
  'savedAt',
  'publishedAt',
  'sourceHash',
] as const;

/** Deterministic JSON: object keys sorted recursively, so the hash is stable. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(',')}}`;
}

/** A stable content hash of a catalog payload — the idempotency key. */
export function sourceHashOf(payload: unknown): string {
  return crypto.createHash('sha256').update(canonical(payload)).digest('hex');
}

/** Strip the version-meta keys, leaving just the payload `T`. */
function stripMeta<T>(version: Version<T>): T {
  const out = { ...(version as Record<string, unknown>) };
  for (const k of VERSION_META_KEYS) delete out[k];
  return out as T;
}

/** The latest draft version (the "head"), or null when there is no history. */
export function draftHead<T>(combined: CombinedCatalog<T>): Version<T> | null {
  const versions = combined.draft.versions;
  return versions.length ? versions[versions.length - 1] : null;
}

/** A fresh combined object with a single draft version (first-time create). */
export function buildCombined<T>(payload: T, now: string): CombinedCatalog<T> {
  const version: Version<T> = {
    appVersion: 1,
    savedAt: now,
    publishedAt: null,
    sourceHash: sourceHashOf(payload),
    ...payload,
  };
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    draft: { schemaVersion: CATALOG_SCHEMA_VERSION, currentVersion: 1, versions: [version] },
    published: null,
  };
}

export type AppendResult<T> = {
  combined: CombinedCatalog<T>;
  /** false when the payload matched the current draft head (no-op). */
  changed: boolean;
};

/**
 * Append a new draft version for `payload`, unless it is byte-identical to the current
 * draft head (then it's a no-op). Bumps `appVersion` monotonically, caps history at
 * MAX_VERSIONS (drops oldest), and points `currentVersion` at the new head. `published`
 * is left untouched — publishing is a separate step.
 */
export function appendVersion<T>(
  existing: CombinedCatalog<T> | null,
  payload: T,
  now: string
): AppendResult<T> {
  if (!existing) {
    return { combined: buildCombined(payload, now), changed: true };
  }
  const head = draftHead(existing);
  const hash = sourceHashOf(payload);
  if (head && head.sourceHash === hash) {
    return { combined: existing, changed: false };
  }
  const nextAppVersion = (head?.appVersion ?? 0) + 1;
  const version: Version<T> = {
    appVersion: nextAppVersion,
    savedAt: now,
    publishedAt: null,
    sourceHash: hash,
    ...payload,
  };
  const versions = [...existing.draft.versions, version].slice(-MAX_VERSIONS);
  return {
    combined: {
      schemaVersion: CATALOG_SCHEMA_VERSION,
      draft: {
        schemaVersion: CATALOG_SCHEMA_VERSION,
        // 1-based index of the head, so download tooling can read versions[currentVersion-1].
        currentVersion: versions.length,
        versions,
      },
      published: existing.published,
    },
    changed: true,
  };
}

/**
 * Copy the latest draft head into `published` and stamp that draft version's
 * `publishedAt`. The go-live step. No-op-safe: if the head is already published with the
 * same content, it still restamps `publishedAt` to `now` (harmless).
 */
export function copyDraftToPublished<T>(
  combined: CombinedCatalog<T>,
  now: string
): CombinedCatalog<T> {
  const head = draftHead(combined);
  if (!head) throw new Error('nothing to publish: draft has no versions');
  const payload = stripMeta(head);
  const published: Published<T> = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    appVersion: head.appVersion,
    publishedAt: now,
    ...payload,
  };
  const versions = combined.draft.versions.map((v, i) =>
    i === combined.draft.versions.length - 1 ? { ...v, publishedAt: now } : v
  );
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    draft: { ...combined.draft, versions },
    published,
  };
}

const PUBLISHED_META_KEYS = ['schemaVersion', 'appVersion', 'publishedAt'] as const;

/**
 * The current effective payload of a combined object: the published payload if present,
 * otherwise the latest draft head. Used by `pull` to migrate CT state back to code.
 */
export function extractPayload<T>(combined: CombinedCatalog<T>): T | null {
  if (combined.published) {
    const out = { ...(combined.published as Record<string, unknown>) };
    for (const k of PUBLISHED_META_KEYS) delete out[k];
    return out as T;
  }
  const head = draftHead(combined);
  return head ? stripMeta(head) : null;
}

export { stripMeta };
