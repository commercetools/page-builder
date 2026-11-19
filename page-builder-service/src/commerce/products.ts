/**
 * Product access: Product Search for finding products, the (non-deprecated) Query API for
 * fetching their projections with price selection and locale projection.
 *
 * Search returns ids only; projections are fetched separately with `priceCurrency` +
 * `priceCountry` (adds `scopedPrice`), `localeProjection` and `storeProjection`, then put back
 * in search order. This keeps us off the deprecated `productProjectionParameters`.
 */

import type { TtlCache } from '../cache.js';
import type { ProductSearchRequest } from '@commercetools/platform-sdk';
import { isCtStatus, type ApiRoot } from '../ct/client.js';
import type { Categories } from './categories.js';
import type { FacetCatalog, FacetDefinition } from './facets.js';
import {
  mapProductCard,
  mapProductDetail,
  type CtProductProjection,
  type AttributeLabels,
  NO_LABELS,
  loc,
} from './mappers.js';
import type {
  CommerceContext,
  Facet,
  ProductCard,
  ProductDetail,
  SearchResult,
  SortOption,
} from './shapes.js';

export type SortKey = SortOption['key'];

export const SORT_KEYS: readonly SortKey[] = ['relevance', 'newest', 'price-asc', 'price-desc', 'name'];

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && (SORT_KEYS as readonly string[]).includes(value);
}

export interface SearchParams {
  categoryId?: string;
  /** Include products in subcategories (default true when `categoryId` is set). */
  subTree?: boolean;
  /** Match any of these categories (used for related products). */
  anyCategoryIds?: string[];
  text?: string;
  sort?: SortKey;
  limit: number;
  offset: number;
  /** Facet name → selected values (OR within a facet, AND across facets). */
  facetFilters?: Record<string, string[]>;
  /** Exclude one product (related products). */
  excludeProductId?: string;
}

const MAX_PAGE = 100;

const sortCatalogue = (locale: string): Record<SortKey, SortOption & { searchSort: Record<string, unknown> }> => ({
  relevance: { key: 'relevance', field: 'score', order: 'desc', searchSort: { field: 'score', order: 'desc' } },
  newest: { key: 'newest', field: 'createdAt', order: 'desc', searchSort: { field: 'createdAt', order: 'desc' } },
  'price-asc': {
    key: 'price-asc',
    field: 'variants.prices.centAmount',
    order: 'asc',
    searchSort: { field: 'variants.prices.centAmount', order: 'asc', mode: 'min' },
  },
  'price-desc': {
    key: 'price-desc',
    field: 'variants.prices.centAmount',
    order: 'desc',
    searchSort: { field: 'variants.prices.centAmount', order: 'desc', mode: 'max' },
  },
  name: { key: 'name', field: 'name', order: 'asc', searchSort: { field: 'name', language: locale, order: 'asc' } },
});

const toSortOption = ({ key, field, order }: SortOption): SortOption => ({ key, field, order });

export interface Products {
  search(params: SearchParams, ctx: CommerceContext): Promise<SearchResult>;
  byIds(ids: string[], ctx: CommerceContext): Promise<ProductCard[]>;
  detailBySku(sku: string, ctx: CommerceContext): Promise<ProductDetail | null>;
  detailById(id: string, ctx: CommerceContext): Promise<ProductDetail | null>;
  detailByKey(key: string, ctx: CommerceContext): Promise<ProductDetail | null>;
  /** Raw projection by id, for callers that need categories (related products). */
  projection(id: string, ctx: CommerceContext): Promise<CtProductProjection | null>;
}

export interface ProductsDeps {
  client: ApiRoot;
  cache: TtlCache;
  categories: Categories;
  facetCatalog: (ctx: CommerceContext) => Promise<FacetCatalog>;
}

interface SearchResponse {
  total?: number;
  offset: number;
  limit: number;
  results: Array<{ id: string }>;
  facets?: Array<{ name: string; buckets?: Array<{ key: string; count: number }> }>;
}

const exact = (field: string, value: string, extra: Record<string, unknown> = {}) => ({
  exact: { field, value, ...extra },
});

function facetExpression(def: FacetDefinition, values: string[]) {
  const one = (v: string) =>
    def.fieldType === 'boolean'
      ? { exact: { field: def.field, fieldType: 'boolean', value: v === 'true' } }
      : { exact: { field: def.field, fieldType: def.fieldType, value: v } };
  return values.length === 1 ? one(values[0]) : { or: values.map(one) };
}

