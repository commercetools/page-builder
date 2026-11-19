/**
 * Read paths of the page connector: the draft fetcher (v3 + forced-migration
 * legacy fallback), the published fetcher, and the built-page listing.
 * The write paths live in `mutations.spec.ts`.
 */
import {
  useBuiltPageIds,
  usePageDraftFetcher,
  usePagePublishedFetcher,
} from './use-page-builder-connector';
import {
  COMPONENTS_CONTAINER,
  DRAFT_PAGE_CONTAINER,
  LEGACY_PAGE_CONTAINER,
  PUBLISHED_PAGE_CONTAINER,
  componentKey,
  pageKey,
} from '../../components/page-builder/types';
import { renderHookWithProviders, waitFor } from '../../test-utils/render';
import { installMockServer } from '../../test-utils/msw';
import {
  buildCombinedComponent,
  buildComponentDraftVersion,
  buildComponentRef,
  buildDraftPagePayload,
  buildDraftPageVersion,
  buildPage,
  buildPublishedPagePayload,
  buildRefLayoutElement,
  buildRefPage,
  localized,
} from '../../test-utils/factories';

const store = installMockServer();

const seedDraft = (pageId: string, value: unknown) =>
  store.seed({
    container: DRAFT_PAGE_CONTAINER,
    key: pageKey(pageId),
    value,
  })[0];
const seedPublished = (pageId: string, value: unknown) =>
  store.seed({
    container: PUBLISHED_PAGE_CONTAINER,
    key: pageKey(pageId),
    value,
  })[0];
const seedLegacy = (pageId: string, value: unknown) =>
  store.seed({
    container: LEGACY_PAGE_CONTAINER,
    key: pageKey(pageId),
    value,
  })[0];

const legacyPayload = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  pageType: 'static',
  title: 'Legacy home',
  path: '/',
  draft: {
    schemaVersion: 2,
    currentVersion: 1,
    pageId: 'home',
    versions: [
      {
        appVersion: 1,
        savedAt: '2026-01-15T10:00:00.000Z',
        publishedAt: null,
        page: buildPage(),
      },
    ],
  },
  published: null,
  ...over,
});

describe('usePageDraftFetcher — v3 draft', () => {
  it('reports nothing for a page that does not exist yet', async () => {
    const { result } = renderHookWithProviders(() =>
      usePageDraftFetcher('new')
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.current).toBeNull();
    expect(result.current.history).toBeNull();
    expect(result.current.needsMigration).toBe(false);
    expect(result.current.ctVersion).toBeNull();
  });

  it('reads the draft head, its metadata and the CT version', async () => {
    const stored = seedDraft(
      'home',
      buildDraftPagePayload({ title: 'Home', path: '/', pageType: 'static' })
    );

    const { result } = renderHookWithProviders(() =>
      usePageDraftFetcher('home')
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.title).toBe('Home');
    expect(result.current.path).toBe('/');
    expect(result.current.pageType).toBe('static');
    expect(result.current.ctVersion).toBe(stored.version);
    expect(result.current.needsMigration).toBe(false);
    expect(result.current.current?.appVersion).toBe(1);
  });

  it('reads the latest version, not the first', async () => {
    seedDraft(
      'home',
      buildDraftPagePayload({
        draft: {
          schemaVersion: 3,
          currentVersion: 2,
          pageId: 'home',
          versions: [
            buildDraftPageVersion({ appVersion: 1 }),
            buildDraftPageVersion({
              appVersion: 2,
              publishedAt: '2026-02-01T00:00:00.000Z',
            }),
          ],
        },
      })
    );

    const { result } = renderHookWithProviders(() =>
      usePageDraftFetcher('home')
    );
    await waitFor(() => expect(result.current.current?.appVersion).toBe(2));
    expect(result.current.current?.publishedAt).toBe(
      '2026-02-01T00:00:00.000Z'
    );
  });

  it('inlines referenced components back into the page the builder edits', async () => {
    const componentObject = store.seed({
      container: COMPONENTS_CONTAINER,
      key: componentKey('c1'),
      value: buildCombinedComponent({
        type: 'content/hero',
        draft: {
          schemaVersion: 3,
          currentVersion: 1,
          componentId: 'c1',
          versions: [
            buildComponentDraftVersion({
              name: localized('Inlined hero'),
              settings: { title: 'Welcome' },
            }),
          ],
        },
      }),
    })[0];

    seedDraft(
      'home',
      buildDraftPagePayload({
        draft: {
          schemaVersion: 3,
          currentVersion: 1,
          pageId: 'home',
          versions: [
            buildDraftPageVersion({
              page: buildRefPage({
                MAIN: [
                  buildRefLayoutElement({
                    children: [buildComponentRef({ id: componentObject.id })],
                  }),
                ],
              }),
            }),
          ],
        },
      })
    );

    const { result } = renderHookWithProviders(() =>
      usePageDraftFetcher('home')
    );
    await waitFor(() =>
      expect(result.current.current?.page.MAIN?.[0]?.children).toHaveLength(1)
    );

    const child = result.current.current!.page.MAIN[0].children[0];
    expect(child.type).toBe('content/hero');
    expect(child.settings).toEqual({ title: 'Welcome' });
    expect(child.name).toEqual(localized('Inlined hero'));
  });

  it('surfaces the published snapshot alongside the draft', async () => {
    seedDraft('home', buildDraftPagePayload());
    seedPublished('home', buildPublishedPagePayload({ appVersion: 7 }));

    const { result } = renderHookWithProviders(() =>
      usePageDraftFetcher('home')
    );
    await waitFor(() => expect(result.current.currentPublished).not.toBeNull());
    expect(result.current.currentPublished?.appVersion).toBe(7);
  });
});

