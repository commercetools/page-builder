import { describe, expect, it } from 'vitest';
import { loc, mapAttributeValue, mapCategory, mapPrice, mapProductCard, mapProductDetail, NO_LABELS, type CtProductProjection } from './mappers.js';

const base: CtProductProjection = {
  id: 'p',
  name: { 'en-US': 'Name', 'de-DE': 'Name DE' },
  slug: { 'en-US': 'slug' },
  masterVariant: { id: 1, sku: 'M' },
};

describe('loc', () => {
  it('prefers the locale, falls back to the first value, tolerates absence', () => {
    expect(loc({ a: '1', b: '2' }, 'b')).toBe('2');
    expect(loc({ a: '1' }, 'zz')).toBe('1');
    expect(loc(undefined, 'a')).toBeUndefined();
    expect(loc(null, 'a')).toBeUndefined();
  });
});

describe('mapPrice', () => {
  it('uses the scoped price, with a discount name when present', () => {
    expect(
      mapPrice(
        {
          id: 1,
          scopedPrice: {
            value: { centAmount: 100, currencyCode: 'USD' },
            currentValue: { centAmount: 80, currencyCode: 'USD' },
            discounted: { value: { centAmount: 80, currencyCode: 'USD' }, discount: { obj: { name: { 'en-US': 'Sale' } } } },
          },
          price: { value: { centAmount: 1, currencyCode: 'USD' }, recurrencePolicy: { id: 'rp' } },
        },
        'en-US'
      )
    ).toEqual({
      centAmount: 100,
      currencyCode: 'USD',
      discounted: { centAmount: 80, currencyCode: 'USD', discountName: 'Sale' },
      recurrencePolicyId: 'rp',
    });
  });

  it('falls back to the embedded price, with discount and recurrence', () => {
    expect(
      mapPrice(
        {
          id: 1,
          price: {
            value: { centAmount: 100, currencyCode: 'EUR' },
            discounted: { value: { centAmount: 50, currencyCode: 'EUR' } },
            recurrencePolicy: { id: 'rp' },
          },
        },
        'en-US'
      )
    ).toEqual({ centAmount: 100, currencyCode: 'EUR', discounted: { centAmount: 50, currencyCode: 'EUR' }, recurrencePolicyId: 'rp' });
  });

  it('returns undefined when there is no price at all', () => {
    expect(mapPrice({ id: 1 }, 'en-US')).toBeUndefined();
  });
});

describe('mapProductCard', () => {
  it('shows the matching variant when search marked one', () => {
    const card = mapProductCard(
      { ...base, variants: [{ id: 2, sku: 'V', isMatchingVariant: true, images: [{ url: 'u' }] }] },
      'en-US'
    );
    expect(card.sku).toBe('V');
    expect(card.image).toEqual({ url: 'u' });
  });

  it('falls back to the master image, and omits optional fields', () => {
    const card = mapProductCard(
      { ...base, masterVariant: { id: 1, sku: 'M', images: [{ url: 'm' }] }, variants: [{ id: 2, sku: 'V', isMatchingVariant: true }] },
      'en-US'
    );
    expect(card.image).toEqual({ url: 'm' });
    expect(card).not.toHaveProperty('price');
    expect(card).not.toHaveProperty('inStock');
    expect(card.rating).toBeNull();
  });

  it('treats a zero review count as no rating, and an empty sku as empty', () => {
    const card = mapProductCard({ ...base, masterVariant: { id: 1 }, reviewRatingStatistics: { averageRating: 0, count: 0 } }, 'en-US');
    expect(card.rating).toBeNull();
    expect(card.sku).toBe('');
  });
});

describe('mapAttributeValue', () => {
  const v = (value: unknown) => mapAttributeValue('a', value, 'en-US', NO_LABELS);

  it.each([
    ['text', 'x', 'x'],
    ['number', 3, 3],
    ['boolean', false, false],
    ['null', null, null],
    ['undefined', undefined, null],
    ['enum with string label', { key: 'k', label: 'Label' }, 'Label'],
    ['lenum', { key: 'k', label: { 'en-US': 'Loc', 'de-DE': 'De' } }, 'Loc'],
    ['enum without label', { key: 'k' }, 'k'],
    ['money', { centAmount: 1999, currencyCode: 'USD' }, '19.99 USD'],
    ['ltext', { 'en-US': 'Hello' }, 'Hello'],
    ['set', ['a', 'b'], 'a, b'],
    ['empty set', [], null],
    ['unknown object', { foo: 1 }, null],
  ])('maps %s', (_name, input, expected) => {
    expect(v(input)).toEqual(expected);
  });

  it('uses product-type value labels for a bare enum key', () => {
    expect(
      mapAttributeValue('color', { key: 'red' }, 'en-US', { label: () => undefined, valueLabel: () => 'Red' })
    ).toBe('Red');
  });
});

describe('mapCategory', () => {
  it('maps the first asset source as the image and omits absent fields', () => {
    expect(
      mapCategory(
        { id: 'c', name: { 'en-US': 'N' }, slug: { 'en-US': 's' }, assets: [{ sources: [] }, { sources: [{ uri: 'img' }] }], parent: { id: 'p' } },
        'en-US'
      )
    ).toEqual({ id: 'c', slug: 's', name: 'N', image: { url: 'img' }, parentId: 'p' });
    expect(mapCategory({ id: 'c', name: undefined, slug: undefined }, 'en-US')).toEqual({ id: 'c', slug: '', name: '' });
  });
});

describe('mapProductDetail', () => {
  it('maps a minimal projection without optional fields', () => {
    const d = mapProductDetail({ id: 'p', name: undefined, slug: undefined, masterVariant: { id: 1 } }, 'en-US', []);
    expect(d).toMatchObject({ id: 'p', name: '', slug: '', sku: '', variants: [{ sku: '', images: [], attributes: [] }], categoryIds: [], recurrencePolicyIds: [] });
    expect(d).not.toHaveProperty('meta');
    expect(d).not.toHaveProperty('description');
  });

  it('includes only the meta fields that exist, and de-duplicates recurrence policies', () => {
    const money = { centAmount: 1, currencyCode: 'USD' };
    const d = mapProductDetail(
      {
        ...base,
        metaTitle: { 'en-US': 'T' },
        metaKeywords: { 'en-US': 'k' },
        masterVariant: { id: 1, sku: 'M', prices: [{ value: money, recurrencePolicy: { id: 'rp' } }] },
        variants: [{ id: 2, sku: 'V', prices: [{ value: money, recurrencePolicy: { id: 'rp' } }, { value: money }] }],
      },
      'en-US',
      [{ name: 'Home', slug: 'home' }]
    );
    expect(d.meta).toEqual({ title: 'T', keywords: 'k' });
    expect(d.recurrencePolicyIds).toEqual(['rp']);
    expect(d.breadcrumb).toEqual([{ name: 'Home', slug: 'home' }]);
  });

  it('shows the master variant even when search marked another as matching', () => {
    const d = mapProductDetail({ ...base, variants: [{ id: 2, sku: 'V', isMatchingVariant: true }] }, 'en-US', []);
    expect(d.sku).toBe('M');
  });
});
