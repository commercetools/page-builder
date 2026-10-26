import { describe, expect, it } from 'vitest';
import { createCtStore } from '../ct/store.js';
import { createApiRoot } from '../ct/client.js';
import { TtlCache } from '../cache.js';
import { createFakeCt } from '../testing/fake-ct.js';
import { CT_CONFIG, sampleCatalog } from '../testing/fixtures.js';
import { createCatalogReader } from './catalog-store.js';
import { appendDraft, createCatalogWriter, partsOf, promoteDraft, sourceHashOf } from './catalog-write.js';
import { CATALOG_CONTAINER, MAX_VERSIONS, type CombinedCatalog } from './types.js';

const stored = (fake: ReturnType<typeof createFakeCt>, key: string) => fake.customObjects.get(`${CATALOG_CONTAINER}/${key}`)!;

function setup() {
  const fake = createFakeCt('us-store');
  const store = createCtStore(createApiRoot(CT_CONFIG, { fetch: fake.fetch }), new TtlCache(0));
  return { fake, store, writer: createCatalogWriter(store), reader: createCatalogReader(store) };
}

describe('sourceHashOf', () => {
  it('is independent of key order', () => {
    expect(sourceHashOf({ a: 1, b: { c: [1, 2], d: null } })).toBe(sourceHashOf({ b: { d: null, c: [1, 2] }, a: 1 }));
    expect(sourceHashOf({ a: 1 })).not.toBe(sourceHashOf({ a: 2 }));
  });
});

describe('appendDraft', () => {
  it('creates, no-ops on identical content, and bumps on change', () => {
    const first = appendDraft(null, { n: 1 }, 't1');
    expect(first).toMatchObject({ changed: true, appVersion: 1 });
    expect(first.combined.published).toBeNull();
    expect(appendDraft(first.combined, { n: 1 }, 't2')).toMatchObject({ changed: false, appVersion: 1 });
    const second = appendDraft(first.combined, { n: 2 }, 't3');
    expect(second).toMatchObject({ changed: true, appVersion: 2 });
    expect(second.combined.draft.currentVersion).toBe(2);
  });

  it('caps history at MAX_VERSIONS keeping the newest', () => {
    let combined: CombinedCatalog<{ n: number }> | null = null;
    for (let n = 1; n <= MAX_VERSIONS + 5; n++) combined = appendDraft(combined, { n }, 't').combined;
    expect(combined!.draft.versions).toHaveLength(MAX_VERSIONS);
    expect(combined!.draft.versions.at(-1)!.appVersion).toBe(MAX_VERSIONS + 5);
    expect(combined!.draft.currentVersion).toBe(MAX_VERSIONS);
  });
});

describe('promoteDraft', () => {
  it('copies the head to published and stamps it', () => {
    const { combined } = appendDraft(null, { n: 1 }, 't1');
    const next = promoteDraft(combined, 't2');
    expect(next.published).toMatchObject({ schemaVersion: 2, appVersion: 1, publishedAt: 't2', n: 1 });
    expect(next.draft.versions[0]!.publishedAt).toBe('t2');
  });

  it('refuses an empty draft', () => {
    const empty = { schemaVersion: 2, draft: { schemaVersion: 2, currentVersion: 0, versions: [] }, published: null } as CombinedCatalog<object>;
    expect(() => promoteDraft(empty, 't')).toThrow('nothing to publish');
  });
});

