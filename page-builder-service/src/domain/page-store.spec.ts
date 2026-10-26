import { describe, expect, it } from 'vitest';
import { harness } from '../testing/fixtures.js';
import { createPageStore, pickPage } from './page-store.js';
import {
  COMPONENTS_CONTAINER,
  DRAFT_PAGE_CONTAINER,
  LEGACY_PAGE_CONTAINER,
  PUBLISHED_PAGE_CONTAINER,
  pageKey,
  type PageEditorPage,
  type PagePublishedPayload,
} from './types.js';

const vis = { mobile: true, tablet: true, desktop: true };
const el = (id: string, children: unknown[]) => ({ id, kind: 'layout', width: '1/1', name: {}, visibility: vis, children });
const inlineComponent = (id: string, type = 'content/hero', settings: Record<string, unknown> = {}) => ({
  id,
  type,
  name: {},
  visibility: vis,
  settings,
});
const page = (children: unknown[] = [inlineComponent('c1')]): PageEditorPage =>
  ({ HEAD: [], MAIN: [el('main-1', children)], FOOTER: [] }) as unknown as PageEditorPage;

function setup() {
  const h = harness({ seed: false });
  return { ...h, pages: createPageStore(h.store) };
}

const published = (p: PageEditorPage, extra: Record<string, unknown> = {}) => ({
  schemaVersion: 3,
  pageId: 'x',
  appVersion: 4,
  publishedAt: '2026-01-02T00:00:00.000Z',
  page: p,
  ...extra,
});

describe('createPageStore — published', () => {
  it('reads the self-contained published snapshot, carrying the page type', async () => {
    const { fake, pages } = setup();
    fake.put(PUBLISHED_PAGE_CONTAINER, pageKey('home'), published(page(), { pageType: 'static' }));
    const payload = await pages.loadPage('home', { preview: false });
    expect(payload).toMatchObject({ pageId: 'home', appVersion: 4, schemaVersion: 3, pageType: 'static', publishedAt: '2026-01-02T00:00:00.000Z' });
    expect(payload?.page.MAIN[0].children[0].id).toBe('c1');
  });

  it('defaults version fields when the snapshot omits them', async () => {
    const { fake, pages } = setup();
    fake.put(PUBLISHED_PAGE_CONTAINER, pageKey('bare'), { page: page() });
    expect(await pages.loadPage('bare', { preview: false })).toMatchObject({ schemaVersion: 3, appVersion: 1, publishedAt: '' });
  });

  it('caches published reads', async () => {
    const { fake, pages } = setup();
    fake.put(PUBLISHED_PAGE_CONTAINER, pageKey('home'), published(page()));
    await pages.loadPage('home', { preview: false });
    await pages.loadPage('home', { preview: false });
    expect(fake.calls.filter((c) => c.path.includes('/page-home'))).toHaveLength(1);
  });

  it('returns null when nothing exists', async () => {
    const { pages } = setup();
    expect(await pages.loadPage('missing', { preview: false })).toBeNull();
  });

  it('rejects a draft-shaped object in the published container and falls back to legacy', async () => {
    const { fake, pages } = setup();
    fake.put(PUBLISHED_PAGE_CONTAINER, pageKey('p'), { draft: {}, page: page() });
    fake.put(LEGACY_PAGE_CONTAINER, pageKey('p'), { draft: { versions: [] }, published: published(page([inlineComponent('legacy')])) });
    const payload = await pages.loadPage('p', { preview: false });
    expect(payload?.page.MAIN[0].children[0].id).toBe('legacy');
  });

  it('rejects non-object and page-less published values', async () => {
    const { fake, pages } = setup();
    fake.put(PUBLISHED_PAGE_CONTAINER, pageKey('a'), 'string');
    fake.put(PUBLISHED_PAGE_CONTAINER, pageKey('b'), { page: 'nope' });
    expect(await pages.loadPage('a', { preview: false })).toBeNull();
    expect(await pages.loadPage('b', { preview: false })).toBeNull();
  });

  describe('legacy fallbacks', () => {
    it('reads the legacy seed shape, preferring the newest published version', async () => {
      const { fake, pages } = setup();
      fake.put(LEGACY_PAGE_CONTAINER, pageKey('seeded'), {
        versions: [
          { v: 1, savedAt: '2026-01-01', published: true, state: { MAIN: [{ id: 'old', children: [] }] } },
          {
            v: 2,
            savedAt: '2026-02-01',
            published: true,
            state: {
              MAIN: [
                {
                  id: 'new',
                  width: '1/2',
                  backgroundStyle: 'dark',
                  children: [{ id: 'k', componentType: 'content/hero', settings: { a: 1 } }],
                },
              ],
            },
          },
          { v: 3, savedAt: '2026-03-01', published: false, state: { MAIN: [] } },
        ],
      });
      const payload = await pages.loadPage('seeded', { preview: false });
      expect(payload).toMatchObject({ schemaVersion: 2, appVersion: 2, publishedAt: '2026-02-01' });
      expect(payload?.page.MAIN[0]).toMatchObject({
        id: 'new',
        width: '1/2',
        style: 'dark',
        visibility: vis,
        children: [{ id: 'k', type: 'content/hero', settings: { a: 1 }, visibility: vis }],
      });
    });

    it('falls back to the first version when none is published, with defaults', async () => {
      const { fake, pages } = setup();
      fake.put(LEGACY_PAGE_CONTAINER, pageKey('seeded'), { versions: [{ state: { MAIN: [{ id: 'e' }] } }] });
      const payload = await pages.loadPage('seeded', { preview: false });
      expect(payload).toMatchObject({ appVersion: 1, publishedAt: '' });
      expect(payload?.page.MAIN[0]).toMatchObject({ width: '1/1', name: {}, children: [] });
    });

    it('returns null for a legacy value of an unknown shape', async () => {
      const { fake, pages } = setup();
      fake.put(LEGACY_PAGE_CONTAINER, pageKey('weird'), { something: true });
      fake.put(LEGACY_PAGE_CONTAINER, pageKey('empty'), { versions: [] });
      expect(await pages.loadPage('weird', { preview: false })).toBeNull();
      expect(await pages.loadPage('empty', { preview: false })).toBeNull();
    });

    it('carries the page type of a legacy combined object', async () => {
      const { fake, pages } = setup();
      fake.put(LEGACY_PAGE_CONTAINER, pageKey('t'), { pageType: 'category', draft: {}, published: published(page()) });
      expect((await pages.loadPage('t', { preview: false }))?.pageType).toBe('category');
    });
  });
});

