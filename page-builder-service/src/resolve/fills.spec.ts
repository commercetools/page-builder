import { describe, expect, it } from 'vitest';
import { harness, renderEnv } from '../testing/fixtures.js';
import { resolveFill } from './fills.js';

const pdp = { type: 'pdp', slug: 'summer-dress', sku: 'DRESS-1' } as const;
const plp = { type: 'category', slug: 'women' } as const;

describe('resolveFill — product-detail', () => {
  const fill = (slice: string | undefined, h = harness()) =>
    resolveFill({ kind: 'product-detail', slice }, renderEnv(h, { route: pdp }));

  it('returns the whole product by default and for unknown slices', async () => {
    expect(((await fill(undefined)) as { product: { id: string } }).product.id).toBe('p-dress');
    expect(((await fill('mystery')) as { product: { id: string } }).product.id).toBe('p-dress');
    expect(((await fill('product')) as { product: { id: string } }).product.id).toBe('p-dress');
  });

  it('cuts the price slice', async () => {
    expect(await fill('price')).toMatchObject({ sku: 'DRESS-1', price: { centAmount: 5000, discounted: { centAmount: 4000 } } });
  });

  it('collects unique gallery images, master first', async () => {
    const res = (await fill('gallery')) as { images: Array<{ url: string }> };
    expect(res.images.map((i) => i.url)).toEqual(['https://img.test/dress-1.jpg', 'https://img.test/dress-1b.jpg']);
  });

  it('cuts variants, attributes, description, rating and breadcrumb', async () => {
    expect(((await fill('variants')) as { variants: unknown[] }).variants).toHaveLength(2);
    expect(await fill('attributes')).toMatchObject({ attributes: [{ name: 'color', value: 'Red' }, { name: 'size', value: 'M' }] });
    expect(await fill('description')).toEqual({ description: 'A light summer dress' });
    expect(await fill('rating')).toMatchObject({ rating: { average: 4.5 } });
    expect(await fill('breadcrumb')).toMatchObject({ name: 'Summer Dress', breadcrumb: [{ name: 'Women' }, { name: 'Dresses' }] });
  });

  it('defaults an absent description and rating', async () => {
    const h = harness();
    const env = renderEnv(h, { route: { type: 'pdp', slug: 'c', sku: 'COAT-1' } });
    expect(await resolveFill({ kind: 'product-detail', slice: 'description' }, env)).toEqual({ description: 'A warm coat' });
    h.fake.products[1].description = undefined;
    const env2 = renderEnv(h, { route: { type: 'pdp', slug: 'c', sku: 'COAT-1' }, ctx: { locale: 'de-DE' } });
    expect(await resolveFill({ kind: 'product-detail', slice: 'description' }, env2)).toEqual({ description: '' });
    expect(await resolveFill({ kind: 'product-detail', slice: 'rating' }, env2)).toEqual({ rating: null });
  });

  it('returns related products from shared categories', async () => {
    const h = harness();
    h.fake.products[1].categories = ['cat-dresses'];
    expect((await fill('related', h)) as { related: Array<{ sku: string }> }).toMatchObject({ related: [{ sku: 'COAT-1' }] });
  });

  it('is empty when the route is not a product page or the product is unknown', async () => {
    expect(await resolveFill({ kind: 'product-detail' }, renderEnv(harness()))).toEqual({});
    expect(await resolveFill({ kind: 'product-detail' }, renderEnv(harness(), { route: { type: 'pdp', slug: 's', sku: 'NOPE' } }))).toEqual({});
  });

  it('fetches the product once for many components on a page', async () => {
    const h = harness();
    const env = renderEnv(h, { route: pdp });
    await Promise.all(['product', 'price', 'gallery', 'variants', 'attributes', 'description'].map((slice) => resolveFill({ kind: 'product-detail', slice }, env)));
    expect(h.fake.calls.filter((c) => c.path === '/products/search')).toHaveLength(1);
    expect(h.fake.calls.filter((c) => c.path === '/product-projections')).toHaveLength(1);
  });
});

describe('resolveFill — category-listing', () => {
  const fill = (slice: string | undefined, query = '', h = harness()) =>
    resolveFill({ kind: 'category-listing', slice }, renderEnv(h, { route: plp, query }));

  it('returns the full listing by default', async () => {
    const res = (await fill(undefined)) as Record<string, unknown>;
    expect(Object.keys(res).sort()).toEqual(['availableSorts', 'breadcrumb', 'category', 'facets', 'limit', 'offset', 'products', 'sort', 'total']);
    expect(res.breadcrumb).toEqual([{ name: 'Women', slug: 'women' }]);
  });

  it('cuts each slice', async () => {
    expect(await fill('category')).toMatchObject({ category: { id: 'cat-women' } });
    expect(await fill('breadcrumb')).toEqual({ breadcrumb: [{ name: 'Women', slug: 'women' }] });
    expect(((await fill('facets')) as { facets: unknown[] }).facets.length).toBeGreaterThan(0);
    expect(await fill('sort')).toMatchObject({ sort: { key: 'newest' }, availableSorts: expect.any(Array) });
    expect(await fill('pagination')).toEqual({ total: 2, offset: 0, limit: 24 });
    expect(await fill('subcategories')).toMatchObject({ subcategories: [{ id: 'cat-dresses' }] });
    expect(((await fill('products')) as { products: unknown[] }).products).toHaveLength(2);
  });

  it('honours URL sort, offset and facets', async () => {
    expect(await fill('pagination', 'offset=1')).toMatchObject({ offset: 1 });
    expect(await fill('sort', 'sort=name')).toMatchObject({ sort: { key: 'name' } });
    expect(((await fill('products', 'facet.color=blue')) as { products: Array<{ sku: string }> }).products.map((p) => p.sku)).toEqual(['DRESS-1']);
  });

  it('has no subcategories for a leaf category, and is empty off a category route', async () => {
    const leaf = await resolveFill({ kind: 'category-listing', slice: 'subcategories' }, renderEnv(harness(), { route: { type: 'category', slug: 'dresses' } }));
    expect(leaf).toEqual({ subcategories: [] });
    expect(await resolveFill({ kind: 'category-listing' }, renderEnv(harness()))).toEqual({});
  });

  it('searches once for many components on a page', async () => {
    const h = harness();
    const env = renderEnv(h, { route: plp });
    await Promise.all(['facets', 'sort', 'pagination', 'products', 'subcategories'].map((slice) => resolveFill({ kind: 'category-listing', slice }, env)));
    expect(h.fake.calls.filter((c) => c.path === '/products/search')).toHaveLength(1);
  });
});
