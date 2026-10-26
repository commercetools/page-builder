import { toast } from '@commercetools/nimbus';
import { usePageDocument } from './use-page-document';
import {
  DRAFT_PAGE_CONTAINER,
  LEGACY_PAGE_CONTAINER,
  PUBLISHED_PAGE_CONTAINER,
  DEFAULT_SECTIONS,
  pageKey,
} from './types';
import type { DraftPagePayload, Page, PublishedPagePayload } from './types';
import { act, renderHookWithProviders, waitFor } from '../../test-utils/render';
import { failOperation, installMockServer } from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';
import {
  buildComponentElement,
  buildDraftPagePayload,
  buildDraftPageVersion,
  buildLayoutElement,
  buildPageNode,
  buildSection,
  buildRefPage,
  localized,
} from '../../test-utils/factories';

const store = installMockServer();

const sections = [
  buildSection({ id: 'HEAD' }),
  buildSection({ id: 'MAIN' }),
  buildSection({ id: 'FOOTER' }),
];

let toastSuccess: jest.SpyInstance;
let toastError: jest.SpyInstance;
beforeEach(() => {
  toastSuccess = jest.spyOn(toast, 'success').mockImplementation(() => '');
  toastError = jest.spyOn(toast, 'error').mockImplementation(() => '');
});
afterEach(() => {
  toastSuccess.mockRestore();
  toastError.mockRestore();
});

const render = (
  over: {
    pageId?: string;
    pageNode?: ReturnType<typeof buildPageNode>;
    pageNodeIsLive?: boolean;
    route?: string;
    state?: unknown;
  } = {}
) =>
  renderHookWithProviders(
    () =>
      usePageDocument({
        pageId: over.pageId ?? 'home',
        pageNode:
          over.pageNode ?? buildPageNode({ id: 'home', type: undefined }),
        pageNodeIsLive: over.pageNodeIsLive ?? true,
        sections,
      }),
    over.state
      ? { route: { pathname: over.route ?? '/', state: over.state } as never }
      : { route: over.route ?? '/' }
  );

const seedDraft = (pageId: string, value: DraftPagePayload) =>
  store.seed({
    container: DRAFT_PAGE_CONTAINER,
    key: pageKey(pageId),
    value,
  })[0];

const draftOf = (pageId = 'home') =>
  store.get(DRAFT_PAGE_CONTAINER, pageKey(pageId))?.value as
    | DraftPagePayload
    | undefined;
const publishedOf = (pageId = 'home') =>
  store.get(PUBLISHED_PAGE_CONTAINER, pageKey(pageId))?.value as
    | PublishedPagePayload
    | undefined;

const pageWithComponent = (): Page => ({
  HEAD: [],
  MAIN: [buildLayoutElement({ children: [buildComponentElement()] })],
  FOOTER: [],
});

/** Wait for the initial draft query + seeding effect to settle. */
const settled = async (result: { current: { initialized: string | null } }) =>
  waitFor(() => expect(result.current.initialized).not.toBeNull());

