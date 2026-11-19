import {
  useCategorySampleProduct,
  useProductSearch,
} from './use-product-search-connector';
import { renderHookWithProviders, waitFor } from '../../test-utils/render';
import {
  installMockServer,
  respondUsing,
  respondWith,
} from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';

installMockServer();

const searchHit = (
  id: string,
  over: {
    key?: string | null;
    name?: string | null;
    variants?: Array<{ sku: string | null; key: string | null; url?: string }>;
  } = {}
) => ({
  __typename: 'ProductSearchResult',
  id,
  product: {
    __typename: 'Product',
    id,
    key: over.key ?? null,
    masterData: {
      __typename: 'ProductCatalogData',
      current: {
        __typename: 'ProductData',
        name: over.name ?? null,
        allVariants: (over.variants ?? []).map((v, i) => ({
          __typename: 'ProductVariant',
          id: i + 1,
          sku: v.sku,
          key: v.key,
          images: v.url ? [{ __typename: 'Image', url: v.url }] : [],
        })),
      },
    },
  },
});

const searchReturns = (...results: unknown[]) =>
  server.use(
    respondWith('SearchProducts', {
      productsSearch: { __typename: 'ProductSearchQueryResult', results },
    })
  );

describe('useProductSearch', () => {
  const render = (text: string, locale = 'en-US') =>
    renderHookWithProviders(() => useProductSearch(text, locale));

  it('searches nothing for empty or whitespace text', () => {
    expect(render('').result.current).toEqual({ results: [], loading: false });
    expect(render('   ').result.current).toEqual({
      results: [],
      loading: false,
    });
  });

  it('maps a hit to id, key, name, first sku and first image', async () => {
    searchReturns(
      searchHit('p1', {
        key: 'boots',
        name: 'Boots',
        variants: [
          { sku: 'SKU-1', key: 'v1', url: 'https://img/1.jpg' },
          { sku: 'SKU-2', key: 'v2' },
        ],
      })
    );

    const { result } = render('boot');
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0]).toEqual({
      id: 'p1',
      key: 'boots',
      name: 'Boots',
      sku: 'SKU-1',
      imageUrl: 'https://img/1.jpg',
    });
  });

  it('reports nulls for a product with no variants', async () => {
    searchReturns(searchHit('p1', { name: 'Nothing', variants: [] }));

    const { result } = render('x');
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0].sku).toBeNull();
    expect(result.current.results[0].imageUrl).toBeNull();
  });

  it('reports a null image for a variant with no images', async () => {
    searchReturns(searchHit('p1', { variants: [{ sku: 'SKU-1', key: null }] }));

    const { result } = render('x');
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0].imageUrl).toBeNull();
  });

  it('searches sku, key and name so a partial code still matches', async () => {
    let seen: Record<string, unknown> = {};
    server.use(
      respondUsing('SearchProducts', (variables) => {
        seen = variables;
        return {
          productsSearch: {
            __typename: 'ProductSearchQueryResult',
            results: [],
          },
        };
      })
    );

    render('abc');
    await waitFor(() => expect(seen.query).toBeDefined());

    const clauses = (seen.query as { or: Array<Record<string, unknown>> }).or;
    expect(clauses).toEqual([
      { prefix: { field: 'variants.sku', value: 'abc' } },
      { prefix: { field: 'variants.key', value: 'abc' } },
      { fullText: { field: 'name', value: 'abc', language: 'en-US' } },
      { wildcard: { field: 'variants.sku', value: '*abc*' } },
      { wildcard: { field: 'variants.key', value: '*abc*' } },
    ]);
    expect(seen.limit).toBe(10);
  });

  it('returns nothing when the search matches nothing', async () => {
    searchReturns();

    const { result } = render('nothing');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.results).toEqual([]);
  });
});

describe('useCategorySampleProduct', () => {
  const sampleHit = (slug: string | null, sku: string | null) => ({
    __typename: 'ProductSearchResult',
    product: {
      __typename: 'Product',
      id: 'p1',
      masterData: {
        __typename: 'ProductCatalogData',
        current: {
          __typename: 'ProductData',
          slug,
          masterVariant: { __typename: 'ProductVariant', sku },
        },
      },
    },
  });

  const sampleReturns = (...results: unknown[]) =>
    server.use(
      respondWith('FirstCategoryProduct', {
        productsSearch: { __typename: 'ProductSearchQueryResult', results },
      })
    );

  const render = (
    enabled: boolean,
    categoryId: string | null,
    locale = 'en-US'
  ) =>
    renderHookWithProviders(() =>
      useCategorySampleProduct(enabled, categoryId, locale)
    );

  it('does not query at all when disabled', () => {
    const { result } = render(false, 'shoes');
    expect(result.current).toEqual({ product: null, loading: false });
  });

  it('returns the first product of the category subtree', async () => {
    sampleReturns(sampleHit('boots', 'SKU-1'));

    const { result } = render(true, 'shoes');
    await waitFor(() => expect(result.current.product).not.toBeNull());
    expect(result.current.product).toEqual({ slug: 'boots', sku: 'SKU-1' });
  });

  it('filters by the category subtree when given a category', async () => {
    let seen: Record<string, unknown> = {};
    server.use(
      respondUsing('FirstCategoryProduct', (variables) => {
        seen = variables;
        return {
          productsSearch: {
            __typename: 'ProductSearchQueryResult',
            results: [],
          },
        };
      })
    );

    render(true, 'shoes');
    await waitFor(() => expect(seen.query).toBeDefined());
    expect(seen.query).toEqual({
      exact: { field: 'categoriesSubTree', value: 'shoes' },
    });
  });

  it('matches any product when there is no category', async () => {
    let seen: Record<string, unknown> = {};
    server.use(
      respondUsing('FirstCategoryProduct', (variables) => {
        seen = variables;
        return {
          productsSearch: {
            __typename: 'ProductSearchQueryResult',
            results: [],
          },
        };
      })
    );

    render(true, null);
    await waitFor(() => expect(seen.query).toBeDefined());
    expect(seen.query).toEqual({ exists: { field: 'id' } });
  });

  it('reports nothing when the category has no products', async () => {
    sampleReturns();

    const { result } = render(true, 'empty');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.product).toBeNull();
  });

  it('reports nothing when the sample product lacks a slug or sku', async () => {
    sampleReturns(sampleHit(null, 'SKU-1'));
    const { result } = render(true, 'shoes');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.product).toBeNull();
  });

  it('reports nothing when the master variant has no sku', async () => {
    sampleReturns(sampleHit('boots', null));
    const { result } = render(true, 'shoes');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.product).toBeNull();
  });
});
