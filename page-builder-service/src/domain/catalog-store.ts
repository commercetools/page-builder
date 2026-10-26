/**
 * Read access to the host catalog, saved data-source instances and preview settings.
 *
 * Catalogs and instances are versioned `{ draft, published }` objects: a preview render reads the
 * draft head (fresh, bypassing the cache) and falls back to published; everything else reads
 * published only. The theme is a service-owned catalog object written by catalog ingest.
 */

import type { CtStore } from '../ct/store.js';
import {
  CATALOG_CONTAINER,
  CATALOG_KEYS,
  DATA_SOURCE_INSTANCES_KEY,
  SETTINGS_KEY,
  type CatalogKey,
  type ComponentType,
  type DataSourceType,
  type PreviewSettings,
  type PreviewSettingsPayload,
  type SavedDataSource,
  type Section,
  type Theme,
} from './types.js';

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/** The draft head (preview) or published payload of a versioned catalog object. */
export function headOf<T>(value: unknown, preview: boolean): T | null {
  if (!isRecord(value)) return null;
  if (preview) {
    const draft = value.draft;
    const versions = isRecord(draft) ? draft.versions : undefined;
    if (Array.isArray(versions) && versions.length > 0) return versions[versions.length - 1] as T;
  }
  return isRecord(value.published) ? (value.published as T) : null;
}

export interface LoadedCatalog {
  components: Map<string, ComponentType>;
  dataSources: Map<string, DataSourceType>;
  sections: Section[];
  theme: Theme | undefined;
}

export interface CatalogReader {
  catalog(preview: boolean): Promise<LoadedCatalog>;
  instances(preview: boolean): Promise<Map<string, SavedDataSource>>;
  settings(preview: boolean): Promise<PreviewSettings>;
}

export function createCatalogReader(store: CtStore): CatalogReader {
  const read = async (key: string, bypass: boolean): Promise<unknown> =>
    (await store.get(CATALOG_CONTAINER, key, { bypass }))?.value ?? null;

  return {
    async catalog(preview) {
      const [components, dataSources, sections, theme] = await Promise.all(
        (['components', 'data-sources', 'sections', 'theme'] as CatalogKey[]).map((k) =>
          read(CATALOG_KEYS[k], preview)
        )
      );
      const c = headOf<{ components?: ComponentType[] }>(components, preview);
      const d = headOf<{ sources?: DataSourceType[] }>(dataSources, preview);
      const s = headOf<{ sections?: Section[] }>(sections, preview);
      const t = headOf<{ theme?: Theme }>(theme, preview);
      return {
        components: new Map((c?.components ?? []).map((x) => [x.type, x])),
        dataSources: new Map((d?.sources ?? []).map((x) => [x.type, x])),
        sections: s?.sections ?? [],
        theme: t?.theme,
      };
    },

    async instances(preview) {
      const value = await read(DATA_SOURCE_INSTANCES_KEY, preview);
      const pick = (v: unknown): SavedDataSource[] | null =>
        isRecord(v) && Array.isArray(v.instances) ? (v.instances as SavedDataSource[]) : null;
      // Unlike pages and catalogs, the instances draft is a flat `{ instances }`, not versioned.
      const draft = isRecord(value) ? pick(value.draft) : null;
      const published = isRecord(value) ? pick(value.published) : null;
      const list = (preview ? (draft ?? published) : published) ?? [];
      return new Map(list.map((i) => [i.id, i]));
    },

    async settings(preview) {
      const value = await read(SETTINGS_KEY, preview);
      const preview_ = isRecord(value) ? (value as unknown as PreviewSettingsPayload).preview : undefined;
      return isRecord(preview_) ? preview_ : {};
    },
  };
}