describe('usePageDocument seeding', () => {
  it('starts a brand-new page with an empty section per definition', async () => {
    const { result } = render();
    await settled(result);

    expect(Object.keys(result.current.page).sort()).toEqual([
      'FOOTER',
      'HEAD',
      'MAIN',
    ]);
    expect(result.current.page.MAIN).toEqual([]);
    expect(result.current.dirty).toBe(false);
  });

  it('seeds from the stored draft', async () => {
    seedDraft(
      'home',
      buildDraftPagePayload({
        draft: {
          schemaVersion: 3,
          currentVersion: 1,
          pageId: 'home',
          versions: [
            buildDraftPageVersion({ page: buildRefPage({ MAIN: [] }) }),
          ],
        },
      })
    );

    const { result } = render();
    await settled(result);
    expect(result.current.initialized).toBe('home');
  });

  it('fills in a section the stored page has no entry for', async () => {
    seedDraft('home', buildDraftPagePayload());
    const { result } = render();
    await settled(result);
    expect(result.current.page.FOOTER).toEqual([]);
  });

  it('marks a page with no publish stamp as having an unpublished save', async () => {
    seedDraft('home', buildDraftPagePayload());
    const { result } = render();
    await settled(result);
    // Never published → the legacy publish gate is open.
    expect(result.current.legacyCanPublish).toBe(true);
  });

  it('seeds a copied page from router state and marks it dirty', async () => {
    const { result } = render({
      pageId: 'new-page',
      state: { copyFromPage: pageWithComponent() },
    });
    await settled(result);

    expect(result.current.page.MAIN).toHaveLength(1);
    // A copy starts dirty so the author is prompted to save it.
    expect(result.current.dirty).toBe(true);
  });

  it('gives a copied page fresh component ids', async () => {
    const source = pageWithComponent();
    const originalId = source.MAIN[0].children[0].id;

    const { result } = render({
      pageId: 'new-page',
      state: { copyFromPage: source },
    });
    await settled(result);

    expect(result.current.page.MAIN[0].children[0].id).not.toBe(originalId);
  });

  it('prefers an existing draft over the copy handed in by the router', async () => {
    seedDraft('home', buildDraftPagePayload());
    const { result } = render({ state: { copyFromPage: pageWithComponent() } });
    await settled(result);

    expect(result.current.dirty).toBe(false);
  });

  it('remaps component ids when the page still uses the legacy shape', async () => {
    // A legacy page must be re-keyed so any save writes a valid v3 page.
    const legacyComponentId = 'legacy-component-id';
    store.seed({
      container: LEGACY_PAGE_CONTAINER,
      key: pageKey('home'),
      value: {
        schemaVersion: 2,
        draft: {
          schemaVersion: 2,
          currentVersion: 1,
          pageId: 'home',
          versions: [
            {
              appVersion: 1,
              savedAt: '2026-01-15T10:00:00.000Z',
              publishedAt: null,
              page: {
                HEAD: [],
                MAIN: [
                  buildLayoutElement({
                    children: [
                      buildComponentElement({ id: legacyComponentId }),
                    ],
                  }),
                ],
                FOOTER: [],
              },
            },
          ],
        },
        published: null,
      },
    });

    const { result } = render();
    await waitFor(() => expect(result.current.page.MAIN).toHaveLength(1));
    expect(result.current.page.MAIN[0].children[0].id).not.toBe(
      legacyComponentId
    );
  });
});

describe('usePageDocument pageType', () => {
  it('trusts the live tree node over anything previously stored', async () => {
    seedDraft('home', buildDraftPagePayload({ pageType: 'dynamic' }));
    const { result } = render({
      pageNode: buildPageNode({ id: 'shoes', type: 'category' }),
      pageNodeIsLive: true,
    });
    await settled(result);

    expect(result.current.pageType).toBe('category');
  });

  it('falls back to the stored page type for a synthetic node', async () => {
    seedDraft('home', buildDraftPagePayload({ pageType: 'dynamic' }));
    const { result } = render({ pageNodeIsLive: false });
    await settled(result);

    expect(result.current.pageType).toBe('dynamic');
  });

  it('derives the type from the node when nothing is stored', async () => {
    const { result } = render({
      pageNode: buildPageNode({ id: 'pdp-shoes', type: undefined }),
      pageNodeIsLive: false,
    });
    await settled(result);

    expect(result.current.pageType).toBe('pdp');
  });

  it('carries the stored title and path through as page metadata', async () => {
    seedDraft('home', buildDraftPagePayload({ title: 'Home', path: '/' }));
    const { result } = render();
    await settled(result);

    expect(result.current.pageMeta).toEqual({ title: 'Home', path: '/' });
  });
});

