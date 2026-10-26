/**
 * Catalog ingest: the versioned `{ draft, published }` envelope the MC app also reads.
 *
 * Non-destructive (draft history is kept, capped at `MAX_VERSIONS`), idempotent (a content hash
 * lets a repeated push no-op), and draft/publish split (push never touches `published`).
 */

import { createHash } from 'node:crypto';
import { isCtStatus } from '../ct/client.js';
import type { CtStore } from '../ct/store.js';
import { headOf } from './catalog-store.js';
import {
  CATALOG_CONTAINER,
  CATALOG_KEYS,
  CATALOG_SCHEMA_VERSION,
  MAX_VERSIONS,
  type Catalog,
  type CatalogKey,
  type CombinedCatalog,
  type Published,
  type Version,
} from './types.js';

const CATALOG_PARTS: CatalogKey[] = ['components', 'data-sources', 'sections', 'theme'];
const META = ['appVersion', 'savedAt', 'publishedAt', 'sourceHash'] as const;
const PUBLISHED_META = ['schemaVersion', 'appVersion', 'publishedAt'] as const;
const WRITE_ATTEMPTS = 3;

/** Deterministic JSON: object keys sorted recursively, so the hash is stable. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
}

export const sourceHashOf = (payload: unknown): string => createHash('sha256').update(canonical(payload)).digest('hex');

/** The stored payload of each custom object for a catalog document. */
export function partsOf(catalog: Catalog): Record<CatalogKey, unknown> {
  return {
    components: catalog.components,
    'data-sources': catalog['data-sources'],
    sections: catalog.sections,
    theme: { theme: catalog.theme ?? {} },
  };
}

const draftVersions = <T>(c: CombinedCatalog<T>): Version<T>[] => c.draft.versions;

export function appendDraft<T extends object>(
  existing: CombinedCatalog<T> | null,
  payload: T,
  now: string
): { combined: CombinedCatalog<T>; changed: boolean; appVersion: number } {
  const hash = sourceHashOf(payload);
  const versions = existing ? draftVersions(existing) : [];
  const head = versions[versions.length - 1];
  if (existing && head && head.sourceHash === hash) return { combined: existing, changed: false, appVersion: head.appVersion };

  const appVersion = (head?.appVersion ?? 0) + 1;
  const next: Version<T> = { appVersion, savedAt: now, publishedAt: null, sourceHash: hash, ...payload };
  const kept = [...versions, next].slice(-MAX_VERSIONS);
  return {
    combined: {
      schemaVersion: CATALOG_SCHEMA_VERSION,
      draft: { schemaVersion: CATALOG_SCHEMA_VERSION, currentVersion: kept.length, versions: kept },
      published: existing?.published ?? null,
    },
    changed: true,
    appVersion,
  };
}

export function promoteDraft<T extends object>(combined: CombinedCatalog<T>, now: string): CombinedCatalog<T> {
  const versions = draftVersions(combined);
  const head = versions[versions.length - 1];
  if (!head) throw new Error('nothing to publish: draft has no versions');
  const payload = { ...(head as Record<string, unknown>) };
  for (const k of META) delete payload[k];
  const published = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    appVersion: head.appVersion,
    publishedAt: now,
    ...payload,
  } as unknown as Published<T>;
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    draft: { ...combined.draft, versions: versions.map((v, i) => (i === versions.length - 1 ? { ...v, publishedAt: now } : v)) },
    published,
  };
}

export interface PushResult {
  status: 'written' | 'unchanged';
  appVersion: number;
  sourceHash: string;
}

export interface PublishResult {
  appVersion: number;
  publishedAt: string;
}

export interface CatalogDocument {
  state: 'draft' | 'published';
  appVersion: number;
  savedAt?: string;
  publishedAt: string | null;
  sourceHash?: string;
  catalog: Catalog;
}

export interface CatalogWriter {
  push(catalog: Catalog, now?: string): Promise<PushResult>;
  publish(now?: string): Promise<PublishResult | null>;
  read(state: 'draft' | 'published'): Promise<CatalogDocument | null>;
}

export function createCatalogWriter(store: CtStore): CatalogWriter {
  const load = (key: string) => store.get<CombinedCatalog<object>>(CATALOG_CONTAINER, key, { bypass: true });

  /** Read-modify-write one object with optimistic concurrency, retrying on a version conflict. */
  async function mutate(
    key: string,
    change: (existing: CombinedCatalog<object> | null) => CombinedCatalog<object> | null
  ): Promise<boolean> {
    for (let attempt = 1; ; attempt++) {
      const current = await load(key);
      const next = change(current?.value ?? null);
      if (!next) return false;
      try {
        await store.put(CATALOG_CONTAINER, key, next, current?.version);
        return true;
      } catch (err) {
        const conflict = isCtStatus(err, 409);
        if (!conflict || attempt >= WRITE_ATTEMPTS) throw err;
      }
    }
  }

  return {
    async push(catalog, now = new Date().toISOString()) {
      const parts = partsOf(catalog);
      const whole = sourceHashOf(parts);
      let anyChanged = false;
      let appVersion = 0;
      // Each key is its own custom object; they are independent, so write them together.
      await Promise.all(
        CATALOG_PARTS.map(async (part) => {
          let changed = false;
          let version = 0;
          await mutate(CATALOG_KEYS[part], (existing) => {
            const result = appendDraft(existing, parts[part] as object, now);
            changed = result.changed;
            version = result.appVersion;
            return result.changed ? result.combined : null;
          });
          anyChanged ||= changed;
          appVersion = Math.max(appVersion, version);
        })
      );
      return { status: anyChanged ? 'written' : 'unchanged', appVersion, sourceHash: whole };
    },

    async publish(now = new Date().toISOString()) {
      const objects = await Promise.all(CATALOG_PARTS.map((p) => load(CATALOG_KEYS[p])));
      if (!objects[0]) return null; // never pushed
      let appVersion = 0;
      await Promise.all(
        CATALOG_PARTS.map(async (part) => {
          await mutate(CATALOG_KEYS[part], (existing) => {
            if (!existing || draftVersions(existing).length === 0) return null;
            const next = promoteDraft(existing, now);
            appVersion = Math.max(appVersion, next.published?.appVersion ?? 0);
            return next;
          });
        })
      );
      return { appVersion, publishedAt: now };
    },

    async read(state) {
      const objects = await Promise.all(CATALOG_PARTS.map((p) => load(CATALOG_KEYS[p])));
      const preview = state === 'draft';
      const [components, sources, sections, theme] = objects.map((o) => headOf<Record<string, unknown>>(o?.value, preview));
      if (!components || !sources || !sections) return null;
      const strip = (v: Record<string, unknown>): Record<string, unknown> => {
        const out = { ...v };
        for (const k of [...META, ...PUBLISHED_META]) delete out[k];
        return out;
      };
      const themeValue = theme ? (strip(theme).theme as Catalog['theme']) : undefined;
      const catalog = {
        components: strip(components),
        'data-sources': strip(sources),
        sections: strip(sections),
        ...(themeValue && Object.keys(themeValue).length ? { theme: themeValue } : {}),
      } as unknown as Catalog;
      const head = components as { appVersion?: number; savedAt?: string; publishedAt?: string | null; sourceHash?: string };
      return {
        state,
        appVersion: head.appVersion ?? 0,
        ...(head.savedAt ? { savedAt: head.savedAt } : {}),
        publishedAt: head.publishedAt ?? null,
        ...(preview && head.sourceHash ? { sourceHash: head.sourceHash } : {}),
        catalog,
      };
    },
  };
}