describe('createPageStore — preview', () => {
  const component = (id: string, type: string, settings: Record<string, unknown>) =>
    fakeComponent(id, type, settings);

  function fakeComponent(componentId: string, type: string, settings: Record<string, unknown>) {
    return {
      schemaVersion: 3,
      type,
      pageId: 'home',
      draft: {
        schemaVersion: 3,
        currentVersion: 2,
        componentId,
        versions: [
          { appVersion: 1, savedAt: 'a', publishedAt: null, name: {}, visibility: vis, settings: { old: true } },
          { appVersion: 2, savedAt: 'b', publishedAt: null, name: { 'en-US': 'Head' }, visibility: vis, settings },
        ],
      },
    };
  }

  const draftPage = (refs: Array<{ typeId: string; id: string }>, extra: Record<string, unknown> = {}) => ({
    schemaVersion: 3,
    pageId: 'home',
    publishedAt: null,
    draft: {
      currentVersion: 2,
      versions: [
        { appVersion: 1, savedAt: 'a', publishedAt: null, page: { HEAD: [], MAIN: [], FOOTER: [] } },
        {
          appVersion: 2,
          savedAt: 'b',
          publishedAt: null,
          page: { HEAD: [], MAIN: [el('main-1', refs)], FOOTER: [] },
        },
      ],
    },
    ...extra,
  });

  it('hydrates the draft head from component objects, using each component head version', async () => {
    const { fake, pages } = setup();
    const c1 = fake.put(COMPONENTS_CONTAINER, 'component-1', component('c-one', 'content/hero', { title: 'Hello' }));
    const c2 = fake.put(COMPONENTS_CONTAINER, 'component-2', component('c-two', 'content/message', { n: 2 }));
    fake.put(
      DRAFT_PAGE_CONTAINER,
      pageKey('home'),
      draftPage(
        [
          { typeId: 'key-value-document', id: c1.id },
          { typeId: 'key-value-document', id: c2.id },
        ],
        { pageType: 'static' }
      )
    );
    const payload = await pages.loadPage('home', { preview: true });
    expect(payload).toMatchObject({ appVersion: 2, pageType: 'static', publishedAt: '' });
    expect(payload?.page.MAIN[0].children).toEqual([
      { id: 'c-one', type: 'content/hero', name: { 'en-US': 'Head' }, visibility: vis, settings: { title: 'Hello' } },
      { id: 'c-two', type: 'content/message', name: { 'en-US': 'Head' }, visibility: vis, settings: { n: 2 } },
    ]);
  });

  it('skips a component whose object is missing instead of failing the page', async () => {
    const { fake, pages } = setup();
    const c1 = fake.put(COMPONENTS_CONTAINER, 'component-1', component('c-one', 'content/hero', {}));
    fake.put(
      DRAFT_PAGE_CONTAINER,
      pageKey('home'),
      draftPage([
        { typeId: 'key-value-document', id: 'does-not-exist' },
        { typeId: 'key-value-document', id: c1.id },
        { typeId: 'key-value-document' } as never,
      ])
    );
    const payload = await pages.loadPage('home', { preview: true });
    expect(payload?.page.MAIN[0].children.map((c) => c.id)).toEqual(['c-one']);
  });

  it('skips a component with no versions', async () => {
    const { fake, pages } = setup();
    const empty = fake.put(COMPONENTS_CONTAINER, 'component-e', { type: 't', draft: { componentId: 'e', versions: [] } });
    fake.put(DRAFT_PAGE_CONTAINER, pageKey('home'), draftPage([{ typeId: 'key-value-document', id: empty.id }]));
    expect((await pages.loadPage('home', { preview: true }))?.page.MAIN[0].children).toEqual([]);
  });

  it('hydrates a draft with no references without reading components', async () => {
    const { fake, pages } = setup();
    fake.put(DRAFT_PAGE_CONTAINER, pageKey('home'), draftPage([]));
    await pages.loadPage('home', { preview: true });
    expect(fake.calls.some((c) => c.path.includes(COMPONENTS_CONTAINER))).toBe(false);
  });

  it('always reads fresh in preview, even when published was cached', async () => {
    const { fake, pages } = setup();
    fake.put(PUBLISHED_PAGE_CONTAINER, pageKey('home'), published(page()));
    fake.put(DRAFT_PAGE_CONTAINER, pageKey('home'), draftPage([]));
    await pages.loadPage('home', { preview: false });
    await pages.loadPage('home', { preview: true });
    await pages.loadPage('home', { preview: true });
    expect(fake.calls.filter((c) => c.path.includes(`/${DRAFT_PAGE_CONTAINER}/`))).toHaveLength(2);
  });

  it('falls back to a legacy draft, then to published', async () => {
    const { fake, pages } = setup();
    fake.put(LEGACY_PAGE_CONTAINER, pageKey('l'), {
      draft: { schemaVersion: 2, currentVersion: 1, pageId: 'l', versions: [{ appVersion: 1, savedAt: 'a', publishedAt: null, page: page([inlineComponent('from-legacy-draft')]) }] },
      published: published(page([inlineComponent('from-legacy-pub')])),
    });
    expect((await pages.loadPage('l', { preview: true }))?.page.MAIN[0].children[0].id).toBe('from-legacy-draft');

    fake.put(PUBLISHED_PAGE_CONTAINER, pageKey('only'), published(page([inlineComponent('pub')])));
    expect((await pages.loadPage('only', { preview: true }))?.page.MAIN[0].children[0].id).toBe('pub');
    expect(await pages.loadPage('nothing', { preview: true })).toBeNull();
  });

  it.each([
    ['not an object', 'str'],
    ['no draft', {}],
    ['no versions', { draft: { versions: [] } }],
    ['head without page', { draft: { versions: [{ appVersion: 1 }] } }],
  ])('treats a draft with %s as unrenderable and falls through', async (_n, value) => {
    const { fake, pages } = setup();
    fake.put(DRAFT_PAGE_CONTAINER, pageKey('bad'), value);
    expect(await pages.loadPage('bad', { preview: true })).toBeNull();
  });

  it('defaults head fields when the draft head omits them', async () => {
    const { fake, pages } = setup();
    fake.put(DRAFT_PAGE_CONTAINER, pageKey('d'), { draft: { versions: [{ page: { HEAD: [], MAIN: [], FOOTER: [] } }] } });
    expect(await pages.loadPage('d', { preview: true })).toMatchObject({ appVersion: 1, publishedAt: '', schemaVersion: 3 });
  });
});

