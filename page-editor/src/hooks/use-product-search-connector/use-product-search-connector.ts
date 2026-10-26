/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import { useMcQuery } from '@commercetools-frontend/application-shell-connectors';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import SearchProductsQuery from './search-products.ctp.graphql';
import FirstCategoryProductQuery from './first-category-product.ctp.graphql';

export type ProductSearchItem = {
  id: string;
  key: string | null;
  name: string | null;
  sku: string | null;
  imageUrl: string | null;
};

type RawResult = {
  productsSearch: {
    results: Array<{
      id: string;
      product: {
        id: string;
        key: string | null;
        masterData: {
          current: {
            name: string | null;
            allVariants: Array<{
              id: number;
              sku: string | null;
              key: string | null;
              images: Array<{ url: string }>;
            }>;
          };
        };
      };
    }>;
  };
};

function buildQuery(text: string, locale: string) {
  return {
    or: [
      { prefix: { field: 'variants.sku', value: text } },
      { prefix: { field: 'variants.key', value: text } },
      { fullText: { field: 'name', value: text, language: locale } },
      { wildcard: { field: 'variants.sku', value: `*${text}*` } },
      { wildcard: { field: 'variants.key', value: `*${text}*` } },
    ],
  };
}

export type ProductSearchConnectorResult = {
  results: ProductSearchItem[];
  loading: boolean;
};

export const useProductSearch = (
  text: string,
  locale: string
): ProductSearchConnectorResult => {
  const skip = !text.trim();

  const { data, loading } = useMcQuery<RawResult>(SearchProductsQuery, {
    variables: { query: buildQuery(text, locale), limit: 10, locale },
    skip,
    context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
  });

  const results: ProductSearchItem[] = (data?.productsSearch.results ?? []).map(
    (r) => {
      const current = r.product.masterData.current;
      const firstVariant = current.allVariants[0] ?? null;
      return {
        id: r.product.id,
        key: r.product.key,
        name: current.name,
        sku: firstVariant?.sku ?? null,
        imageUrl: firstVariant?.images[0]?.url ?? null,
      };
    }
  );

  return { results, loading: !skip && loading };
};

// ---------------------------------------------------------------------------
// Sample product for a PDP preview — so the preview renders a real product.
// For a category PDP (`pdp-<categoryId>`) it's the first product in that
// category; for the "All categories" PDP (`pdp-cat-root`) — or any base PDP,
// where `categoryId` is null — it's the first product in the whole catalog.
// ---------------------------------------------------------------------------

export type FirstCategoryProduct = { sku: string; slug: string };

type FirstCategoryProductRawResult = {
  productsSearch: {
    results: Array<{
      product: {
        id: string;
        masterData: {
          current: {
            slug: string | null;
            masterVariant: { sku: string | null };
          };
        };
      };
    }>;
  };
};

/**
 * Fetch a sample product for a PDP preview: the first product in `categoryId`
 * (or any of its subcategories) when given, otherwise the first product in the
 * whole catalog. `enabled` gates the query (false → skipped, e.g. non-PDP pages).
 */
export const useCategorySampleProduct = (
  enabled: boolean,
  categoryId: string | null,
  locale: string
): { product: FirstCategoryProduct | null; loading: boolean } => {
  const skip = !enabled;

  const { data, loading } = useMcQuery<FirstCategoryProductRawResult>(
    FirstCategoryProductQuery,
    {
      variables: {
        // A real category → filter by its subtree; otherwise match any product.
        query: categoryId
          ? { exact: { field: 'categoriesSubTree', value: categoryId } }
          : { exists: { field: 'id' } },
        locale,
      },
      skip,
      // A transient sample lookup — don't normalize it into the cache. The
      // Product Search result's ProductVariant (`id` is only unique per product)
      // can't be cache-keyed from this query shape, which otherwise throws and
      // drops the result. no-cache returns the raw network response instead.
      fetchPolicy: 'no-cache',
      context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
    }
  );

  const current = data?.productsSearch.results[0]?.product.masterData.current;
  const product =
    current?.slug && current.masterVariant.sku
      ? { slug: current.slug, sku: current.masterVariant.sku }
      : null;

  return { product, loading: !skip && loading };
};