describe('usePageDocument undo and redo', () => {
  const withHistory = async () => {
    const { result } = render();
    await settled(result);
    const first = result.current.page;
    const second = pageWithComponent();
    act(() => result.current.pushHistory(second));
    return { result, first, second };
  };

  it('cannot undo or redo a freshly loaded page', async () => {
    const { result } = render();
    await settled(result);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('records an edit and marks the page dirty', async () => {
    const { result, second } = await withHistory();
    expect(result.current.page).toBe(second);
    expect(result.current.dirty).toBe(true);
    expect(result.current.canUndo).toBe(true);
  });

  it('undoes back to the previous page', async () => {
    const { result, first } = await withHistory();
    act(() => result.current.undo());

    expect(result.current.page).toBe(first);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('redoes back to the undone page', async () => {
    const { result, second } = await withHistory();
    act(() => result.current.undo());
    act(() => result.current.redo());

    expect(result.current.page).toBe(second);
    expect(result.current.canRedo).toBe(false);
  });

  it('ignores undo with nothing to undo', async () => {
    const { result } = render();
    await settled(result);
    const before = result.current.page;
    act(() => result.current.undo());
    expect(result.current.page).toBe(before);
  });

  it('ignores redo with nothing to redo', async () => {
    const { result, second } = await withHistory();
    act(() => result.current.redo());
    expect(result.current.page).toBe(second);
  });

  it('discards the redo stack once a new edit is made', async () => {
    const { result } = await withHistory();
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.pushHistory(pageWithComponent()));
    expect(result.current.canRedo).toBe(false);
  });
});

describe('usePageDocument save', () => {
  it('reports its state through the save lifecycle', async () => {
    const { result } = render();
    await settled(result);
    expect(result.current.saveState).toBe('saved');

    act(() => result.current.pushHistory(pageWithComponent()));
    expect(result.current.saveState).toBe('dirty');

    await act(async () => {
      await result.current.save();
    });
    expect(result.current.saveState).toBe('saved');
  });

  it('persists the page and confirms with a toast', async () => {
    const { result } = render();
    await settled(result);
    act(() => result.current.pushHistory(pageWithComponent()));

    await act(async () => {
      await result.current.save();
    });

    expect(draftOf()).toBeDefined();
    expect(toastSuccess).toHaveBeenCalledWith({ title: 'Draft saved!' });
  });

  it('reports a save failure without throwing at the caller', async () => {
    server.use(failOperation('UpsertPage', 'nope', 'mutation'));
    const { result } = render();
    await settled(result);
    act(() => result.current.pushHistory(pageWithComponent()));

    await act(async () => {
      await result.current.save();
    });

    expect(toastError).toHaveBeenCalledWith({
      title: 'Save failed. Please try again.',
    });
    // Still dirty, so the author knows the work is not safe yet.
    expect(result.current.dirty).toBe(true);
  });

  it('saves silently, letting failures propagate to the caller', async () => {
    // The workflow runtime needs the failure so it can say "could not advance".
    server.use(failOperation('UpsertPage', 'nope', 'mutation'));
    const { result } = render();
    await settled(result);

    await act(async () => {
      await expect(result.current.saveDraftSilently()).rejects.toBeDefined();
    });
    expect(toastError).not.toHaveBeenCalled();
  });

  it('clears the dirty flag on a silent save', async () => {
    const { result } = render();
    await settled(result);
    act(() => result.current.pushHistory(pageWithComponent()));

    await act(async () => {
      await result.current.saveDraftSilently();
    });

    expect(result.current.dirty).toBe(false);
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});

describe('usePageDocument publish', () => {
  it('writes the published snapshot and confirms', async () => {
    const { result } = render();
    await settled(result);
    act(() => result.current.pushHistory(pageWithComponent()));

    await act(async () => {
      await result.current.publishPage();
    });

    expect(publishedOf()).toBeDefined();
    expect(toastSuccess).toHaveBeenCalledWith({ title: 'Page published!' });
    expect(result.current.dirty).toBe(false);
  });

  it('closes the legacy publish gate once published', async () => {
    seedDraft('home', buildDraftPagePayload());
    const { result } = render();
    await settled(result);

    await act(async () => {
      await result.current.publishPage();
    });

    expect(result.current.legacyCanPublish).toBe(false);
  });

  it('reports a publish failure', async () => {
    const { result } = render();
    await settled(result);
    server.use(failOperation('UpsertPage', 'nope', 'mutation'));

    await act(async () => {
      await result.current.publishPage();
    });

    expect(toastError).toHaveBeenCalledWith({
      title: 'Publish failed. Please try again.',
    });
  });

  it('saves and publishes in one action', async () => {
    const { result } = render();
    await settled(result);
    act(() => result.current.pushHistory(pageWithComponent()));

    await act(async () => {
      await result.current.saveAndPublish();
    });

    expect(draftOf()).toBeDefined();
    expect(publishedOf()).toBeDefined();
    expect(toastSuccess).toHaveBeenCalledWith({
      title: 'Page saved and published!',
    });
  });

  it('reports a combined save-and-publish failure once', async () => {
    server.use(failOperation('UpsertPage', 'nope', 'mutation'));
    const { result } = render();
    await settled(result);

    await act(async () => {
      await result.current.saveAndPublish();
    });

    expect(toastError).toHaveBeenCalledWith({
      title: 'Save and publish failed. Please try again.',
    });
  });
});

describe('usePageDocument data sources', () => {
  const dataSource = (id = 'ds-1') => ({
    id,
    type: 'commerce/product-list',
    name: localized('Featured'),
    config: { limit: 3 },
    savedForReuse: true,
  });

  it('starts with no saved data sources', async () => {
    const { result } = render();
    await settled(result);
    expect(result.current.savedDataSources).toEqual([]);
    expect(result.current.instancesDirty).toBe(false);
  });

  it('adds a data source and marks the instances unpublished', async () => {
    const { result } = render();
    await settled(result);

    await act(async () => {
      await result.current.saveDataSource(dataSource());
    });

    expect(result.current.savedDataSources).toEqual([dataSource()]);
    expect(result.current.instancesDirty).toBe(true);
    expect(toastSuccess).toHaveBeenCalledWith({ title: 'Data source saved!' });
  });

  it('replaces an existing data source rather than duplicating it', async () => {
    const { result } = render();
    await settled(result);

    await act(async () => {
      await result.current.saveDataSource(dataSource());
    });
    await act(async () => {
      await result.current.saveDataSource({
        ...dataSource(),
        config: { limit: 9 },
      });
    });

    expect(result.current.savedDataSources).toHaveLength(1);
    expect(result.current.savedDataSources[0].config).toEqual({ limit: 9 });
  });

  it('keeps distinct data sources side by side', async () => {
    const { result } = render();
    await settled(result);

    await act(async () => {
      await result.current.saveDataSource(dataSource('ds-1'));
    });
    await act(async () => {
      await result.current.saveDataSource(dataSource('ds-2'));
    });

    expect(result.current.savedDataSources.map((d) => d.id)).toEqual([
      'ds-1',
      'ds-2',
    ]);
  });

  it('publishing a data source clears the unpublished marker', async () => {
    const { result } = render();
    await settled(result);

    await act(async () => {
      await result.current.saveDataSource(dataSource());
    });
    expect(result.current.instancesDirty).toBe(true);

    await act(async () => {
      await result.current.publishDataSource(dataSource());
    });

    expect(result.current.instancesDirty).toBe(false);
    expect(toastSuccess).toHaveBeenCalledWith({
      title: 'Data source published!',
    });
  });

  it('reports a data-source save failure', async () => {
    server.use(failOperation('UpsertDataSources', 'nope', 'mutation'));
    const { result } = render();
    await settled(result);

    await act(async () => {
      await result.current.saveDataSource(dataSource());
    });

    expect(toastError).toHaveBeenCalledWith({
      title: 'Save failed. Please try again.',
    });
  });

  it('reports a data-source publish failure', async () => {
    server.use(failOperation('UpsertDataSources', 'nope', 'mutation'));
    const { result } = render();
    await settled(result);

    await act(async () => {
      await result.current.publishDataSource(dataSource());
    });

    expect(toastError).toHaveBeenCalledWith({
      title: 'Publish failed. Please try again.',
    });
  });

  it('loads previously saved instances', async () => {
    store.seed({
      container: 'page-editor',
      key: 'data-source-instances',
      value: {
        schemaVersion: 2,
        draft: { schemaVersion: 1, instances: [dataSource()] },
        published: null,
      },
    });

    const { result } = render();
    await waitFor(() =>
      expect(result.current.savedDataSources).toHaveLength(1)
    );
  });
});

describe('usePageDocument publish gate', () => {
  it('is closed while a save is in flight', async () => {
    const { result } = render();
    await settled(result);
    act(() => result.current.pushHistory(pageWithComponent()));

    let inFlight!: Promise<void>;
    act(() => {
      inFlight = result.current.save();
    });
    expect(result.current.saving).toBe(true);
    expect(result.current.legacyCanPublish).toBe(false);

    await act(async () => {
      await inFlight;
    });
  });

  it('is closed for a page that has never been saved at all', async () => {
    const { result } = render();
    await settled(result);
    // No draft object exists, so there is nothing to publish.
    expect(result.current.legacyCanPublish).toBe(false);
  });
});

describe('DEFAULT_SECTIONS fallback', () => {
  it('seeds the initial page from the default sections before any load', () => {
    const { result } = render();
    expect(Object.keys(result.current.page).sort()).toEqual(
      DEFAULT_SECTIONS.map((s) => s.id).sort()
    );
  });
});
