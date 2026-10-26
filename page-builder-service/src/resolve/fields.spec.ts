import { describe, expect, it } from 'vitest';
import type { SchemaField } from '../domain/types.js';
import { harness, renderEnv } from '../testing/fixtures.js';
import { resolveFields } from './fields.js';

const field = (key: string, kind: SchemaField['kind'], extra: Partial<SchemaField> = {}): SchemaField => ({ key, label: key, kind, ...extra });

describe('resolveFields', () => {
  it('resolves each picker kind and leaves other keys untouched', async () => {
    const env = renderEnv(harness());
    const out = await resolveFields(
      {
        title: 'Keep',
        hero: { id: 'p-coat' },
        picks: [{ id: 'p-dress' }],
        pins: [{ position: 1, id: 'p-coat' }],
        cat: { id: 'cat-men' },
        cats: [{ id: 'cat-women' }],
        catPins: [{ position: 1, id: 'cat-men' }],
      },
      [
        field('title', 'text'),
        field('hero', 'product'),
        field('picks', 'productPicks'),
        field('pins', 'productPins'),
        field('cat', 'category'),
        field('cats', 'categoryPicks'),
        field('catPins', 'categoryPins'),
      ],
      env
    );
    expect(out.title).toBe('Keep');
    expect(out.hero).toMatchObject({ id: 'p-coat', variants: expect.any(Array) });
    expect(out.picks).toMatchObject([{ id: 'p-dress' }]);
    expect(out.pins).toMatchObject([{ id: 'p-coat' }]);
    expect(out.cat).toMatchObject({ id: 'cat-men' });
    expect(out.cats).toMatchObject([{ id: 'cat-women' }]);
    expect(out.catPins).toMatchObject([{ id: 'cat-men' }]);
  });

  it('resolves picker fields nested in group entries', async () => {
    const env = renderEnv(harness());
    const out = await resolveFields(
      { slides: [{ headline: 'A', product: { id: 'p-coat' } }, 'junk', { headline: 'B', product: '' }] },
      [field('slides', 'group', { children: [field('headline', 'text'), field('product', 'product')] })],
      env
    );
    const slides = out.slides as Array<Record<string, unknown>>;
    expect(slides[0]).toMatchObject({ headline: 'A', product: { id: 'p-coat' } });
    expect(slides[1]).toBe('junk');
    expect(slides[2]).toEqual({ headline: 'B', product: null });
  });

  it('leaves a non-array group value alone and skips absent keys', async () => {
    const env = renderEnv(harness());
    const out = await resolveFields({ g: 'x' }, [field('g', 'group'), field('missing', 'product')], env);
    expect(out).toEqual({ g: 'x' });
  });

  it('resolves empty references to null / empty lists', async () => {
    const env = renderEnv(harness());
    const out = await resolveFields(
      { a: '', b: [], c: null },
      [field('a', 'product'), field('b', 'productPicks'), field('c', 'category')],
      env
    );
    expect(out).toEqual({ a: null, b: [], c: null });
  });

  it('isolates a failing field: warns, nulls it and resolves the rest', async () => {
    const h = harness();
    const warnings: Array<{ obj: Record<string, unknown>; msg: string }> = [];
    const env = renderEnv(h, { warnings });
    h.fake.failNext('/product-projections', 500);
    const out = await resolveFields(
      { a: { id: 'p-coat' }, b: { id: 'cat-men' } },
      [field('a', 'product'), field('b', 'category')],
      env
    );
    expect(out.a).toBeNull();
    expect(out.b).toMatchObject({ id: 'cat-men' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].obj.field).toBe('a');
  });
});