describe('usePageDraftFetcher — legacy fallback', () => {
  it('flags a pre-v3 page for forced migration and hands over the raw object', async () => {
    const stored = seedLegacy('home', legacyPayload());

    const { result } = renderHookWithProviders(() =>
      usePageDraftFetcher('home')
    );
    await waitFor(() => expect(result.current.needsMigration).toBe(true));

    expect(result.current.legacy?.ctVersion).toBe(stored.version);
    expect(result.current.legacy?.value.schemaVersion).toBe(2);
    expect(result.current.title).toBe('Legacy home');
  });

  it('still surfaces the legacy content so the page is not blank', async () => {
    seedLegacy('home', legacyPayload());

    const { result } = renderHookWithProviders(() =>
      usePageDraftFetcher('home')
    );
    await waitFor(() => expect(result.current.current).not.toBeNull());
    expect(result.current.current?.appVersion).toBe(1);
  });

  it('converts a legacy published block into the v3 published shape', async () => {
    seedLegacy(
      'home',
      legacyPayload({
        published: {
          schemaVersion: 2,
          appVersion: 3,
          publishedAt: '2026-01-01T00:00:00.000Z',
          pageId: 'home',
          page: buildPage(),
        },
      })
    );

    const { result } = renderHookWithProviders(() =>
      usePageDraftFetcher('home')
    );
    await waitFor(() => expect(result.current.currentPublished).not.toBeNull());
    expect(result.current.currentPublished?.appVersion).toBe(3);
  });

  it('copes with a legacy object that has no draft versions', async () => {
    seedLegacy(
      'home',
      legacyPayload({
        draft: {
          schemaVersion: 2,
          currentVersion: 0,
          pageId: 'home',
          versions: [],
        },
      })
    );

    const { result } = renderHookWithProviders(() =>
      usePageDraftFetcher('home')
    );
    await waitFor(() => expect(result.current.needsMigration).toBe(true));
    expect(result.current.current).toBeNull();
  });

  it('ignores the legacy object once a v3 draft exists', async () => {
    seedLegacy('home', legacyPayload({ title: 'Legacy title' }));
    seedDraft('home', buildDraftPagePayload({ title: 'Migrated title' }));

    const { result } = renderHookWithProviders(() =>
      usePageDraftFetcher('home')
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.title).toBe('Migrated title');
    expect(result.current.needsMigration).toBe(false);
  });
});

