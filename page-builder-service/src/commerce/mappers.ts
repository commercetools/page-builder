/**
 * commercetools → canonical shapes. Pure functions; no I/O.
 *
 * The ProductProjection is expected to be fetched with price selection (`priceCurrency` +
 * `priceCountry`), which adds `scopedPrice` to each variant; absent that, the embedded price
 * is used.
 */

import type {
  Breadcrumb,
  CategoryNode,
  Image,
  Money,
  Price,
  ProductCard,
  ProductDetail,
  RatingSummary,
  Variant,
} from './shapes.js';

type Localized = Record<string, string> | undefined | null;

/** A localized string for `locale`, falling back to the first available value. */
export function loc(value: Localized, locale: string): string | undefined {
  if (!value) return undefined;
  return value[locale] ?? Object.values(value)[0];
}

// ── Raw commercetools shapes (only the fields we read) ──────────────────────────────────

export interface CtMoney {
  centAmount: number;
  currencyCode: string;
}

export interface CtPrice {
  value: CtMoney;
  discounted?: { value: CtMoney; discount?: { obj?: { name?: Localized } } };
  recurrencePolicy?: { id: string };
}

export interface CtScopedPrice {
  value: CtMoney;
  currentValue: CtMoney;
  discounted?: { value: CtMoney; discount?: { obj?: { name?: Localized } } };
}

export interface CtAttribute {
  name: string;
  value: unknown;
}

export interface CtVariant {
  id: number;
  sku?: string;
  images?: Array<{ url: string; label?: string }>;
  price?: CtPrice;
  prices?: CtPrice[];
  scopedPrice?: CtScopedPrice;
  attributes?: CtAttribute[];
  availability?: { isOnStock?: boolean };
  isMatchingVariant?: boolean;
}

export interface CtProductProjection {
  id: string;
  key?: string;
  name: Localized;
  slug: Localized;
  description?: Localized;
  metaTitle?: Localized;
  metaDescription?: Localized;
  metaKeywords?: Localized;
  categories?: Array<{ id: string }>;
  masterVariant: CtVariant;
  variants?: CtVariant[];
  reviewRatingStatistics?: {
    averageRating: number;
    count: number;
    ratingsDistribution?: Record<string, number>;
  };
}

export interface CtCategory {
  id: string;
  key?: string;
  name: Localized;
  slug: Localized;
  description?: Localized;
  parent?: { id: string };
  orderHint?: string;
  assets?: Array<{ sources?: Array<{ uri: string }> }>;
}

/** Attribute display metadata derived from product types. */
export interface AttributeLabels {
  /** `name` → localized label. */
  label: (name: string, locale: string) => string | undefined;
  /** `name` + stored enum key → localized label of the value. */
  valueLabel: (name: string, key: string, locale: string) => string | undefined;
}

export const NO_LABELS: AttributeLabels = {
  label: () => undefined,
  valueLabel: () => undefined,
};

// ── Mappers ─────────────────────────────────────────────────────────────────────────────

const money = (m: CtMoney): Money => ({ centAmount: m.centAmount, currencyCode: m.currencyCode });

export function mapPrice(variant: CtVariant, locale: string): Price | undefined {
  const scoped = variant.scopedPrice;
  if (scoped) {
    const price: Price = money(scoped.value);
    if (scoped.discounted) {
      const name = loc(scoped.discounted.discount?.obj?.name, locale);
      price.discounted = { ...money(scoped.discounted.value), ...(name ? { discountName: name } : {}) };
    }
    const recurrence = variant.price?.recurrencePolicy?.id;
    if (recurrence) price.recurrencePolicyId = recurrence;
    return price;
  }

  const embedded = variant.price;
  if (!embedded) return undefined;
  const price: Price = money(embedded.value);
  if (embedded.discounted) {
    const name = loc(embedded.discounted.discount?.obj?.name, locale);
    price.discounted = { ...money(embedded.discounted.value), ...(name ? { discountName: name } : {}) };
  }
  if (embedded.recurrencePolicy) price.recurrencePolicyId = embedded.recurrencePolicy.id;
  return price;
}

function mapRating(p: CtProductProjection): RatingSummary | null {
  const stats = p.reviewRatingStatistics;
  if (!stats || stats.count === 0) return null;
  const d = stats.ratingsDistribution ?? {};
  return {
    average: stats.averageRating,
    count: stats.count,
    distribution: { '1': d['1'] ?? 0, '2': d['2'] ?? 0, '3': d['3'] ?? 0, '4': d['4'] ?? 0, '5': d['5'] ?? 0 },
  };
}

const allVariants = (p: CtProductProjection): CtVariant[] => [p.masterVariant, ...(p.variants ?? [])];

const toImage = (i: { url: string; label?: string }): Image => ({
  url: i.url,
  ...(i.label ? { alt: i.label } : {}),
});

/** The variant a card shows: the matching variant when the search marked one, else the master. */
function displayedVariant(p: CtProductProjection): CtVariant {
  return allVariants(p).find((v) => v.isMatchingVariant) ?? p.masterVariant;
}