describe('pickPage', () => {
  const pub = published(page([inlineComponent('pub')])) as unknown as PagePublishedPayload;
  const draftHistory = {
    schemaVersion: 2,
    currentVersion: 2,
    pageId: 'x',
    versions: [
      { appVersion: 1, savedAt: 'a', publishedAt: null, page: page([inlineComponent('v1')]) },
      { appVersion: 2, savedAt: 'b', publishedAt: 'pub-at', page: page([inlineComponent('v2')]) },
    ],
  };

  it('returns null for no object', () => {
    expect(pickPage(null, true)).toBeNull();
    expect(pickPage(undefined, false)).toBeNull();
  });

  it('picks the last draft version in preview', () => {
    const picked = pickPage({ draft: draftHistory as never, published: pub }, true);
    expect(picked).toMatchObject({ appVersion: 2, publishedAt: 'pub-at', pageId: 'x' });
    expect(picked?.page.MAIN[0].children[0].id).toBe('v2');
  });

  it('defaults publishedAt for an unpublished draft head', () => {
    const history = { ...draftHistory, versions: [draftHistory.versions[0]] };
    expect(pickPage({ draft: history as never, published: null }, true)?.publishedAt).toBe('');
  });

  it('accepts a plain payload as the draft', () => {
    expect(pickPage({ draft: pub, published: null }, true)).toBe(pub);
  });

  it('falls back to published when the draft is unrenderable, and in non-preview', () => {
    expect(pickPage({ draft: {} as never, published: pub }, true)).toBe(pub);
    expect(pickPage({ draft: draftHistory as never, published: pub }, false)).toBe(pub);
    expect(pickPage({ draft: draftHistory as never, published: null }, false)).toBeNull();
  });
});
