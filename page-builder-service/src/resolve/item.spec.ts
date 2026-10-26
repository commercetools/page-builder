import { describe, expect, it } from 'vitest';
import type { ComponentType, DataSourceType, PageComponent, SavedDataSource } from '../domain/types.js';
import { harness, renderEnv } from '../testing/fixtures.js';
import { createItemResolver } from './item.js';

const vis = { mobile: true, tablet: true, desktop: true };
const child = (type: string, settings: Record<string, unknown>): PageComponent => ({ id: 'c', type, name: {}, visibility: vis, settings });
const component = (type: string, schema: ComponentType['schema'], extra: Partial<ComponentType> = {}): ComponentType => ({
  type,
  name: {},
  icon: 'x',
  groupKey: 'g',
  schema,
  ...extra,
});
const source = (type: string, kind?: DataSourceType['resolver']): DataSourceType => ({ type, name: {}, icon: 'x', groupKey: 'g', schema: [], resolver: kind });
const instance = (id: string, type: string, config: Record<string, unknown> = {}): SavedDataSource => ({ id, type, name: {}, config, savedForReuse: true });

describe('createItemResolver', () => {
  it('localizes settings for the request locale, case-insensitively', async () => {
    const env = renderEnv(harness(), { ctx: { locale: 'de-de' } });
    const out = await createItemResolver(env)(child('content/hero', { title: { 'en-US': 'Hi', 'de-DE': 'Hallo' }, n: 2 }));
    expect(out).toEqual({ title: 'Hallo', n: 2 });
  });

  it('replaces a saved data-source id with its resolved data', async () => {
    const env = renderEnv(harness(), {
      instances: [instance('ds1', 'commercetools/product-list', { categoryId: { id: 'cat-women' }, limit: 5, sort: 'price-desc' })],
      dataSources: [source('commercetools/product-list', { kind: 'product-list' })],
    });
    const out = (await createItemResolver(env)(child('product/product-carousel', { title: 'T', products: 'ds1' }))) as { title: string; products: Array<{ sku: string }> };
    expect(out.title).toBe('T');
    expect(out.products.map((p) => p.sku)).toEqual(['COAT-1', 'DRESS-1']);
  });

  it('localizes the instance config before resolving it', async () => {
    const env = renderEnv(harness(), {
      instances: [instance('ds1', 'commercetools/product-list', { query: { 'en-US': 'warm', 'de-DE': 'xyz' } })],
      dataSources: [source('commercetools/product-list', { kind: 'product-list' })],
    });
    const out = (await createItemResolver(env)(child('t', { products: 'ds1' }))) as { products: Array<{ sku: string }> };
    expect(out.products.map((p) => p.sku)).toEqual(['COAT-1']);
  });

  it('resolves data-source ids at any depth', async () => {
    const env = renderEnv(harness(), {
      instances: [instance('ds1', 'commercetools/category', { category: { id: 'cat-men' } })],
      dataSources: [source('commercetools/category', { kind: 'category' })],
    });
    const out = (await createItemResolver(env)(child('t', { rows: [{ cat: 'ds1', other: 'plain' }] }))) as { rows: Array<{ cat: { id: string }; other: string }> };
    expect(out.rows[0].cat.id).toBe('cat-men');
    expect(out.rows[0].other).toBe('plain');
  });

  it('hands the host null, never a raw id, for a data-source field naming an instance that does not exist', async () => {
    const env = renderEnv(harness(), { instances: [] });
    const schema = [{ key: 'products', label: 'P', kind: 'dataSource' as const }];
    const out = await createItemResolver(env)(child('product/product-carousel', { title: 'T', products: 'ds-gone' }));
    expect(out).toEqual({ title: 'T', products: 'ds-gone' }); // no schema known to the env: left as authored
    const withSchema = renderEnv(harness(), {
      instances: [],
      components: [component('product/product-carousel', schema)],
    });
    expect(await createItemResolver(withSchema)(child('product/product-carousel', { title: 'T', products: 'ds-gone' }))).toEqual({
      title: 'T',
      products: null,
    });
  });

  it('keeps a resolved data-source field as resolved data', async () => {
    const env = renderEnv(harness(), {
      instances: [instance('ds1', 'commercetools/category', { category: { id: 'cat-men' } })],
      dataSources: [source('commercetools/category', { kind: 'category' })],
      components: [component('x', [{ key: 'cat', label: 'C', kind: 'dataSource' }])],
    });
    const out = (await createItemResolver(env)(child('x', { cat: 'ds1' }))) as { cat: { id: string } };
    expect(out.cat.id).toBe('cat-men');
  });

  it('passes a type with no resolver kind through as its configuration', async () => {
    const env = renderEnv(harness(), { instances: [instance('ds1', 'custom/thing', { a: 1 })] });
    expect(await createItemResolver(env)(child('t', { x: 'ds1' }))).toEqual({ x: { type: 'custom/thing', a: 1 } });
  });

  it('isolates a failing data source: warns and nulls only that value', async () => {
    const h = harness();
    const warnings: Array<{ obj: Record<string, unknown>; msg: string }> = [];
    const env = renderEnv(h, {
      warnings,
      instances: [instance('bad', 'commercetools/product-list'), instance('good', 'commercetools/category', { category: { id: 'cat-men' } })],
      dataSources: [source('commercetools/product-list', { kind: 'product-list' }), source('commercetools/category', { kind: 'category' })],
    });
    h.fake.failNext('/products/search', 500);
    const out = (await createItemResolver(env)(child('t', { a: 'bad', b: 'good', c: 'text' }))) as Record<string, unknown>;
    expect(out.a).toBeNull();
    expect(out.b).toMatchObject({ id: 'cat-men' });
    expect(out.c).toBe('text');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].obj).toMatchObject({ instance: 'bad', kind: 'product-list' });
  });

  it('resolves picker fields from the component schema', async () => {
    const env = renderEnv(harness(), {
      components: [component('content/spotlight', [{ key: 'product', label: 'p', kind: 'product' }])],
    });
    const out = (await createItemResolver(env)(child('content/spotlight', { product: { id: 'p-coat' } }))) as { product: { id: string } };
    expect(out.product.id).toBe('p-coat');
  });

  it('merges a route-driven fill over the settings', async () => {
    const env = renderEnv(harness(), {
      route: { type: 'pdp', slug: 's', sku: 'DRESS-1' },
      components: [component('product/title', [], { fill: { kind: 'product-detail', slice: 'breadcrumb' } })],
    });
    expect(await createItemResolver(env)(child('product/title', { keep: true }))).toMatchObject({
      keep: true,
      name: 'Summer Dress',
      breadcrumb: [{ name: 'Women' }, { name: 'Dresses' }],
    });
  });

  it('omits a failing fill, warning, and keeps the settings', async () => {
    const h = harness();
    const warnings: Array<{ obj: Record<string, unknown>; msg: string }> = [];
    const env = renderEnv(h, {
      warnings,
      route: { type: 'pdp', slug: 's', sku: 'DRESS-1' },
      components: [component('product/title', [], { fill: { kind: 'product-detail' } })],
    });
    h.fake.failNext('/products/search', 500);
    expect(await createItemResolver(env)(child('product/title', { keep: true }))).toEqual({ keep: true });
    expect(warnings).toHaveLength(1);
  });

  it('handles a component with no settings', async () => {
    const env = renderEnv(harness());
    expect(await createItemResolver(env)({ id: 'c', type: 't', name: {}, visibility: vis } as unknown as PageComponent)).toEqual({});
  });
});
