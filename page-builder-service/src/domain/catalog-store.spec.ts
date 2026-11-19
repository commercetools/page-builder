import { describe, expect, it } from 'vitest';
import { harness } from '../testing/fixtures.js';
import { createCatalogReader, headOf } from './catalog-store.js';
import { CATALOG_CONTAINER } from './types.js';

const versioned = <T>(head: T, published: unknown = null) => ({
  schemaVersion: 2,
  draft: { schemaVersion: 2, currentVersion: 2, versions: [{ appVersion: 1 }, { appVersion: 2, ...head }] },
  published,
});

describe('headOf', () => {
  it('picks the draft head in preview and the published payload otherwise', () => {
    const value = versioned({ n: 'draft' }, { n: 'published' });
    expect(headOf<{ n: string }>(value, true)?.n).toBe('draft');
    expect(headOf<{ n: string }>(value, false)?.n).toBe('published');
  });

  it('falls back to published in preview when the draft has no versions', () => {
    expect(headOf<{ n: string }>({ draft: { versions: [] }, published: { n: 'p' } }, true)?.n).toBe('p');
  });

  it('returns null for anything unusable', () => {
    expect(headOf('x', true)).toBeNull();
    expect(headOf(null, false)).toBeNull();
    expect(headOf({ published: 'nope' }, false)).toBeNull();
    expect(headOf({ draft: {} }, false)).toBeNull();
  });
});

describe('createCatalogReader', () => {
  const component = { type: 'content/hero', name: {}, icon: 'x', groupKey: 'g', schema: [] };
  const source = { type: 'commercetools/category', name: {}, icon: 'x', groupKey: 'g', schema: [], resolver: { kind: 'category' } };

  function setup() {
    const h = harness({ seed: false });
    return { ...h, reader: createCatalogReader(h.store) };
  }

  it('reads published catalogs and indexes them by type', async () => {
    const { fake, reader } = setup();
    fake.put(CATALOG_CONTAINER, 'components', versioned({ components: [] }, { components: [component] }));
    fake.put(CATALOG_CONTAINER, 'data-sources', versioned({}, { sources: [source] }));
    fake.put(CATALOG_CONTAINER, 'sections', versioned({}, { sections: [{ id: 'MAIN' }] }));
    fake.put(CATALOG_CONTAINER, 'theme', versioned({}, { theme: { containerMaxWidth: '70rem' } }));
    const cat = await reader.catalog(false);
    expect([...cat.components.keys()]).toEqual(['content/hero']);
    expect([...cat.dataSources.keys()]).toEqual(['commercetools/category']);
    expect(cat.sections).toEqual([{ id: 'MAIN' }]);
    expect(cat.theme).toEqual({ containerMaxWidth: '70rem' });
  });

  it('reads draft heads in preview', async () => {
    const { fake, reader } = setup();
    fake.put(CATALOG_CONTAINER, 'components', versioned({ components: [component] }, { components: [] }));
    expect((await reader.catalog(true)).components.size).toBe(1);
    expect((await reader.catalog(false)).components.size).toBe(0);
  });

  it('returns an empty catalog when nothing was synced', async () => {
    const { reader } = setup();
    const cat = await reader.catalog(false);
    expect(cat.components.size).toBe(0);
    expect(cat.dataSources.size).toBe(0);
    expect(cat.sections).toEqual([]);
    expect(cat.theme).toBeUndefined();
  });

  describe('instances', () => {
    const inst = (id: string) => ({ id, type: 't', name: {}, config: {}, savedForReuse: true });

    it('reads published instances, and the flat draft in preview', async () => {
      const { fake, reader } = setup();
      fake.put(CATALOG_CONTAINER, 'data-source-instances', {
        draft: { instances: [inst('d1'), inst('d2')] },
        published: { instances: [inst('p1')] },
      });
      expect([...(await reader.instances(false)).keys()]).toEqual(['p1']);
      expect([...(await reader.instances(true)).keys()]).toEqual(['d1', 'd2']);
    });

    it('falls back to published in preview when there is no draft', async () => {
      const { fake, reader } = setup();
      fake.put(CATALOG_CONTAINER, 'data-source-instances', { published: { instances: [inst('p1')] } });
      expect([...(await reader.instances(true)).keys()]).toEqual(['p1']);
    });

    it('is empty when absent or malformed', async () => {
      const { fake, reader } = setup();
      expect((await reader.instances(false)).size).toBe(0);
      fake.put(CATALOG_CONTAINER, 'data-source-instances', 'junk');
      expect((await reader.instances(false)).size).toBe(0);
    });
  });

  describe('settings', () => {
    it('reads the preview settings payload', async () => {
      const { fake, reader } = setup();
      fake.put(CATALOG_CONTAINER, 'settings', { schemaVersion: 2, preview: { homePageId: 'start', routes: { home: '/' } } });
      expect(await reader.settings(false)).toEqual({ homePageId: 'start', routes: { home: '/' } });
    });

    it('defaults to empty when missing or malformed', async () => {
      const { fake, reader } = setup();
      expect(await reader.settings(false)).toEqual({});
      fake.put(CATALOG_CONTAINER, 'settings', { preview: 'bad' });
      expect(await reader.settings(false)).toEqual({});
    });
  });
});
