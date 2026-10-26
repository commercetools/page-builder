import { describe, expect, it } from 'vitest';
import type { ProductCard } from '../commerce/shapes.js';
import { harness, renderEnv } from '../testing/fixtures.js';
import { KIND_RESOLVERS, readRef, readRefs } from './kinds.js';
import { facetFilters, num, sortFrom } from './route-data.js';

describe('readRef / readRefs', () => {
  it.each([
    ['id string', 'p-1', { id: 'p-1' }],
    ['full ref', { id: 'a', key: 'b', sku: 'c' }, { id: 'a', key: 'b', sku: 'c' }],
    ['key only', { key: 'k' }, { id: undefined, key: 'k', sku: undefined }],
    ['empty string', '', null],
    ['empty object', {}, null],
    ['number', 3, null],
    ['array', [], null],
    ['null', null, null],
  ])('reads %s', (_n, input, expected) => {
    expect(readRef(input)).toEqual(expected);
  });

  it('reads lists, dropping empty refs and non-lists', () => {
    expect(readRefs([{ id: 'a' }, '', { id: 'b' }])).toEqual([
      { id: 'a', key: undefined, sku: undefined },
      { id: 'b', key: undefined, sku: undefined },
    ]);
    expect(readRefs('nope')).toEqual([]);
  });
});

describe('route-data helpers', () => {
  it('num parses numbers and numeric strings, else falls back', () => {
    expect(num(5, 1)).toBe(5);
    expect(num('7', 1)).toBe(7);
    expect(num('', 3)).toBe(3);
    expect(num('abc', 3)).toBe(3);
    expect(num(Infinity, 3)).toBe(3);
    expect(num({}, 3)).toBe(3);
  });

  it('sortFrom accepts only real sort keys', () => {
    expect(sortFrom('price-asc')).toBe('price-asc');
    expect(sortFrom('[{"field":"score"}]')).toBeUndefined();
    expect(sortFrom({})).toBeUndefined();
  });

  it('facetFilters reads facet.<name> params, splitting commas and accumulating repeats', () => {
    expect(facetFilters(new URLSearchParams('facet.color=red,blue&facet.color=green&facet.size=M&sort=x&facet.=bad&facet.empty='))).toEqual({
      color: ['red', 'blue', 'green'],
      size: ['M'],
    });
  });
});

const skus = (cards: Array<{ sku: string }>) => cards.map((c) => c.sku);

