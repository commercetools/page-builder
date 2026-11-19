/**
 * Schema-driven resolution of picker fields in component settings: `product`, `productPicks`,
 * `productPins`, `category`, `categoryPicks` and `categoryPins` hold stored references; the
 * service replaces them with canonical shapes. Group fields hold repeated sub-objects, so their
 * children are resolved per entry.
 */

import type { SchemaField } from '../domain/types.js';
import type { RenderEnv } from './env.js';
import {
  cardsFromRefs,
  categoriesFromRefs,
  categoryFromRef,
  productFromRef,
  readRef,
  readRefs,
} from './kinds.js';
import { readPins } from './pins.js';

async function resolveField(field: SchemaField, value: unknown, env: RenderEnv): Promise<unknown> {
  switch (field.kind) {
    case 'product':
      return productFromRef(readRef(value), env);
    case 'productPicks':
      return cardsFromRefs(readRefs(value), env);
    case 'productPins':
      return cardsFromRefs(readPins(value).map((p) => ({ id: p.id })), env);
    case 'category':
      return categoryFromRef(readRef(value), env);
    case 'categoryPicks':
      return categoriesFromRefs(readRefs(value), env);
    case 'categoryPins':
      return categoriesFromRefs(readPins(value).map((p) => ({ id: p.id })), env);
    case 'dataSource':
      // Saved data-source ids were already swapped for their data; a string that is left names
      // an instance that does not exist (deleted, or absent from the draft). Hand the host null,
      // never a raw id it would try to render as data.
      return typeof value === 'string' ? null : value;
    case 'group':
      return Array.isArray(value)
        ? Promise.all(
            value.map((entry) =>
              entry && typeof entry === 'object'
                ? resolveFields(entry as Record<string, unknown>, field.children ?? [], env)
                : entry
            )
          )
        : value;
    default:
      return value;
  }
}

const RESOLVED_KINDS = new Set(['dataSource', 'product', 'productPicks', 'productPins', 'category', 'categoryPicks', 'categoryPins', 'group']);

/** Resolve every picker/group field present in `settings`; other keys pass through untouched. */
export async function resolveFields(
  settings: Record<string, unknown>,
  schema: SchemaField[],
  env: RenderEnv
): Promise<Record<string, unknown>> {
  const out = { ...settings };
  await Promise.all(
    schema
      .filter((f) => RESOLVED_KINDS.has(f.kind) && f.key in settings)
      .map(async (f) => {
        try {
          out[f.key] = await resolveField(f, settings[f.key], env);
        } catch (err) {
          env.log.warn({ field: f.key, err }, 'field resolution failed; omitting its data');
          out[f.key] = null;
        }
      })
  );
  return out;
}