describe('catalog writer', () => {
  it('push writes drafts only; the reader sees them in preview but not published', async () => {
    const { writer, reader } = setup();
    expect(await writer.push(sampleCatalog(), 't1')).toMatchObject({ status: 'written', appVersion: 1 });

    expect((await reader.catalog(true)).components.has('hero')).toBe(true);
    expect((await reader.catalog(false)).components.size).toBe(0);
  });

  it('is idempotent by content hash', async () => {
    const { writer, fake } = setup();
    await writer.push(sampleCatalog(), 't1');
    const before = stored(fake, 'components').version;
    expect(await writer.push(sampleCatalog(), 't2')).toMatchObject({ status: 'unchanged', appVersion: 1 });
    expect(stored(fake, 'components').version).toBe(before);
  });

  it('writes only the parts that changed', async () => {
    const { writer, fake } = setup();
    await writer.push(sampleCatalog(), 't1');
    const sectionsVersion = stored(fake, 'sections').version;
    const next = sampleCatalog();
    next.theme = { containerMaxWidth: '60rem' };
    expect(await writer.push(next, 't2')).toMatchObject({ status: 'written', appVersion: 2 });
    expect(stored(fake, 'sections').version).toBe(sectionsVersion);
    expect(stored(fake, 'theme').version).toBeGreaterThan(1);
  });

  it('publish promotes the draft; published preserves history and theme', async () => {
    const { writer, reader } = setup();
    await writer.push(sampleCatalog(), 't1');
    expect(await writer.publish('t2')).toEqual({ appVersion: 1, publishedAt: 't2' });
    const live = await reader.catalog(false);
    expect(live.components.has('hero')).toBe(true);
    expect(live.dataSources.get('products-by-category')?.resolver?.kind).toBe('products-by-category');
    expect(live.theme).toEqual({ containerMaxWidth: '70rem' });
  });

  it('publish before any push returns null', async () => {
    expect(await setup().writer.publish()).toBeNull();
  });

  it('retries a version conflict from a concurrent writer', async () => {
    const { writer, fake, store } = setup();
    await writer.push(sampleCatalog(), 't1');
    const realPut = store.put.bind(store);
    let raced = false;
    // Another writer lands between our read and our write, exactly once.
    store.put = (async (container: string, key: string, value: unknown, version?: number) => {
      if (!raced && key === 'components') {
        raced = true;
        fake.put(container, key, fake.get(container, key));
      }
      return realPut(container, key, value, version);
    }) as typeof store.put;
    const next = sampleCatalog();
    next.components.components[0]!.description = { 'en-US': 'changed' };
    expect(await writer.push(next, 't2')).toMatchObject({ status: 'written' });
    expect(raced).toBe(true);
  });

  it('gives up after repeated conflicts', async () => {
    const { writer, fake, store } = setup();
    await writer.push(sampleCatalog(), 't1');
    const realPut = store.put.bind(store);
    store.put = (async (container: string, key: string, value: unknown, version?: number) => {
      fake.put(container, key, fake.get(container, key));
      return realPut(container, key, value, version);
    }) as typeof store.put;
    const next = sampleCatalog();
    next.sections.sections[0]!.icon = 'Star';
    await expect(writer.push(next, 't2')).rejects.toThrow();
  });

  describe('read', () => {
    it('returns the draft head and the published catalog with metadata stripped', async () => {
      const { writer } = setup();
      expect(await writer.read('draft')).toBeNull();
      await writer.push(sampleCatalog(), 't1');
      const draft = await writer.read('draft');
      expect(draft).toMatchObject({ state: 'draft', appVersion: 1, savedAt: 't1', publishedAt: null });
      expect(draft!.sourceHash).toBeTruthy();
      expect(draft!.catalog).toEqual(sampleCatalog());
      expect(await writer.read('published')).toBeNull();

      await writer.publish('t2');
      const live = await writer.read('published');
      expect(live).toMatchObject({ state: 'published', appVersion: 1, publishedAt: 't2' });
      expect(live!.catalog).toEqual(sampleCatalog());
    });

    it('omits an empty theme', async () => {
      const { writer } = setup();
      const c = sampleCatalog();
      delete c.theme;
      await writer.push(c, 't1');
      expect((await writer.read('draft'))!.catalog).not.toHaveProperty('theme');
      expect(partsOf(c).theme).toEqual({ theme: {} });
    });
  });
});
