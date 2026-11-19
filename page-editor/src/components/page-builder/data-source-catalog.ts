import type { DataSourceType, SchemaField, LocalizedString } from './types';

/**
 * Data-source *type* definitions are owned by the host code and synced into CT by
 * the page-builder service's catalog ingest; the builder reads them from the published
 * `data-sources` catalog. This module now holds only the pure helpers the settings pane
 * and data-source config dialog use against that catalog.
 */

export type { DataSourceType };

export function findDSEntry(
  type: string,
  catalog: DataSourceType[] = []
): DataSourceType | undefined {
  return catalog.find((d) => d.type === type);
}

export function defaultConfigFor(
  schema: SchemaField[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of schema) {
    if (f.kind === 'boolean') out[f.key] = false;
    else if (f.kind === 'number') out[f.key] = '';
    else if (f.kind === 'productPins') out[f.key] = [];
    else if (f.kind === 'productPicks') out[f.key] = [];
    else if (f.kind === 'categoryPicks') out[f.key] = [];
    else if (f.kind === 'categoryPins') out[f.key] = [];
    else if (f.kind === 'product') out[f.key] = null;
    else if (f.kind === 'category') out[f.key] = null;
    else if (f.localized) out[f.key] = {};
    else out[f.key] = '';
  }
  return out;
}

export function summarizeConfig(
  config: Record<string, unknown> | undefined,
  displayString: (v: string | LocalizedString | undefined) => string
): string {
  if (!config) return '—';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(config)) {
    if (v == null || v === '' || v === false) continue;
    if (Array.isArray(v)) {
      if (!v.length) continue;
      const first = v[0] as Record<string, unknown>;
      const label =
        'position' in first
          ? `${v.length} pinned`
          : 'sku' in first
          ? `${v.length} products`
          : `${v.length} categories`;
      parts.push(`${k}: ${label}`);
    } else if (typeof v === 'object') {
      const lv = displayString(v as LocalizedString);
      if (lv) parts.push(`${k}: ${lv}`);
    } else {
      parts.push(`${k}: ${v}`);
    }
  }
  return parts.length ? parts.join(' · ') : 'Default config';
}
