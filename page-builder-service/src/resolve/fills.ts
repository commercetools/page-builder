/**
 * Route-driven fills for system components (`fill: { kind, slice }` in the catalog): the service
 * resolves the page's product / category listing from the request path and cuts out the slice a
 * component needs. Each distinct upstream query runs once per render (see `RenderEnv.memo`).
 */

import type { FillKind } from '../domain/types.js';
import type { Image } from '../commerce/shapes.js';
import type { RenderEnv } from './env.js';
import { KIND_RESOLVERS } from './kinds.js';
import { routeListing, routeProduct } from './route-data.js';

export type Slice = Record<string, unknown>;

async function productDetail(slice: string | undefined, env: RenderEnv): Promise<Slice> {
  const product = await routeProduct(env);
  if (!product) return {};
  switch (slice) {
    case 'price':
      return { price: product.price ?? null, sku: product.sku };
    case 'gallery': {
      const seen = new Set<string>();
      const images: Image[] = [];
      for (const image of [...(product.image ? [product.image] : []), ...product.variants.flatMap((v) => v.images)]) {
        if (!seen.has(image.url)) {
          seen.add(image.url);
          images.push(image);
        }
      }
      return { images, sku: product.sku };
    }
    case 'variants':
      return { variants: product.variants, sku: product.sku };
    case 'attributes':
      return { attributes: product.variants[0]?.attributes ?? [], sku: product.sku };
    case 'description':
      return { description: product.description ?? '' };
    case 'rating':
      return { rating: product.rating ?? null };
    case 'breadcrumb':
      return { breadcrumb: product.breadcrumb, name: product.name };
    case 'related':
      return { related: await KIND_RESOLVERS['related-products']({}, env) };
    default:
      return { product };
  }
}

async function categoryListing(slice: string | undefined, env: RenderEnv): Promise<Slice> {
  const listing = await routeListing(env);
  if (!listing) return {};
  const { category, result } = listing;
  const breadcrumb = () => env.commerce.categories.breadcrumb(category.id, env.ctx);
  switch (slice) {
    case 'category':
      return { category };
    case 'breadcrumb':
      return { breadcrumb: await breadcrumb() };
    case 'facets':
      return { facets: result.facets };
    case 'sort':
      return { sort: result.sort, availableSorts: result.availableSorts };
    case 'pagination':
      return { total: result.total, offset: result.offset, limit: result.limit };
    case 'subcategories':
      return { subcategories: category.children ?? [] };
    case 'products':
      return { products: result.products };
    default:
      return { category, breadcrumb: await breadcrumb(), ...result };
  }
}

export function resolveFill(fill: { kind: FillKind; slice?: string }, env: RenderEnv): Promise<Slice> {
  return fill.kind === 'product-detail' ? productDetail(fill.slice, env) : categoryListing(fill.slice, env);
}
