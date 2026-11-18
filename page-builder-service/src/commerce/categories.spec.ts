import { describe, expect, it } from 'vitest';
import { CTX, harness } from '../testing/fixtures.js';

describe('categories', () => {
  it('builds the tree ordered by orderHint, unordered last', async () => {
    const { commerce } = harness();
    const tree = await commerce.categories.tree(CTX);
    expect(tree.map((c) => c.key)).toEqual(['women', 'men', 'misc']);
    expect(tree[0].children?.map((c) => c.key)).toEqual(['dresses']);
    expect(tree[0].image).toEqual({ url: 'https://img.test/women.jpg' });
  });

  it('limits tree depth', async () => {
    const { commerce } = harness();
    const [women] = await commerce.categories.tree(CTX, 1);
    expect(women.children).toBeUndefined();
  });

  it('localizes names and slugs', async () => {
    const { commerce } = harness();
    const [women] = await commerce.categories.tree({ ...CTX, locale: 'de-DE' });
    expect(women).toMatchObject({ name: 'Damen', slug: 'damen' });
  });

  it('gets a category by id or key with its direct children', async () => {
    const { commerce } = harness();
    expect((await commerce.categories.get('cat-women', CTX))?.children?.map((c) => c.id)).toEqual(['cat-dresses']);
    expect((await commerce.categories.get('women', CTX))?.id).toBe('cat-women');
    expect(await commerce.categories.get('nope', CTX)).toBeNull();
  });

  it('finds a category by slug in the request locale, then any locale', async () => {
    const { commerce } = harness();
    expect((await commerce.categories.bySlug('dresses', CTX))?.id).toBe('cat-dresses');
    expect((await commerce.categories.bySlug('damen', CTX))?.id).toBe('cat-women');
    expect(await commerce.categories.bySlug('nothing', CTX)).toBeNull();
  });

  it('builds a root-to-category breadcrumb', async () => {
    const { commerce } = harness();
    expect(await commerce.categories.breadcrumb('cat-dresses', CTX)).toEqual([
      { name: 'Women', slug: 'women' },
      { name: 'Dresses', slug: 'dresses' },
    ]);
    expect(await commerce.categories.breadcrumb('missing', CTX)).toEqual([]);
  });

  it('lists a category and every descendant', async () => {
    const { commerce } = harness();
    expect(await commerce.categories.subTreeIds('cat-women', CTX)).toEqual(['cat-women', 'cat-dresses']);
    expect(await commerce.categories.subTreeIds('missing', CTX)).toEqual([]);
  });

  describe('list', () => {
    it('returns top-level categories for `parent is not defined`', async () => {
      const { commerce } = harness();
      expect((await commerce.categories.list('parent is not defined', CTX)).map((c) => c.key)).toEqual(['women', 'men', 'misc']);
    });

    it('returns the children of a parent', async () => {
      const { commerce } = harness();
      expect((await commerce.categories.list('parent(id="cat-women")', CTX)).map((c) => c.key)).toEqual(['dresses']);
    });

    it('returns everything for an unrecognised or empty where', async () => {
      const { commerce } = harness();
      expect(await commerce.categories.list(undefined, CTX)).toHaveLength(4);
      expect(await commerce.categories.list('weird > 3', CTX)).toHaveLength(4);
    });
  });

  it('loads the category list once per cache window, and fresh when bypassed', async () => {
    const { commerce, fake } = harness();
    await commerce.categories.tree(CTX);
    await commerce.categories.get('cat-men', CTX);
    expect(fake.calls.filter((c) => c.path === '/categories')).toHaveLength(1);
    await commerce.categories.tree({ ...CTX, bypassCache: true });
    expect(fake.calls.filter((c) => c.path === '/categories')).toHaveLength(2);
  });

  it('paginates across pages and stops on an empty page', async () => {
    const { commerce, fake } = harness({ seed: false });
    for (let i = 0; i < 620; i++) {
      fake.categories.push({ id: `c${i}`, name: { 'en-US': `C${i}` }, slug: { 'en-US': `c${i}` } });
    }
    expect(await commerce.categories.tree(CTX)).toHaveLength(620);
    expect(fake.calls.filter((c) => c.path === '/categories')).toHaveLength(2);
  });

  it('treats a category whose parent is unknown as a root', async () => {
    const { commerce, fake } = harness({ seed: false });
    fake.categories.push({ id: 'orphan', name: { 'en-US': 'Orphan' }, slug: { 'en-US': 'orphan' }, parent: 'ghost' });
    expect((await commerce.categories.tree(CTX)).map((c) => c.id)).toEqual(['orphan']);
  });
});
