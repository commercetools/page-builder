/**
 * The render wire format, taken from the service's OpenAPI document so the shim and the service
 * cannot drift (`npm run generate:api`; a spec fails when the generated file is stale).
 */

import type { components } from './generated/api.js';

type S = components['schemas'];

/** The wire version this shim implements; sent on every render call. */
export const WIRE_VERSION = 1 as const;

export type RenderResult = S['RenderResult'];
export type LayoutSection = S['LayoutSection'];
export type LayoutElement = S['LayoutElement'];
export type LayoutItem = S['LayoutItem'];
export type ResponsiveNumber = S['ResponsiveNumber'];
export type Theme = S['Theme'];

// Canonical resolved-data shapes components receive (docs/sdd/canonical-shapes.md).
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
