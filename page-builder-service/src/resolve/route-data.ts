/** Data derived from the matched route (current category / product / listing), memoised per render. */

import { isSortKey, type SortKey } from '../commerce/products.js';
import type { CategoryNode, ProductDetail, SearchResult } from '../commerce/shapes.js';
import type { RenderEnv } from './env.js';

export const num = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return fallback;
};

/** Stored sort selections are a key, a JSON default, or `{}`; only real keys count. */
export const sortFrom = (value: unknown): SortKey | undefined => (isSortKey(value) ? value : undefined);

export function routeCategory(env: RenderEnv): Promise<CategoryNode | null> {
  const route = env.route;
  if (route?.type !== 'category') return Promise.resolve(null);
  return env.memo(`route-category:${route.slug}`, () => env.commerce.categories.bySlug(route.slug, env.ctx));
}

export function routeProduct(env: RenderEnv): Promise<ProductDetail | null> {
  const route = env.route;
  if (route?.type !== 'pdp') return Promise.resolve(null);
  return env.memo(`route-product:${route.sku}`, () => env.commerce.products.detailBySku(route.sku, env.ctx));
}

/** Facet selections from the host URL: `facet.<name>=a,b` (repeated keys accumulate). */
export function facetFilters(query: URLSearchParams): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of query) {
    if (!key.startsWith('facet.')) continue;
    const name = key.slice('facet.'.length);
    const values = value.split(',').map((v) => v.trim()).filter(Boolean);
    if (name && values.length) out[name] = [...(out[name] ?? []), ...values];
  }
  return out;
}

export interface Listing {
  category: CategoryNode;
  result: SearchResult;
}

/** The route category's product listing, honouring the URL's sort, offset and facets. */
export function routeListing(env: RenderEnv, config: { limit?: unknown; offset?: unknown; sort?: unknown } = {}): Promise<Listing | null> {
  return env.memo(`route-listing:${JSON.stringify([config.limit, config.offset, config.sort, [...env.query]])}`, async () => {
    const category = await routeCategory(env);
    if (!category) return null;
    const result = await env.commerce.products.search(
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
    return { category, result };
  });
}
