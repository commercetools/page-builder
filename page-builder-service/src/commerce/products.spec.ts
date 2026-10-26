import { describe, expect, it } from 'vitest';
import { CTX, harness } from '../testing/fixtures.js';

describe('products.search', () => {
  it('finds products in a category subtree, scoped to the store, newest first by default', async () => {
    const { commerce } = harness();
    const res = await commerce.products.search({ categoryId: 'cat-women', limit: 10, offset: 0 }, CTX);
    expect(res.products.map((p) => p.sku)).toEqual(['DRESS-1', 'COAT-1']);
    expect(res.total).toBe(2);
    expect(res.sort).toEqual({ key: 'newest', field: 'createdAt', order: 'desc' });
  });

  it('excludes subcategories when subTree is false', async () => {
    const { commerce } = harness();
    const res = await commerce.products.search({ categoryId: 'cat-women', subTree: false, limit: 10, offset: 0 }, CTX);
    expect(res.products.map((p) => p.sku)).toEqual(['COAT-1']);
  });

  it('only returns products available in the store', async () => {
    const { commerce } = harness();
    const all = await commerce.products.search({ limit: 10, offset: 0 }, CTX);
    expect(all.products.map((p) => p.id)).not.toContain('p-chino');
    const other = await commerce.products.search({ limit: 10, offset: 0 }, { ...CTX, store: 'other' });
    expect(other.products.map((p) => p.id)).toEqual(['p-chino']);
  });

  it('searches everything when no store is given', async () => {
    const { commerce } = harness();
    const res = await commerce.products.search({ limit: 10, offset: 0 }, { ...CTX, store: undefined });
    expect(res.total).toBe(3);
  });

  it('fails closed for a store that does not exist rather than searching every store', async () => {
    const { commerce } = harness();
    const res = await commerce.products.search({ limit: 10, offset: 0 }, { ...CTX, store: 'ghost' });
    expect(res).toMatchObject({ products: [], total: 0, facets: [] });
    expect(await commerce.products.detailBySku('DRESS-1', { ...CTX, store: 'ghost' })).toBeNull();
  });

  it.each([
    ['price-asc', ['DRESS-1', 'COAT-1']],
    ['price-desc', ['COAT-1', 'DRESS-1']],
    ['name', ['DRESS-1', 'COAT-1']],
    ['newest', ['DRESS-1', 'COAT-1']],
  ] as const)('sorts by %s', async (sort, skus) => {
    const { commerce } = harness();
    const res = await commerce.products.search({ categoryId: 'cat-women', sort, limit: 10, offset: 0 }, CTX);
    expect(res.products.map((p) => p.sku)).toEqual([...skus]);
    expect(res.sort.key).toBe(sort);
  });

  it('scopes the price sort to the request currency', async () => {
    const { commerce, fake } = harness();
    await commerce.products.search({ sort: 'price-asc', limit: 5, offset: 0 }, CTX);
    const search = fake.calls.find((c) => c.path === '/products/search');
    expect((search?.body as { sort: unknown[] }).sort[0]).toMatchObject({
      field: 'variants.prices.centAmount',
      mode: 'min',
      filter: { exact: { field: 'variants.prices.currencyCode', value: 'USD' } },
    });
  });

  it('paginates and clamps the page size', async () => {
    const { commerce } = harness();
    const page = await commerce.products.search({ categoryId: 'cat-women', limit: 1, offset: 1 }, CTX);
    expect(page.products.map((p) => p.sku)).toEqual(['COAT-1']);
    expect(page).toMatchObject({ total: 2, offset: 1, limit: 1 });
    const clamped = await commerce.products.search({ limit: 9999, offset: -5 }, CTX);
    expect(clamped).toMatchObject({ limit: 100, offset: 0 });
  });

  it('full-text searches name and description in the request locale and relevance-sorts', async () => {
    const { commerce } = harness();
    const res = await commerce.products.search({ text: 'warm', limit: 10, offset: 0 }, CTX);
    expect(res.products.map((p) => p.sku)).toEqual(['COAT-1']);
    expect(res.sort.key).toBe('relevance');
  });

  it('finds related products in any of the given categories, excluding one', async () => {
    const { commerce } = harness();
    const res = await commerce.products.search(
      { anyCategoryIds: ['cat-dresses', 'cat-women'], excludeProductId: 'p-dress', limit: 10, offset: 0 },
      CTX
    );
    expect(res.products.map((p) => p.id)).toEqual(['p-coat']);
  });

  describe('facets', () => {
    it('derives facets from searchable enum/text attributes of the product types', async () => {
      const { commerce } = harness();
      const res = await commerce.products.search({ categoryId: 'cat-women', limit: 10, offset: 0 }, CTX);
      expect(res.facets.map((f) => f.name)).toEqual(['color', 'size']);
      const color = res.facets.find((f) => f.name === 'color');
      expect(color?.label).toBe('Color');
      expect(color?.buckets).toEqual(
        expect.arrayContaining([
          { key: 'red', label: 'Red', count: 2 },
          { key: 'blue', label: 'Blue', count: 1 },
        ])
      );
    });

    it('localizes facet and bucket labels', async () => {
      const { commerce } = harness();
      const res = await commerce.products.search({ limit: 10, offset: 0 }, { ...CTX, locale: 'de-DE' });
      const color = res.facets.find((f) => f.name === 'color');
      expect(color?.label).toBe('Farbe');
      expect(color?.buckets.find((b) => b.key === 'red')?.label).toBe('Rot');
    });

    it('filters with OR within a facet and keeps facet counts unfiltered (post filter)', async () => {
      const { commerce } = harness();
      const res = await commerce.products.search(
        { categoryId: 'cat-women', facetFilters: { color: ['blue'] }, limit: 10, offset: 0 },
        CTX
      );
      expect(res.products.map((p) => p.sku)).toEqual(['DRESS-1']);
      expect(res.facets.find((f) => f.name === 'color')?.buckets.find((b) => b.key === 'red')?.count).toBe(2);
    });

    it('ANDs across facets and ORs values within one', async () => {
      const { commerce } = harness();
      const res = await commerce.products.search(
        { categoryId: 'cat-women', facetFilters: { color: ['red', 'blue'], size: ['L'] }, limit: 10, offset: 0 },
        CTX
      );
      expect(res.products.map((p) => p.sku)).toEqual(['DRESS-1', 'COAT-1']);
    });

    it('ignores unknown facets and empty selections', async () => {
      const { commerce } = harness();
      const res = await commerce.products.search(
        { categoryId: 'cat-women', facetFilters: { nope: ['x'], color: [] }, limit: 10, offset: 0 },
        CTX
      );
      expect(res.total).toBe(2);
    });

    it('uses the configured attribute names in order, ignoring unknown ones', async () => {
      const { commerce } = harness({ facetAttributes: ['size', 'ghost', 'color'] });
      const res = await commerce.products.search({ limit: 10, offset: 0 }, CTX);
      expect(res.facets.map((f) => f.name)).toEqual(['size', 'color']);
    });

    it('caps derived facets at the limit', async () => {
      const { commerce } = harness({ facetLimit: 1 });
      expect((await commerce.products.search({ limit: 10, offset: 0 }, CTX)).facets.map((f) => f.name)).toEqual(['color']);
    });

    it('sends no facets when the project has no searchable facetable attributes', async () => {
      const { commerce, fake } = harness({ seed: false });
      const res = await commerce.products.search({ limit: 10, offset: 0 }, { ...CTX, store: undefined });
      expect(res.facets).toEqual([]);
      expect((fake.calls.find((c) => c.path === '/products/search')?.body as Record<string, unknown>).facets).toBeUndefined();
    });
  });

  it('lists every available sort option', async () => {
    const { commerce } = harness();
    const res = await commerce.products.search({ limit: 1, offset: 0 }, CTX);
    expect(res.availableSorts.map((s) => s.key)).toEqual(['relevance', 'newest', 'price-asc', 'price-desc', 'name']);
  });
});