export function mapProductCard(
  p: CtProductProjection,
  locale: string,
  variant: CtVariant = displayedVariant(p)
): ProductCard {
  const v = variant;
  const image = v.images?.[0] ?? p.masterVariant.images?.[0];
  const price = mapPrice(v, locale);
  return {
    id: p.id,
    ...(p.key ? { key: p.key } : {}),
    sku: v.sku ?? p.masterVariant.sku ?? '',
    name: loc(p.name, locale) ?? '',
    slug: loc(p.slug, locale) ?? '',
    ...(image ? { image: toImage(image) } : {}),
    ...(price ? { price } : {}),
    ...(v.availability?.isOnStock !== undefined ? { inStock: v.availability.isOnStock } : {}),
    rating: mapRating(p),
  };
}

type AttributeValue = string | number | boolean | null;

function mapEnumAttributeValue(
  key: string,
  label: unknown,
  name: string,
  locale: string,
  labels: AttributeLabels
): string {
  if (typeof label === 'string') return label;
  if (label && typeof label === 'object') return loc(label as Record<string, string>, locale) ?? key;
  return labels.valueLabel(name, key, locale) ?? key;
}

function mapObjectAttributeValue(
  o: Record<string, unknown>,
  name: string,
  locale: string,
  labels: AttributeLabels
): AttributeValue {
  // enum / lenum: { key, label }
  if (typeof o.key === 'string') return mapEnumAttributeValue(o.key, o.label, name, locale, labels);
  // money: { centAmount, currencyCode }
  if (typeof o.centAmount === 'number' && typeof o.currencyCode === 'string') {
    return `${(o.centAmount / 100).toFixed(2)} ${o.currencyCode}`;
  }
  // ltext: { 'en-US': '…' }
  const text = loc(o as Record<string, string>, locale);
  return typeof text === 'string' ? text : null;
}

/** Flatten a commercetools attribute value to a displayable scalar. */
export function mapAttributeValue(
  name: string,
  value: unknown,
  locale: string,
  labels: AttributeLabels
): AttributeValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const parts = value.map((v) => mapAttributeValue(name, v, locale, labels)).filter((v) => v !== null);
    return parts.length ? parts.join(', ') : null;
  }
  if (typeof value === 'object') {
    return mapObjectAttributeValue(value as Record<string, unknown>, name, locale, labels);
  }
  return null;
}

function mapVariant(v: CtVariant, locale: string, labels: AttributeLabels): Variant {
  const price = mapPrice(v, locale);
  return {
    sku: v.sku ?? '',
    images: (v.images ?? []).map(toImage),
    ...(price ? { price } : {}),
    attributes: (v.attributes ?? []).map((a) => {
      const label = labels.label(a.name, locale);
      return {
        name: a.name,
        ...(label ? { label } : {}),
        value: mapAttributeValue(a.name, a.value, locale, labels),
      };
    }),
    ...(v.availability?.isOnStock !== undefined ? { inStock: v.availability.isOnStock } : {}),
  };
}

function collectRecurrencePolicyIds(p: CtProductProjection): string[] {
  const ids = new Set<string>();
  for (const v of allVariants(p)) {
    for (const price of v.prices ?? []) if (price.recurrencePolicy) ids.add(price.recurrencePolicy.id);
  }
  return [...ids];
}

function mapMeta(p: CtProductProjection, locale: string): { meta?: NonNullable<ProductDetail['meta']> } {
  const title = loc(p.metaTitle, locale);
  const description = loc(p.metaDescription, locale);
  const keywords = loc(p.metaKeywords, locale);
  if (!title && !description && !keywords) return {};
  return {
    meta: {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(keywords ? { keywords } : {}),
    },
  };
}

export function mapProductDetail(
  p: CtProductProjection,
  locale: string,
  breadcrumb: Breadcrumb,
  labels: AttributeLabels = NO_LABELS
): ProductDetail {
  // A detail page shows the master variant, regardless of any matching-variant mark.
  const card = mapProductCard(p, locale, p.masterVariant);
  const description = loc(p.description, locale);

  return {
    ...card,
    ...(description ? { description } : {}),
    variants: allVariants(p).map((v) => mapVariant(v, locale, labels)),
    categoryIds: (p.categories ?? []).map((c) => c.id),
    breadcrumb,
    recurrencePolicyIds: collectRecurrencePolicyIds(p),
    ...mapMeta(p, locale),
  };
}

/** The card view of a detail (drops variants, breadcrumb and the other detail-only fields). */
export function cardOf(d: ProductDetail): ProductCard {
  const { id, key, sku, name, slug, image, price, inStock, rating } = d;
  return {
    id,
    ...(key ? { key } : {}),
    sku,
    name,
    slug,
    ...(image ? { image } : {}),
    ...(price ? { price } : {}),
    ...(inStock !== undefined ? { inStock } : {}),
    ...(rating !== undefined ? { rating } : {}),
  };
}

export function mapCategory(c: CtCategory, locale: string): CategoryNode {
  const uri = c.assets?.find((a) => a.sources?.length)?.sources?.[0]?.uri;
  const description = loc(c.description, locale);
  return {
    id: c.id,
    ...(c.key ? { key: c.key } : {}),
    slug: loc(c.slug, locale) ?? '',
    name: loc(c.name, locale) ?? '',
    ...(description ? { description } : {}),
    ...(uri ? { image: { url: uri } } : {}),
    ...(c.parent ? { parentId: c.parent.id } : {}),
  };
}
