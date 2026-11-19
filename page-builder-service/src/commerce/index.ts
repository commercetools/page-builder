import type { TtlCache } from '../cache.js';
import type { ApiRoot } from '../ct/client.js';
import { createCategories, type Categories } from './categories.js';
import { createFacetCatalog, type FacetOptions } from './facets.js';
import { createProducts, type Products } from './products.js';

export interface Commerce {
  categories: Categories;
  products: Products;
}

export function createCommerce(client: ApiRoot, cache: TtlCache, facets: FacetOptions): Commerce {
  const categories = createCategories(client, cache);
  const products = createProducts({
    client,
    cache,
    categories,
    facetCatalog: createFacetCatalog(client, cache, facets),
  });
  return { categories, products };
}

export type { Categories, Products };
export type { CommerceContext } from './shapes.js';
