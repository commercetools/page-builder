/**
 * Write paths of the page connector: saving a draft, publishing, creating,
 * cascading delete, and the bulk legacy migration. Read paths live in
 * `fetchers.spec.ts`.
 */
import {
  useCreatePage,
  useMigrateAllPages,
  usePageDeleter,
  usePageUpdater,
} from './use-page-builder-connector';
import {
  COMPONENTS_CONTAINER,
  DRAFT_PAGE_CONTAINER,
  LEGACY_PAGE_CONTAINER,
  PUBLISHED_PAGE_CONTAINER,
  pageKey,
} from '../../components/page-builder/types';
import type {
  DraftPagePayload,
  Page,
  PublishedPagePayload,
} from '../../components/page-builder/types';
import { renderHookWithProviders, act } from '../../test-utils/render';
import { installMockServer, failOperation } from '../../test-utils/msw';
import {
  buildComponentElement,
  buildDraftPagePayload,
  buildLayoutElement,
  buildPage,
  buildPublishedPagePayload,
} from '../../test-utils/factories';
import { server } from '../../test-utils/msw/server';

const store = installMockServer();

const draftOf = (pageId: string) =>
  store.get(DRAFT_PAGE_CONTAINER, pageKey(pageId))?.value as
    | DraftPagePayload
    | undefined;
const publishedOf = (pageId: string) =>
  store.get(PUBLISHED_PAGE_CONTAINER, pageKey(pageId))?.value as
    | PublishedPagePayload
    | undefined;

const pageWithComponent = (): Page =>
  buildPage({
    MAIN: [
      buildLayoutElement({
        children: [buildComponentElement({ settings: { title: 'Hello' } })],
      }),
    ],
  });

const legacyPayload = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  pageType: 'static',
  title: 'Legacy',
  draft: {
    schemaVersion: 2,
    currentVersion: 1,
    pageId: 'old',
    versions: [
      {
        appVersion: 1,
        savedAt: '2026-01-15T10:00:00.000Z',
        publishedAt: null,
        page: pageWithComponent(),
      },
    ],
  },
  published: null,
  ...over,
});

