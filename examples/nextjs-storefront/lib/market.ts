/** The shopper's market from the first path segment: `/en-us/...`, `/de-de/...`. */

export interface Market {
  slug: string;
  locale: string;
  currency: string;
  country: string;
}

export const MARKETS: Market[] = [
  { slug: 'en-us', locale: 'en-US', currency: 'USD', country: 'US' },
  { slug: 'de-de', locale: 'de-DE', currency: 'EUR', country: 'DE' },
];

export const DEFAULT_MARKET = MARKETS[0];

export const marketFor = (segment: string | undefined): Market | undefined =>
  MARKETS.find((m) => m.slug === segment?.toLowerCase());