describe('KIND_RESOLVERS', () => {
  describe('product', () => {
    it('resolves a configured product ref by id, sku or key', async () => {
      const h = harness();
      const env = renderEnv(h);
      expect(((await KIND_RESOLVERS.product({ product: { id: 'p-coat' } }, env)) as { sku: string }).sku).toBe('COAT-1');
      expect(((await KIND_RESOLVERS.product({ product: { sku: 'DRESS-1' } }, env)) as { id: string }).id).toBe('p-dress');
      expect(((await KIND_RESOLVERS.product({ product: { key: 'wool-coat' } }, env)) as { id: string }).id).toBe('p-coat');
    });

    it('falls back to the route product', async () => {
      const env = renderEnv(harness(), { route: { type: 'pdp', slug: 's', sku: 'DRESS-1' } });
      expect(((await KIND_RESOLVERS.product({}, env)) as { id: string }).id).toBe('p-dress');
    });

    it('is null with neither a ref nor a product route', async () => {
      expect(await KIND_RESOLVERS.product({}, renderEnv(harness()))).toBeNull();
    });
  });

  describe('product-list', () => {
    it('lists by query and category with the configured sort and limit', async () => {
      const env = renderEnv(harness());
      const cards = (await KIND_RESOLVERS['product-list']({ categoryId: { id: 'cat-women' }, limit: 5, sort: 'price-desc' }, env)) as ProductCard[];
      expect(skus(cards)).toEqual(['COAT-1', 'DRESS-1']);
    });

    it('excludes subcategories when categorySubTree is false', async () => {
      const env = renderEnv(harness());
      const cards = (await KIND_RESOLVERS['product-list']({ categoryId: { id: 'cat-women' }, categorySubTree: false }, env)) as ProductCard[];
      expect(skus(cards)).toEqual(['COAT-1']);
    });

    it('applies a text query', async () => {
      const env = renderEnv(harness());
      expect(skus((await KIND_RESOLVERS['product-list']({ query: 'warm' }, env)) as ProductCard[])).toEqual(['COAT-1']);
    });

    it('supports the legacy categories list and string numbers', async () => {
      const env = renderEnv(harness());
      const cards = (await KIND_RESOLVERS['product-list']({ categories: [{ id: 'cat-dresses' }], limit: '3', offset: '' }, env)) as ProductCard[];
      expect(skus(cards)).toEqual(['DRESS-1']);
    });

    it('places pinned products (current and legacy shapes) and removes duplicates', async () => {
      const env = renderEnv(harness());
      const current = (await KIND_RESOLVERS['product-list']({ productPins: [{ position: 1, id: 'p-coat' }], limit: 2 }, env)) as ProductCard[];
      expect(skus(current)).toEqual(['COAT-1', 'DRESS-1']);
      const legacy = (await KIND_RESOLVERS['product-list']({ pinnedProducts: [{ position: 2, productId: 'p-coat' }], limit: 2 }, env)) as ProductCard[];
      expect(skus(legacy)).toEqual(['DRESS-1', 'COAT-1']);
    });

    it('clamps the limit to 1..100', async () => {
      const env = renderEnv(harness());
      expect(((await KIND_RESOLVERS['product-list']({ limit: 0 }, env)) as ProductCard[]).length).toBe(1);
    });
  });

  describe('products-by-category', () => {
    const route = { type: 'category', slug: 'women' } as const;

    it('returns the route category listing with facets', async () => {
      const env = renderEnv(harness(), { route });
      const res = (await KIND_RESOLVERS['products-by-category']({ limit: 24 }, env)) as { products: ProductCard[]; facets: unknown[]; total: number };
      expect(skus(res.products)).toEqual(['DRESS-1', 'COAT-1']);
      expect(res.total).toBe(2);
      expect(res.facets.length).toBeGreaterThan(0);
    });

    it('lets the URL drive sort, offset and facet filters', async () => {
      const env = renderEnv(harness(), { route, query: 'sort=price-desc&offset=1&facet.color=red' });
      const res = (await KIND_RESOLVERS['products-by-category']({ sort: 'newest' }, env)) as { products: ProductCard[]; sort: { key: string }; offset: number };
      expect(res.sort.key).toBe('price-desc');
      expect(res.offset).toBe(1);
      expect(skus(res.products)).toEqual(['DRESS-1']);
    });

    it('uses a configured category over the route', async () => {
      const env = renderEnv(harness(), { route });
      const res = (await KIND_RESOLVERS['products-by-category']({ category: { id: 'cat-dresses' } }, env)) as { products: ProductCard[] };
      expect(skus(res.products)).toEqual(['DRESS-1']);
    });

    it('is null off a category route', async () => {
      expect(await KIND_RESOLVERS['products-by-category']({}, renderEnv(harness()))).toBeNull();
    });
  });

  describe('related-products', () => {
    it('lists products sharing a category with the route product, excluding it', async () => {
      const env = renderEnv(harness(), { route: { type: 'pdp', slug: 's', sku: 'DRESS-1' } });
      // The coat is in the parent category only, so it does not share a category with the dress.
      expect(await KIND_RESOLVERS['related-products']({}, env)).toEqual([]);
    });

    it('finds siblings in a shared category', async () => {
      const h = harness();
      h.fake.products[1].categories = ['cat-dresses'];
      const env = renderEnv(h, { route: { type: 'pdp', slug: 's', sku: 'DRESS-1' } });
      expect(skus((await KIND_RESOLVERS['related-products']({ limit: 5 }, env)) as ProductCard[])).toEqual(['COAT-1']);
    });

    it('is empty off a product route', async () => {
      expect(await KIND_RESOLVERS['related-products']({}, renderEnv(harness()))).toEqual([]);
    });
  });

  describe('picks and pins', () => {
    it('resolves product picks in order and skips unknown ids', async () => {
      const env = renderEnv(harness());
      const cards = (await KIND_RESOLVERS['product-picks']({ productPicks: [{ id: 'p-coat' }, { id: 'nope' }, { id: 'p-dress' }] }, env)) as ProductCard[];
      expect(skus(cards)).toEqual(['COAT-1', 'DRESS-1']);
    });

    it('resolves refs given only a sku or key', async () => {
      const env = renderEnv(harness());
      const cards = (await KIND_RESOLVERS['product-picks']({ productPicks: [{ sku: 'DRESS-1' }, { key: 'wool-coat' }, { sku: 'GHOST' }] }, env)) as ProductCard[];
      expect(skus(cards)).toEqual(['DRESS-1', 'COAT-1']);
      expect(Object.keys(cards[0])).not.toContain('variants');
    });

    it('resolves product pins in position order', async () => {
      const env = renderEnv(harness());
      const cards = (await KIND_RESOLVERS['product-pins']({ productPins: [{ position: 2, id: 'p-dress' }, { position: 1, id: 'p-coat' }] }, env)) as ProductCard[];
      expect(skus(cards)).toEqual(['COAT-1', 'DRESS-1']);
    });

    it('resolves category picks and pins by id or key', async () => {
      const env = renderEnv(harness());
      const picks = (await KIND_RESOLVERS['category-picks']({ categoryPicks: [{ id: 'cat-men' }, { key: 'women' }, { id: 'ghost' }] }, env)) as Array<{ id: string }>;
      expect(picks.map((c) => c.id)).toEqual(['cat-men', 'cat-women']);
      const pins = (await KIND_RESOLVERS['category-pins']({ categoryPins: [{ position: 2, id: 'cat-men' }, { position: 1, id: 'cat-women', key: 'women' }] }, env)) as Array<{ id: string }>;
      expect(pins.map((c) => c.id)).toEqual(['cat-women', 'cat-men']);
    });
  });

  describe('categories', () => {
    it('resolves a configured category, else the route category', async () => {
      const env = renderEnv(harness(), { route: { type: 'category', slug: 'dresses' } });
      expect(((await KIND_RESOLVERS.category({ category: { id: 'cat-men' } }, env)) as { id: string }).id).toBe('cat-men');
      expect(((await KIND_RESOLVERS.category({}, env)) as { id: string }).id).toBe('cat-dresses');
      expect(await KIND_RESOLVERS.category({}, renderEnv(harness()))).toBeNull();
    });

    it('lists top-level categories with pins and a limit', async () => {
      const env = renderEnv(harness());
      const res = (await KIND_RESOLVERS['category-list']({ where: 'parent is not defined', categoryPins: [{ position: 1, id: 'cat-men' }], limit: 3 }, env)) as Array<{ id: string }>;
      expect(res.map((c) => c.id)).toEqual(['cat-men', 'cat-women', 'cat-unordered']);
    });

    it('returns the category tree to a depth', async () => {
      const env = renderEnv(harness());
      const tree = (await KIND_RESOLVERS['category-tree']({ depth: 1 }, env)) as Array<{ children?: unknown[] }>;
      expect(tree[0].children).toBeUndefined();
      const full = (await KIND_RESOLVERS['category-tree']({}, env)) as Array<{ children?: unknown[] }>;
      expect(full[0].children).toHaveLength(1);
    });
  });
});