describe('usePageUpdater — saveDraft', () => {
  const updater = (pageId = 'home') =>
    renderHookWithProviders(() => usePageUpdater(pageId)).result;

  it('creates the draft object on first save', async () => {
    const result = updater();
    await act(async () => {
      await result.current.saveDraft(
        pageWithComponent(),
        null,
        null,
        null,
        'static',
        {
          title: 'Home',
          path: '/',
        }
      );
    });

    const draft = draftOf('home');
    expect(draft?.title).toBe('Home');
    expect(draft?.path).toBe('/');
    expect(draft?.pageType).toBe('static');
    expect(draft?.draft.currentVersion).toBe(1);
  });

  it('writes components to their own objects before the page references them', async () => {
    const result = updater();
    await act(async () => {
      await result.current.saveDraft(pageWithComponent(), null, null, null);
    });

    // Leaves first: a component object exists, and the page stores a ref to it.
    expect(store.list(COMPONENTS_CONTAINER)).toHaveLength(1);
    const ref = draftOf('home')!.draft.versions[0].page.MAIN[0].children[0];
    expect(ref.typeId).toBe('key-value-document');
    expect(store.getById(ref.id)).toBeDefined();
  });

  it('appends a new version on each save and reports the new appVersion', async () => {
    const result = updater();
    let second!: { appVersion: number | null };
    await act(async () => {
      await result.current.saveDraft(pageWithComponent(), null, null, null);
    });
    await act(async () => {
      second = await result.current.saveDraft(
        buildPage({ MAIN: [buildLayoutElement()] }),
        null,
        null,
        null
      );
    });

    expect(draftOf('home')!.draft.versions).toHaveLength(2);
    expect(second.appVersion).toBe(2);
  });

  it('caps retained history at MAX_VERSIONS', async () => {
    // Seed a draft already at the cap; the next save must not grow it.
    const versions = Array.from({ length: 50 }, (_, i) => ({
      appVersion: i + 1,
      savedAt: '2026-01-15T10:00:00.000Z',
      publishedAt: null,
      page: { HEAD: [], MAIN: [], FOOTER: [] },
    }));
    store.seed({
      container: DRAFT_PAGE_CONTAINER,
      key: pageKey('home'),
      value: buildDraftPagePayload({
        draft: {
          schemaVersion: 3,
          currentVersion: 50,
          pageId: 'home',
          versions,
        },
      }),
    });

    const result = updater();
    await act(async () => {
      await result.current.saveDraft(pageWithComponent(), null, null, null);
    });

    const saved = draftOf('home')!.draft.versions;
    expect(saved).toHaveLength(50);
    // The oldest was dropped, the newest kept.
    expect(saved[saved.length - 1].appVersion).toBe(51);
    expect(saved[0].appVersion).toBe(2);
  });

  it('preserves the denormalized publishedAt marker across a draft save', async () => {
    store.seed({
      container: DRAFT_PAGE_CONTAINER,
      key: pageKey('home'),
      value: buildDraftPagePayload({ publishedAt: '2026-02-01T00:00:00.000Z' }),
    });

    const result = updater();
    await act(async () => {
      await result.current.saveDraft(pageWithComponent(), null, null, null);
    });

    expect(draftOf('home')!.publishedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('omits metadata that was not supplied rather than writing undefined', async () => {
    const result = updater();
    await act(async () => {
      await result.current.saveDraft(pageWithComponent(), null, null, null);
    });

    const draft = draftOf('home')!;
    expect('title' in draft).toBe(false);
    expect('pageType' in draft).toBe(false);
  });
});

describe('usePageUpdater — publish', () => {
  const updater = (pageId = 'home') =>
    renderHookWithProviders(() => usePageUpdater(pageId)).result;

  it('freezes the page inline into the published container', async () => {
    const page = pageWithComponent();
    const result = updater();
    await act(async () => {
      await result.current.publish(page, null, null, 'static', {
        title: 'Home',
      });
    });

    const published = publishedOf('home')!;
    expect(published.pageId).toBe('home');
    expect(published.title).toBe('Home');
    // Inline, not references — the storefront reads this without a second hop.
    expect(published.page.MAIN[0].children[0].settings).toEqual({
      title: 'Hello',
    });
  });

  it('saves the draft as part of publishing', async () => {
    const result = updater();
    await act(async () => {
      await result.current.publish(pageWithComponent(), null, null);
    });
    expect(draftOf('home')).toBeDefined();
  });

  it('stamps publishedAt on the draft and on its head version', async () => {
    const result = updater();
    await act(async () => {
      await result.current.publish(pageWithComponent(), null, null);
    });

    const draft = draftOf('home')!;
    expect(draft.publishedAt).toEqual(expect.any(String));
    const head = draft.draft.versions[draft.draft.versions.length - 1];
    expect(head.publishedAt).toBe(draft.publishedAt);
  });

  it('returns the published payload it wrote', async () => {
    const result = updater();
    let out!: { published: PublishedPagePayload };
    await act(async () => {
      out = await result.current.publish(pageWithComponent(), null, null);
    });
    expect(out.published).toEqual(publishedOf('home'));
  });

  it('replaces the previous snapshot on republish', async () => {
    store.seed({
      container: PUBLISHED_PAGE_CONTAINER,
      key: pageKey('home'),
      value: buildPublishedPagePayload({ appVersion: 1, title: 'Old' }),
    });

    const result = updater();
    await act(async () => {
      await result.current.publish(pageWithComponent(), null, null, 'static', {
        title: 'New',
      });
    });

    expect(publishedOf('home')!.title).toBe('New');
    expect(store.list(PUBLISHED_PAGE_CONTAINER)).toHaveLength(1);
  });
});

describe('useCreatePage', () => {
  it('creates an empty draft page with the sections laid out', async () => {
    const { result } = renderHookWithProviders(() => useCreatePage());
    await act(async () => {
      await result.current.createPage('about', {
        title: 'About',
        path: '/about',
        pageType: 'static',
      });
    });

    const draft = draftOf('about')!;
    expect(draft.title).toBe('About');
    expect(draft.draft.pageId).toBe('about');
    const page = draft.draft.versions[0].page;
    expect(Object.keys(page).sort()).toEqual(['FOOTER', 'HEAD', 'MAIN']);
    expect(page.MAIN).toEqual([]);
  });

  it('omits metadata that was not supplied', async () => {
    const { result } = renderHookWithProviders(() => useCreatePage());
    await act(async () => {
      await result.current.createPage('bare', {});
    });
    const draft = draftOf('bare')!;
    expect('title' in draft).toBe(false);
    expect('path' in draft).toBe(false);
  });
});

describe('usePageDeleter', () => {
  const deleter = (pageId = 'home') =>
    renderHookWithProviders(() => usePageDeleter(pageId)).result;

  it('removes the draft, the published snapshot and the legacy object together', async () => {
    store.seed(
      {
        container: DRAFT_PAGE_CONTAINER,
        key: pageKey('home'),
        value: buildDraftPagePayload(),
      },
      {
        container: PUBLISHED_PAGE_CONTAINER,
        key: pageKey('home'),
        value: buildPublishedPagePayload(),
      },
      {
        container: LEGACY_PAGE_CONTAINER,
        key: pageKey('home'),
        value: legacyPayload(),
      }
    );

    const result = deleter();
    await act(async () => {
      await result.current.deletePage();
    });

    expect(store.get(DRAFT_PAGE_CONTAINER, pageKey('home'))).toBeUndefined();
    expect(
      store.get(PUBLISHED_PAGE_CONTAINER, pageKey('home'))
    ).toBeUndefined();
    expect(store.get(LEGACY_PAGE_CONTAINER, pageKey('home'))).toBeUndefined();
  });

  it('cascades to the component objects the draft referenced', async () => {
    const updater = renderHookWithProviders(() =>
      usePageUpdater('home')
    ).result;
    await act(async () => {
      await updater.current.saveDraft(pageWithComponent(), null, null, null);
    });
    expect(store.list(COMPONENTS_CONTAINER)).toHaveLength(1);

    const result = deleter();
    await act(async () => {
      await result.current.deletePage();
    });

    expect(store.list(COMPONENTS_CONTAINER)).toHaveLength(0);
  });

  it('succeeds for a page that does not exist', async () => {
    const result = deleter('ghost');
    await act(async () => {
      await expect(result.current.deletePage()).resolves.toBeUndefined();
    });
  });

  it('leaves other pages alone', async () => {
    store.seed(
      {
        container: DRAFT_PAGE_CONTAINER,
        key: pageKey('home'),
        value: buildDraftPagePayload(),
      },
      {
        container: DRAFT_PAGE_CONTAINER,
        key: pageKey('about'),
        value: buildDraftPagePayload(),
      }
    );

    const result = deleter('home');
    await act(async () => {
      await result.current.deletePage();
    });

    expect(store.get(DRAFT_PAGE_CONTAINER, pageKey('about'))).toBeDefined();
  });

  it('surfaces a failure instead of reporting a silent success', async () => {
    store.seed({
      container: DRAFT_PAGE_CONTAINER,
      key: pageKey('home'),
      value: buildDraftPagePayload(),
    });
    server.use(failOperation('DeletePage', 'permission denied', 'mutation'));

    const result = deleter();
    await act(async () => {
      await expect(result.current.deletePage()).rejects.toBeDefined();
    });
  });
});

describe('useMigrateAllPages', () => {
  const migrator = () =>
    renderHookWithProviders(() => useMigrateAllPages()).result;

  it('reports nothing to do when the legacy container is empty', async () => {
    const result = migrator();
    let out!: { total: number; migrated: number; failed: unknown[] };
    await act(async () => {
      out = await result.current.migrateAll();
    });
    expect(out).toEqual({ total: 0, migrated: 0, failed: [] });
  });

  it('moves a legacy page into the draft and component containers', async () => {
    store.seed({
      container: LEGACY_PAGE_CONTAINER,
      key: pageKey('old'),
      value: legacyPayload(),
    });

    const result = migrator();
    let out!: { total: number; migrated: number };
    await act(async () => {
      out = await result.current.migrateAll();
    });

    expect(out).toMatchObject({ total: 1, migrated: 1 });
    expect(draftOf('old')).toBeDefined();
    expect(store.list(COMPONENTS_CONTAINER).length).toBeGreaterThan(0);
    // The legacy object is cleaned up once its content is safely split.
    expect(store.get(LEGACY_PAGE_CONTAINER, pageKey('old'))).toBeUndefined();
  });

  it('carries a legacy published block into the published container', async () => {
    store.seed({
      container: LEGACY_PAGE_CONTAINER,
      key: pageKey('old'),
      value: legacyPayload({
        published: {
          schemaVersion: 2,
          appVersion: 2,
          publishedAt: '2026-01-01T00:00:00.000Z',
          pageId: 'old',
          page: pageWithComponent(),
        },
      }),
    });

    const result = migrator();
    await act(async () => {
      await result.current.migrateAll();
    });

    expect(publishedOf('old')?.appVersion).toBe(2);
  });

  it('never clobbers a page that is already migrated', async () => {
    store.seed(
      {
        container: LEGACY_PAGE_CONTAINER,
        key: pageKey('old'),
        value: legacyPayload(),
      },
      {
        container: DRAFT_PAGE_CONTAINER,
        key: pageKey('old'),
        value: buildDraftPagePayload({ title: 'Newer content' }),
      }
    );

    const result = migrator();
    await act(async () => {
      await result.current.migrateAll();
    });

    expect(draftOf('old')!.title).toBe('Newer content');
  });

  it('reports progress as it goes', async () => {
    store.seed(
      {
        container: LEGACY_PAGE_CONTAINER,
        key: pageKey('a'),
        value: legacyPayload(),
      },
      {
        container: LEGACY_PAGE_CONTAINER,
        key: pageKey('b'),
        value: legacyPayload(),
      }
    );
    const onProgress = jest.fn();

    const result = migrator();
    await act(async () => {
      await result.current.migrateAll(onProgress);
    });

    expect(onProgress).toHaveBeenCalled();
    const [done, total] =
      onProgress.mock.calls[onProgress.mock.calls.length - 1];
    expect(done).toBe(2);
    expect(total).toBe(2);
  });

  it('is safe to re-run', async () => {
    store.seed({
      container: LEGACY_PAGE_CONTAINER,
      key: pageKey('old'),
      value: legacyPayload(),
    });

    const result = migrator();
    await act(async () => {
      await result.current.migrateAll();
    });
    const afterFirst = draftOf('old');

    let second!: { total: number; migrated: number };
    await act(async () => {
      second = await result.current.migrateAll();
    });

    expect(second.total).toBe(0);
    expect(draftOf('old')).toEqual(afterFirst);
  });
});