const allOf = (expressions: unknown[]): unknown => (expressions.length === 1 ? expressions[0] : { and: expressions });

type SortCatalogue = ReturnType<typeof sortCatalogue>;

function sortSummary(
  sorts: SortCatalogue,
  selected: SortCatalogue[SortKey]
): Pick<SearchResult, 'sort' | 'availableSorts'> {
  return { sort: toSortOption(selected), availableSorts: SORT_KEYS.map((k) => toSortOption(sorts[k])) };
}

function queryClause(params: SearchParams, store: string | undefined, locale: string): Record<string, unknown> {
  const must: unknown[] = [];
  if (store) must.push(exact('stores', store));
  if (params.categoryId) {
    must.push(exact(params.subTree === false ? 'categories' : 'categoriesSubTree', params.categoryId));
  }
  if (params.anyCategoryIds?.length) {
    must.push({ or: params.anyCategoryIds.map((id) => exact('categories', id)) });
  }
  if (params.text) {
    must.push({
      or: ['name', 'description'].map((field) => ({
        fullText: { field, language: locale, value: params.text, mustMatch: 'all', caseInsensitive: true },
      })),
    });
  }
  if (params.excludeProductId) must.push({ not: [exact('id', params.excludeProductId)] });
  return must.length ? { query: allOf(must) } : {};
}

function sortClause(sortKey: SortKey, selected: SortCatalogue[SortKey], currency: string): Record<string, unknown> {
  return sortKey.startsWith('price-')
    ? { ...selected.searchSort, filter: exact('variants.prices.currencyCode', currency) }
    : selected.searchSort;
}

function postFilterClause(
  facetFilters: Record<string, string[]> | undefined,
  definitions: FacetDefinition[]
): Record<string, unknown> {
  const postFilter = Object.entries(facetFilters ?? {})
    .filter(([, v]) => v.length > 0)
    .map(([name, values]) => {
      const def = definitions.find((d) => d.name === name);
      return def ? facetExpression(def, values) : null;
    })
    .filter((e): e is NonNullable<typeof e> => !!e);
  return postFilter.length ? { postFilter: allOf(postFilter) } : {};
}

function facetsClause(definitions: FacetDefinition[]): Record<string, unknown> {
  if (!definitions.length) return {};
  return {
    facets: definitions.map((d) => ({
      distinct: { name: d.name, field: d.field, fieldType: d.fieldType, limit: 20 },
    })),
  };
}

function mapFacet(
  f: NonNullable<SearchResponse['facets']>[number],
  definitions: FacetDefinition[],
  labels: AttributeLabels,
  locale: string
): Facet | null {
  const def = definitions.find((d) => d.name === f.name);
  if (!def) return null;
  const label = labels.label(def.name, locale);
  return {
    name: def.name,
    ...(label ? { label } : {}),
    buckets: (f.buckets ?? []).map((b) => {
      const raw = def.values.get(b.key);
      const bucketLabel = typeof raw === 'string' ? raw : loc(raw, locale);
      return { key: b.key, ...(bucketLabel ? { label: bucketLabel } : {}), count: b.count };
    }),
  };
}

function mapFacets(
  facets: SearchResponse['facets'],
  definitions: FacetDefinition[],
  labels: AttributeLabels,
  locale: string
): Facet[] {
  return (facets ?? [])
    .map((f) => mapFacet(f, definitions, labels, locale))
    .filter((f): f is Facet => f !== null);
}

