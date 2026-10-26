/** Canonical resolved-data shapes, taken from the OpenAPI document so they cannot drift. */

import type { components } from '../generated/api.js';

type S = components['schemas'];

export type Money = S['Money'];
export type Price = S['Price'];
export type Image = S['Image'];
export type RatingSummary = S['RatingSummary'];
export type ProductCard = S['ProductCard'];
export type Variant = S['Variant'];
export type ProductDetail = S['ProductDetail'];
export type CategoryNode = S['CategoryNode'];
export type Breadcrumb = S['Breadcrumb'];
export type Facet = S['Facet'];
export type SortOption = S['SortOption'];
export type SearchResult = S['SearchResult'];

/** The request context every resolver prices, localizes and scopes by. */
export interface CommerceContext {
  /** Preview/draft renders read fresh data: bypass the service cache. */
  bypassCache?: boolean;
  locale: string;
  store?: string;
  currency: string;
  country: string;
}
