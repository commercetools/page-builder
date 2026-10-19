import { beforeEach, describe, expect, it } from 'vitest';
import { PAGE_CONTAINER, createPageStore, pageKey } from './page-store.js';
import {
  DRAFT_PAGE_CONTAINER,
  LEGACY_PAGE_CONTAINER,
  PUBLISHED_PAGE_CONTAINER,
} from './contract.js';
import { createFakeCt, type FakeCt } from './test-utils/fake-ct.js';
import {
  buildCombinedComponent,
  buildComponentDraftVersion,
  buildComponentRef,
  buildLayoutElement,
  buildPage,
  buildPublishedPayload,
  buildRefLayoutElement,
  buildRefPage,
  localized,
  resetIds,
} from './test-utils/factories.js';

let ct: FakeCt;
beforeEach(() => {
  ct = createFakeCt();
  resetIds();
});

const store = (withComponents = true) =>
  createPageStore({
    getCustomObjectValue: ct.read,
    ...(withComponents ? { getComponentsByIds: ct.readComponentsByIds } : {}),
  });

const draftEnvelope = (page: unknown, over: Record<string, unknown> = {}) => ({
  schemaVersion: 3,
  draft: {
    schemaVersion: 3,
    currentVersion: 1,
    pageId: 'home',
    versions: [
      { appVersion: 2, savedAt: 'x', publishedAt: null, page },
    ],
  },
  ...over,
});

describe('pageKey', () => {
  it('prefixes the page id', () => {
    expect(pageKey('home')).toBe('page-home');
  });
});

describe('PAGE_CONTAINER', () => {
  it('still points hosts at the published container', () => {
    expect(PAGE_CONTAINER).toBe(PUBLISHED_PAGE_CONTAINER);
  });
});

describe('loadPage — storefront (published)', () => {
  it('reads the self-contained published snapshot in a single call', async () => {
    ct.set(PUBLISHED_PAGE_CONTAINER, 'page-home', buildPublishedPayload({ appVersion: 4 }));

    const payload = await store().loadPage('home', { preview: false });

    expect(payload?.appVersion).toBe(4);
    // The hot path must not touch the draft or component containers.
    expect(ct.readCalls).toEqual([
      { container: PUBLISHED_PAGE_CONTAINER, key: 'page-home' },
    ]);
    expect(ct.componentReadCalls).toEqual([]);
  });

  it('stamps the requested page id onto the payload', async () => {
    ct.set(PUBLISHED_PAGE_CONTAINER, 'page-about', buildPublishedPayload({ pageId: 'wrong' }));
    const payload = await store().loadPage('about', { preview: false });
    expect(payload?.pageId).toBe('about');
  });

  it('carries the page-type hint through when present', async () => {
    ct.set(PUBLISHED_PAGE_CONTAINER, 'page-home', {
      ...buildPublishedPayload(),
      pageType: 'category',
    });
    expect((await store().loadPage('home', { preview: false }))?.pageType).toBe(
      'category'
    );
  });

  it('defaults the envelope fields a partial snapshot omits', async () => {
    ct.set(PUBLISHED_PAGE_CONTAINER, 'page-home', { page: buildPage() });
    const payload = await store().loadPage('home', { preview: false });
    expect(payload).toMatchObject({
      schemaVersion: 3,
      appVersion: 1,
      publishedAt: '',
    });
  });

  it('falls back to the legacy container for an unmigrated page', async () => {
    ct.set(LEGACY_PAGE_CONTAINER, 'page-home', {
      draft: null,
      published: buildPublishedPayload({ appVersion: 7 }),
    });

    const payload = await store().loadPage('home', { preview: false });
    expect(payload?.appVersion).toBe(7);
  });

  it('reads the legacy seed shape, preferring the newest published version', async () => {
    ct.set(LEGACY_PAGE_CONTAINER, 'page-home', {
      versions: [
        { v: 1, savedAt: '2026-01-01', published: true, state: { MAIN: [] } },
        {
          v: 3,
          savedAt: '2026-03-01',
          published: true,
          state: {
            MAIN: [{ id: 'l1', width: '1/2', children: [{ id: 'c1', componentType: 'hero' }] }],
          },
        },
        { v: 4, savedAt: '2026-04-01', published: false, state: { MAIN: [] } },
      ],
    });

    const payload = await store().loadPage('home', { preview: false });
    expect(payload?.appVersion).toBe(3);
    expect(payload?.page.MAIN[0].id).toBe('l1');
    expect(payload?.page.MAIN[0].children[0].type).toBe('hero');
  });

  it('falls back to the first version when the legacy seed has none published', async () => {
    ct.set(LEGACY_PAGE_CONTAINER, 'page-home', {
      versions: [{ v: 9, savedAt: '2026-01-01', state: { MAIN: [] } }],
    });
    expect((await store().loadPage('home', { preview: false }))?.appVersion).toBe(9);
  });

  it('fills in defaults for a sparse legacy element', async () => {
    ct.set(LEGACY_PAGE_CONTAINER, 'page-home', {
      versions: [
        {
          published: true,
          state: { MAIN: [{ id: 'l1', children: [{ id: 'c1', componentType: 'hero' }] }] },
        },
      ],
    });

    const element = (await store().loadPage('home', { preview: false }))!.page.MAIN[0];
    expect(element.width).toBe('1/1');
    expect(element.visibility).toEqual({ mobile: true, tablet: true, desktop: true });
    expect(element.children[0].settings).toEqual({});
  });

  it('returns nothing when the page exists nowhere', async () => {
    expect(await store().loadPage('ghost', { preview: false })).toBeNull();
  });

  it('ignores a published object that is actually a draft envelope', async () => {
    ct.set(PUBLISHED_PAGE_CONTAINER, 'page-home', draftEnvelope(buildRefPage()));
    expect(await store().loadPage('home', { preview: false })).toBeNull();
  });

  it('ignores a published object with no page', async () => {
    ct.set(PUBLISHED_PAGE_CONTAINER, 'page-home', { schemaVersion: 3 });
    expect(await store().loadPage('home', { preview: false })).toBeNull();
  });
});