describe('products.byIds / detail', () => {
  it('returns cards in the requested order with price selection applied', async () => {
    const { commerce } = harness();
    const cards = await commerce.products.byIds(['p-coat', 'p-dress', 'p-coat', 'missing'], CTX);
    expect(cards.map((c) => c.id)).toEqual(['p-coat', 'p-dress']);
    expect(cards[1]).toMatchObject({
      sku: 'DRESS-1',
      name: 'Summer Dress',
      slug: 'summer-dress',
      image: { url: 'https://img.test/dress-1.jpg', alt: 'Front' },
      price: { centAmount: 5000, currencyCode: 'USD', discounted: { centAmount: 4000 }, recurrencePolicyId: 'rp-monthly' },
      inStock: true,
      rating: { average: 4.5, count: 10, distribution: { '5': 7, '4': 3, '1': 0, '2': 0, '3': 0 } },
    });
  });

  it('selects the price for the request currency and country', async () => {
    const { commerce } = harness();
    const [eur] = await commerce.products.byIds(['p-dress'], { ...CTX, currency: 'EUR', country: 'DE' });
    expect(eur.price).toMatchObject({ centAmount: 4500, currencyCode: 'EUR' });
    const [none] = await commerce.products.byIds(['p-dress'], { ...CTX, currency: 'JPY', country: 'JP' });
    expect(none.price).toBeUndefined();
  });

  it('returns no cards without calling commercetools for an empty list', async () => {
    const { commerce, fake } = harness();
    expect(await commerce.products.byIds([], CTX)).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });

  it('builds a product detail by sku, including variants, labels and breadcrumb', async () => {
    const { commerce } = harness();
    const d = await commerce.products.detailBySku('DRESS-1-B', CTX);
    expect(d).toMatchObject({
      id: 'p-dress',
      sku: 'DRESS-1',
      description: 'A light summer dress',
      categoryIds: ['cat-dresses'],
      breadcrumb: [
        { name: 'Women', slug: 'women' },
        { name: 'Dresses', slug: 'dresses' },
      ],
      recurrencePolicyIds: ['rp-monthly'],
    });
    expect(d?.variants).toHaveLength(2);
    expect(d?.variants[0].attributes).toEqual([
      { name: 'color', label: 'Color', value: 'Red' },
      { name: 'size', label: 'Size', value: 'M' },
    ]);
    expect(d?.variants[1]).toMatchObject({ sku: 'DRESS-1-B', inStock: false });
  });

  it('returns null for an unknown sku or id, and respects store scoping', async () => {
    const { commerce } = harness();
    expect(await commerce.products.detailBySku('NOPE', CTX)).toBeNull();
    expect(await commerce.products.detailById('nope', CTX)).toBeNull();
    expect(await commerce.products.detailBySku('CHINO-1', CTX)).toBeNull(); // not in store "gap"
    expect((await commerce.products.detailBySku('CHINO-1', { ...CTX, store: 'other' }))?.id).toBe('p-chino');
  });

  it('returns the raw projection for callers that need categories', async () => {
    const { commerce } = harness();
    expect((await commerce.products.projection('p-coat', CTX))?.categories).toEqual([{ typeId: 'category', id: 'cat-women' }]);
    expect(await commerce.products.projection('nope', CTX)).toBeNull();
  });

  it('caches reads for the TTL and bypasses for preview', async () => {
    const { commerce, fake } = harness();
    await commerce.products.byIds(['p-coat'], CTX);
    await commerce.products.byIds(['p-coat'], CTX);
    expect(fake.calls.filter((c) => c.path === '/product-projections')).toHaveLength(1);
    await commerce.products.byIds(['p-coat'], { ...CTX, bypassCache: true });
    expect(fake.calls.filter((c) => c.path === '/product-projections')).toHaveLength(2);
  });

  it('sends price selection, locale and store projection parameters', async () => {
    const { commerce, fake } = harness();
    await commerce.products.byIds(['p-coat'], CTX);
    const call = fake.calls.find((c) => c.path === '/product-projections');
    expect(call?.query).toMatchObject({
      priceCurrency: ['USD'],
      priceCountry: ['US'],
      localeProjection: ['en-US'],
      storeProjection: ['gap'],
      staged: ['false'],
    });
  });
});