export function createProducts(deps: ProductsDeps): Products {
  const { client, cache, categories, facetCatalog } = deps;
  const key = (...parts: unknown[]): string => JSON.stringify(parts);

  /** The `stores` search field takes the store's id, so resolve the key (cached). */
  async function storeId(ctx: CommerceContext): Promise<string | undefined> {
    if (!ctx.store) return undefined;
    return cache.read(
      key('store', ctx.store),
      async () => {
        try {
          return (await client.stores().withKey({ key: ctx.store as string }).get().execute()).body.id;
        } catch (err) {
          if (isCtStatus(err, 404)) return undefined;
          throw err;
        }
      },
      { bypass: ctx.bypassCache }
    );
  }

  async function fetchProjections(ids: string[], ctx: CommerceContext): Promise<CtProductProjection[]> {
    if (ids.length === 0) return [];
    return cache.read(
      key('projections', ids, ctx.locale, ctx.currency, ctx.country, ctx.store),
      async () => {
        const { body } = await client
          .productProjections()
          .get({
            queryArgs: {
              where: `id in (${ids.map((id) => `"${id}"`).join(', ')})`,
              limit: Math.min(ids.length, 500),
              staged: false,
              priceCurrency: ctx.currency,
              priceCountry: ctx.country,
              localeProjection: ctx.locale,
              storeProjection: ctx.store,
            },
          })
          .execute();
        const byId = new Map<string, CtProductProjection>(body.results.map((p) => [p.id, p]));
        // Search order is the contract; ids CT no longer returns are dropped.
        return ids.map((id) => byId.get(id)).filter((p): p is CtProductProjection => !!p);
      },
      { bypass: ctx.bypassCache }
    );
  }

  async function runSearch(body: Record<string, unknown>): Promise<SearchResponse> {
    // The clause helpers build the request from the same documented shapes; the SDK's request
    // type is a closed union they cannot all be proven against statically.
    const res = await client.products().search().post({ body: body as ProductSearchRequest }).execute();
    return res.body as SearchResponse;
  }

  async function searchIds(body: Record<string, unknown>, ctx: CommerceContext): Promise<SearchResponse> {
    return cache.read(key('search', body), () => runSearch(body), { bypass: ctx.bypassCache });
  }

  async function firstId(field: string, value: string, ctx: CommerceContext): Promise<string | undefined> {
    const store = await storeId(ctx);
    if (ctx.store && !store) return undefined;
    const query = store ? { and: [exact(field, value), exact('stores', store)] } : exact(field, value);
    const res = await searchIds({ query, limit: 1 }, ctx);
    return res.results[0]?.id;
  }

  async function detail(p: CtProductProjection, ctx: CommerceContext, labels: AttributeLabels): Promise<ProductDetail> {
    const primary = p.categories?.[0]?.id;
    const breadcrumb = primary ? await categories.breadcrumb(primary, ctx) : [];
    return mapProductDetail(p, ctx.locale, breadcrumb, labels);
  }

  return {
    async search(params, ctx) {
      const limit = Math.max(1, Math.min(params.limit, MAX_PAGE));
      const offset = Math.max(0, params.offset);
      const { definitions, labels } = await facetCatalog(ctx);
      const sorts = sortCatalogue(ctx.locale);
      const sortKey: SortKey = params.sort ?? (params.text ? 'relevance' : 'newest');
      const selectedSort = sorts[sortKey];

      const store = await storeId(ctx);
      // Fail closed: a store key that does not resolve must not widen the search to every store.
      if (ctx.store && !store) {
        return { products: [], total: 0, offset, limit, facets: [], ...sortSummary(sorts, selectedSort) };
      }

      const body: Record<string, unknown> = {
        ...queryClause(params, store, ctx.locale),
        sort: [sortClause(sortKey, selectedSort, ctx.currency)],
        limit,
        offset,
        ...postFilterClause(params.facetFilters, definitions),
        ...facetsClause(definitions),
      };

      const res = await searchIds(body, ctx);
      const projections = await fetchProjections(res.results.map((r) => r.id), ctx);

      return {
        products: projections.map((p) => mapProductCard(p, ctx.locale)),
        total: res.total ?? projections.length,
        offset,
        limit,
        facets: mapFacets(res.facets, definitions, labels, ctx.locale),
        ...sortSummary(sorts, selectedSort),
      };
    },

    async byIds(ids, ctx) {
      const unique = [...new Set(ids)];
      return (await fetchProjections(unique, ctx)).map((p) => mapProductCard(p, ctx.locale));
    },

    async detailBySku(sku, ctx) {
      const id = await firstId('variants.sku', sku, ctx);
      return id ? this.detailById(id, ctx) : null;
    },

    async detailByKey(productKey, ctx) {
      const id = await firstId('key', productKey, ctx);
      return id ? this.detailById(id, ctx) : null;
    },

    async detailById(id, ctx) {
      const [p] = await fetchProjections([id], ctx);
      if (!p) return null;
      const { labels } = await facetCatalog(ctx).catch(() => ({ labels: NO_LABELS }));
      return detail(p, ctx, labels);
    },

    async projection(id, ctx) {
      return (await fetchProjections([id], ctx))[0] ?? null;
    },
  };
}