describe('loadPage — preview (draft hydration)', () => {
  const seedComponent = (coId: string, componentId: string, over = {}) =>
    ct.setComponentById(
      coId,
      buildCombinedComponent({
        type: 'content/hero',
        draft: {
          schemaVersion: 3,
          currentVersion: 1,
          componentId,
          versions: [
            buildComponentDraftVersion({
              name: localized('Hero'),
              settings: { title: 'Draft copy' },
            }),
          ],
        },
        ...over,
      })
    );

  it('hydrates component references back into an inline page', async () => {
    seedComponent('co-1', 'c1');
    ct.set(
      DRAFT_PAGE_CONTAINER,
      'page-home',
      draftEnvelope(
        buildRefPage({
          MAIN: [buildRefLayoutElement({ children: [buildComponentRef({ id: 'co-1' })] })],
        })
      )
    );

    const payload = await store().loadPage('home', { preview: true });
    const child = payload!.page.MAIN[0].children[0];

    expect(child.id).toBe('c1');
    expect(child.type).toBe('content/hero');
    expect(child.settings).toEqual({ title: 'Draft copy' });
    expect(payload?.appVersion).toBe(2);
  });

  it('batches the component reads into one call', async () => {
    seedComponent('co-1', 'c1');
    seedComponent('co-2', 'c2');
    ct.set(
      DRAFT_PAGE_CONTAINER,
      'page-home',
      draftEnvelope(
        buildRefPage({
          MAIN: [
            buildRefLayoutElement({
              children: [buildComponentRef({ id: 'co-1' }), buildComponentRef({ id: 'co-2' })],
            }),
          ],
        })
      )
    );

    await store().loadPage('home', { preview: true });
    expect(ct.componentReadCalls).toEqual([['co-1', 'co-2']]);
  });

  it('collects references across every section', async () => {
    seedComponent('co-head', 'ch');
    seedComponent('co-foot', 'cf');
    ct.set(
      DRAFT_PAGE_CONTAINER,
      'page-home',
      draftEnvelope(
        buildRefPage({
          HEAD: [buildRefLayoutElement({ children: [buildComponentRef({ id: 'co-head' })] })],
          MAIN: [],
          FOOTER: [buildRefLayoutElement({ children: [buildComponentRef({ id: 'co-foot' })] })],
        })
      )
    );

    const payload = await store().loadPage('home', { preview: true });
    expect(payload!.page.HEAD[0].children[0].id).toBe('ch');
    expect(payload!.page.FOOTER[0].children[0].id).toBe('cf');
  });

  it('skips a reference whose component object is gone, rather than breaking the page', async () => {
    seedComponent('co-1', 'c1');
    ct.set(
      DRAFT_PAGE_CONTAINER,
      'page-home',
      draftEnvelope(
        buildRefPage({
          MAIN: [
            buildRefLayoutElement({
              children: [
                buildComponentRef({ id: 'co-1' }),
                buildComponentRef({ id: 'co-deleted' }),
              ],
            }),
          ],
        })
      )
    );

    const payload = await store().loadPage('home', { preview: true });
    expect(payload!.page.MAIN[0].children).toHaveLength(1);
  });

  it('skips a component object with no draft versions', async () => {
    ct.setComponentById('co-1', {
      schemaVersion: 3,
      type: 'content/hero',
      pageId: 'home',
      draft: { schemaVersion: 3, currentVersion: 0, componentId: 'c1', versions: [] },
    });
    ct.set(
      DRAFT_PAGE_CONTAINER,
      'page-home',
      draftEnvelope(
        buildRefPage({
          MAIN: [buildRefLayoutElement({ children: [buildComponentRef({ id: 'co-1' })] })],
        })
      )
    );

    const payload = await store().loadPage('home', { preview: true });
    expect(payload!.page.MAIN[0].children).toEqual([]);
  });

  it('reads no components at all for a draft with no references', async () => {
    ct.set(
      DRAFT_PAGE_CONTAINER,
      'page-home',
      draftEnvelope(buildRefPage({ MAIN: [buildRefLayoutElement({ children: [] })] }))
    );

    const payload = await store().loadPage('home', { preview: true });
    expect(payload!.page.MAIN[0].children).toEqual([]);
    expect(ct.componentReadCalls).toEqual([]);
  });

  it('falls back to published when it cannot hydrate references at all', async () => {
    // No `getComponentsByIds` injected — rendering refs as-is would be worse than
    // showing the last published page.
    ct.set(
      DRAFT_PAGE_CONTAINER,
      'page-home',
      draftEnvelope(
        buildRefPage({
          MAIN: [buildRefLayoutElement({ children: [buildComponentRef({ id: 'co-1' })] })],
        })
      )
    );
    ct.set(PUBLISHED_PAGE_CONTAINER, 'page-home', buildPublishedPayload({ appVersion: 9 }));

    const payload = await store(false).loadPage('home', { preview: true });
    expect(payload?.appVersion).toBe(9);
  });

  it('falls back to the legacy draft before the published snapshot', async () => {
    ct.set(LEGACY_PAGE_CONTAINER, 'page-home', {
      draft: {
        schemaVersion: 2,
        currentVersion: 1,
        pageId: 'home',
        versions: [{ appVersion: 5, savedAt: 'x', publishedAt: null, page: buildPage() }],
      },
      published: buildPublishedPayload({ appVersion: 1 }),
    });

    const payload = await store().loadPage('home', { preview: true });
    expect(payload?.appVersion).toBe(5);
  });

  it('falls back to published when nothing else is renderable', async () => {
    ct.set(PUBLISHED_PAGE_CONTAINER, 'page-home', buildPublishedPayload({ appVersion: 3 }));
    const payload = await store().loadPage('home', { preview: true });
    expect(payload?.appVersion).toBe(3);
  });

  it('returns nothing when the page exists nowhere', async () => {
    expect(await store().loadPage('ghost', { preview: true })).toBeNull();
  });

  it('ignores a draft envelope with no versions', async () => {
    ct.set(DRAFT_PAGE_CONTAINER, 'page-home', {
      schemaVersion: 3,
      draft: { schemaVersion: 3, currentVersion: 0, pageId: 'home', versions: [] },
    });
    expect(await store().loadPage('home', { preview: true })).toBeNull();
  });

  it('ignores a draft head with no page', async () => {
    ct.set(DRAFT_PAGE_CONTAINER, 'page-home', draftEnvelope(null));
    expect(await store().loadPage('home', { preview: true })).toBeNull();
  });

  it('carries the page-type hint from the draft envelope', async () => {
    ct.set(
      DRAFT_PAGE_CONTAINER,
      'page-home',
      draftEnvelope(buildRefPage({ MAIN: [] }), { pageType: 'pdp' })
    );
    expect((await store().loadPage('home', { preview: true }))?.pageType).toBe('pdp');
  });
});
