/** Resolver kinds: a data-source `config` (already localized) → canonical shapes. */

import type { ResolverKind } from '../domain/types.js';
import { cardOf } from '../commerce/mappers.js';
import type { CategoryNode, ProductCard, ProductDetail } from '../commerce/shapes.js';
import type { RenderEnv } from './env.js';
import { applyPins, readPins, type Pin } from './pins.js';
import { facetFilters, num, routeCategory, routeListing, routeProduct, sortFrom } from './route-data.js';

type Config = Record<string, unknown>;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

export interface Ref {
  id?: string;
  key?: string;
  sku?: string;
}

/** A stored reference: `{ id, key?, sku? }`, or a bare id string; empty values are no reference. */
export function readRef(value: unknown): Ref | null {
  if (typeof value === 'string') return value ? { id: value } : null;
  if (!isRecord(value)) return null;
  const ref = { id: str(value.id), key: str(value.key), sku: str(value.sku) };
  return ref.id || ref.key || ref.sku ? ref : null;
}

export function readRefs(value: unknown): Ref[] {
  return Array.isArray(value) ? value.map(readRef).filter((r): r is Ref => !!r) : [];
}

export async function productFromRef(ref: Ref | null, env: RenderEnv): Promise<ProductDetail | null> {
  if (!ref) return null;
  const { products } = env.commerce;
  if (ref.id) return products.detailById(ref.id, env.ctx);
  if (ref.sku) return products.detailBySku(ref.sku, env.ctx);
  return ref.key ? products.detailByKey(ref.key, env.ctx) : null;
}

/** Product cards for refs, in order. Refs without an id are looked up one by one (rare path). */
export async function cardsFromRefs(refs: Ref[], env: RenderEnv): Promise<ProductCard[]> {
  const ids = refs.flatMap((r) => (r.id ? [r.id] : []));
  const byId = new Map((await env.commerce.products.byIds(ids, env.ctx)).map((c) => [c.id, c]));
  const out: ProductCard[] = [];
  for (const ref of refs) {
    if (ref.id) {
      const card = byId.get(ref.id);
      if (card) out.push(card);
      continue;
    }
    const detail = await productFromRef(ref, env);
    if (detail) out.push(cardOf(detail));
  }
  return out;
}

export async function categoryFromRef(ref: Ref | null, env: RenderEnv): Promise<CategoryNode | null> {
  const idOrKey = ref?.id ?? ref?.key;
  return idOrKey ? env.commerce.categories.get(idOrKey, env.ctx) : null;
}

export async function categoriesFromRefs(refs: Ref[], env: RenderEnv): Promise<CategoryNode[]> {
  const nodes = await Promise.all(refs.map((r) => categoryFromRef(r, env)));
  return nodes.filter((n): n is CategoryNode => !!n);
}

const pinRefs = (pins: Pin[]): Ref[] => pins.map((p) => ({ id: p.id }));

async function productList(config: Config, env: RenderEnv): Promise<ProductCard[]> {
  const limit = Math.max(1, Math.min(num(config.limit, 8), 100));
  const pins = readPins(config.productPins ?? config.pinnedProducts);
  const categoryRef = readRef(config.categoryId);
  const legacyCategories = readRefs(config.categories).map((r) => r.id).filter((id): id is string => !!id);

  const result = await env.commerce.products.search(
    {
      ...(categoryRef?.id ? { categoryId: categoryRef.id, subTree: config.categorySubTree !== false } : {}),
      ...(!categoryRef?.id && legacyCategories.length ? { anyCategoryIds: legacyCategories } : {}),
      ...(str(config.query) ? { text: str(config.query) } : {}),
      sort: sortFrom(config.sort),
      limit,
      offset: Math.max(0, num(config.offset, 0)),
    },
    env.ctx
  );
  const pinned = await cardsFromRefs(pinRefs(pins), env);
  return applyPins(result.products, pins, pinned, limit);
}

async function relatedProducts(config: Config, env: RenderEnv): Promise<ProductCard[]> {
  const product = await routeProduct(env);
  if (!product) return [];
  const limit = Math.max(1, Math.min(num(config.limit, 8), 100));
  const result = await env.commerce.products.search(
    { anyCategoryIds: product.categoryIds, excludeProductId: product.id, limit, offset: 0 },
    env.ctx
  );
  return result.products;
}

async function categoryList(config: Config, env: RenderEnv): Promise<CategoryNode[]> {
  const limit = Math.max(1, num(config.limit, 8));
  const pins = readPins(config.categoryPins);
  const listed = await env.commerce.categories.list(str(config.where), env.ctx);
  const pinned = await categoriesFromRefs(pinRefs(pins), env);
  return applyPins(listed, pins, pinned, limit);
}

export type KindResolver = (config: Config, env: RenderEnv) => Promise<unknown>;

export const KIND_RESOLVERS: Record<ResolverKind, KindResolver> = {
  product: async (config, env) =>
    (await productFromRef(readRef(config.product), env)) ?? (await routeProduct(env)),

  'product-list': productList,

  'products-by-category': async (config, env) => {
    const category = readRef(config.category);
    if (category?.id) {
      return env.commerce.products.search(
        {
          categoryId: category.id,
          subTree: true,
          limit: num(config.limit, 24),
          offset: Math.max(0, num(env.query.get('offset'), num(config.offset, 0))),
          sort: sortFrom(env.query.get('sort')) ?? sortFrom(config.sort),
          facetFilters: facetFilters(env.query),
        },
        env.ctx
      );
    }
    return (await routeListing(env, config))?.result ?? null;
  },

  'product-picks': (config, env) => cardsFromRefs(readRefs(config.productPicks), env),
  'product-pins': (config, env) => cardsFromRefs(pinRefs(readPins(config.productPins)), env),

  category: async (config, env) =>
    (await categoryFromRef(readRef(config.category), env)) ?? (await routeCategory(env)),

  'category-list': categoryList,
  'category-picks': (config, env) => categoriesFromRefs(readRefs(config.categoryPicks), env),
  'category-pins': (config, env) => categoriesFromRefs(pinRefs(readPins(config.categoryPins)), env),
  'category-tree': (config, env) => env.commerce.categories.tree(env.ctx, num(config.depth, Infinity)),
  'related-products': relatedProducts,
};