describe('usePagePublishedFetcher', () => {
  it('reads the self-contained published snapshot', async () => {
    const stored = seedPublished(
      'home',
      buildPublishedPagePayload({ appVersion: 4 })
    );

    const { result } = renderHookWithProviders(() =>
      usePagePublishedFetcher('home')
    );
    await waitFor(() => expect(result.current.payload).not.toBeNull());

    expect(result.current.payload?.appVersion).toBe(4);
    expect(result.current.ctVersion).toBe(stored.version);
  });

  it('reports nothing for a page that was never published', async () => {
    const { result } = renderHookWithProviders(() =>
      usePagePublishedFetcher('home')
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.payload).toBeNull();
  });

  it('falls back to the legacy published block', async () => {
    seedLegacy(
      'home',
      legacyPayload({
        published: {
          schemaVersion: 2,
          appVersion: 9,
          publishedAt: '2026-01-01T00:00:00.000Z',
          pageId: 'home',
          page: buildPage(),
        },
      })
    );

    const { result } = renderHookWithProviders(() =>
      usePagePublishedFetcher('home')
    );
    await waitFor(() => expect(result.current.payload).not.toBeNull());

    expect(result.current.payload?.appVersion).toBe(9);
    // No CT version for a legacy-derived payload — it is not the object we would write.
    expect(result.current.ctVersion).toBeNull();
  });

  it('prefers the v3 snapshot over the legacy block', async () => {
    seedPublished('home', buildPublishedPagePayload({ appVersion: 4 }));
    seedLegacy(
      'home',
      legacyPayload({
        published: {
          schemaVersion: 2,
          appVersion: 9,
          publishedAt: '2026-01-01T00:00:00.000Z',
          pageId: 'home',
          page: buildPage(),
        },
      })
    );

    const { result } = renderHookWithProviders(() =>
      usePagePublishedFetcher('home')
    );
    await waitFor(() => expect(result.current.payload?.appVersion).toBe(4));
  });
});

describe('useBuiltPageIds', () => {
  it('reports nothing when no pages exist', async () => {
    const { result } = renderHookWithProviders(() => useBuiltPageIds());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pages).toEqual([]);
    expect(result.current.legacyPageIds).toEqual([]);
  });

  it('lists v3 draft pages with their metadata', async () => {
    seedDraft(
      'about',
      buildDraftPagePayload({
        title: 'About',
        path: '/about',
        pageType: 'static',
      })
    );

    const { result } = renderHookWithProviders(() => useBuiltPageIds());
    await waitFor(() => expect(result.current.pages).toHaveLength(1));

    expect(result.current.pages[0]).toMatchObject({
      pageId: 'about',
      title: 'About',
      path: '/about',
      pageType: 'static',
    });
  });

  it('marks a page published once it carries a publishedAt', async () => {
    seedDraft('a', buildDraftPagePayload());
    seedDraft(
      'b',
      buildDraftPagePayload({ publishedAt: '2026-02-01T00:00:00.000Z' })
    );

    const { result } = renderHookWithProviders(() => useBuiltPageIds());
    await waitFor(() => expect(result.current.pages).toHaveLength(2));

    expect(result.current.pageStates.get('a')).toBe('draft');
    expect(result.current.pageStates.get('b')).toBe('published');
  });

  it('lists legacy pages too, and names them as migration candidates', async () => {
    seedLegacy('old', legacyPayload());

    const { result } = renderHookWithProviders(() => useBuiltPageIds());
    await waitFor(() => expect(result.current.legacyPageIds).toEqual(['old']));
    expect(result.current.pages.map((p) => p.pageId)).toContain('old');
  });

  it('does not list a migrated page twice', async () => {
    seedLegacy('home', legacyPayload());
    seedDraft('home', buildDraftPagePayload());

    const { result } = renderHookWithProviders(() => useBuiltPageIds());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(
      result.current.pages.filter((p) => p.pageId === 'home')
    ).toHaveLength(1);
  });

  it('ignores objects in the container that are not pages', async () => {
    store.seed({
      container: LEGACY_PAGE_CONTAINER,
      key: 'sections',
      value: { schemaVersion: 2 },
    });

    const { result } = renderHookWithProviders(() => useBuiltPageIds());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pages).toEqual([]);
  });
});