describe('facet derivation edge cases', () => {
  it('derives facets from set-of-enum, boolean and plain-enum attributes, with value labels from raw definitions', async () => {
    const { commerce, fake } = harness({ seed: false });
    fake.stores.push({ id: 's', key: 'gap' });
    fake.productTypes.push({
      id: 'pt',
      attributes: [
        { name: 'tags', label: { 'en-US': 'Tags' }, type: { name: 'set', elementType: { name: 'enum', values: [{ key: 'a', label: 'Alpha' }] } } },
        { name: 'organic', label: { 'en-US': 'Organic' }, type: { name: 'boolean' } },
        { name: 'fit', type: { name: 'enum', values: [{ key: 'slim', label: 'Slim' }] } },
        { name: 'dims', type: { name: 'set', elementType: { name: 'number' } } },
        { name: 'color', label: { 'en-US': 'Color' }, type: { name: 'text' } },
      ],
    });
    fake.productTypes.push({ id: 'pt2', attributes: [{ name: 'color', type: { name: 'text' } }] });
    fake.productTypes.push({
      id: 'pt3',
      attributes: [{ name: 'style', label: { 'en-US': 'Style' }, isSearchable: false, type: { name: 'enum', values: [{ key: 'boho', label: 'Boho' }] } }],
    });
    fake.products.push({
      id: 'x',
      name: { 'en-US': 'X' },
      slug: { 'en-US': 'x' },
      categories: [],
      createdAt: '2026-01-01',
      stores: ['s'],
      masterVariant: {
        id: 1,
        sku: 'X',
        attributes: [
          { name: 'tags', value: [{ key: 'a' }] },
          { name: 'organic', value: true },
          { name: 'fit', value: { key: 'slim' } },
          { name: 'style', value: { key: 'boho' } },
          { name: 'unknown', value: { key: 'zzz' } },
        ],
        prices: [{ value: { centAmount: 1, currencyCode: 'USD' } }],
      },
    });
    const res = await commerce.products.search({ facetFilters: { organic: ['true'] }, limit: 5, offset: 0 }, CTX);
    expect(res.facets.map((f) => f.name)).toEqual(['color', 'fit', 'organic', 'tags']);
    expect(res.facets.find((f) => f.name === 'tags')?.buckets).toEqual([{ key: 'a', label: 'Alpha', count: 1 }]);
    expect(res.facets.find((f) => f.name === 'fit')?.label).toBeUndefined();
    expect(res.total).toBe(1);
    const detail = await commerce.products.detailById('x', CTX);
    expect(detail?.variants[0].attributes).toEqual([
      { name: 'tags', label: 'Tags', value: 'Alpha' },
      { name: 'organic', label: 'Organic', value: true },
      { name: 'fit', value: 'Slim' },
      { name: 'style', label: 'Style', value: 'Boho' },
      { name: 'unknown', value: 'zzz' },
    ]);
  });

  it('serves a detail page without labels when the product types cannot be read', async () => {
    const { commerce, fake } = harness();
    fake.failNext('/product-types', 500);
    const detail = await commerce.products.detailById('p-coat', CTX);
    expect(detail?.id).toBe('p-coat');
    expect(detail?.variants[0].attributes[0]).toEqual({ name: 'color', value: 'Red' });
  });
});
