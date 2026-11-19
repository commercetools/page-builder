import { usePageDetailData } from './use-page-detail-data';
import { FALLBACK_PAGE_ID, PDP_FALLBACK_ID } from './page-detail-ids';
import {
  DRAFT_PAGE_CONTAINER,
  PUBLISHED_PAGE_CONTAINER,
  pageKey,
} from '../page-builder/types';
import { renderHookWithProviders, waitFor } from '../../test-utils/render';
import { installMockServer } from '../../test-utils/msw';
import {
  buildDraftPagePayload,
  buildDraftPageVersion,
  buildPageNode,
  buildPublishedPagePayload,
} from '../../test-utils/factories';

const store = installMockServer();

const seedDraft = (pageId: string, value: unknown) =>
  store.seed({ container: DRAFT_PAGE_CONTAINER, key: pageKey(pageId), value });
const seedPublished = (pageId: string, value: unknown) =>
  store.seed({
    container: PUBLISHED_PAGE_CONTAINER,
    key: pageKey(pageId),
    value,
  });

const version = (savedAt: string, publishedAt: string | null = null) =>
  buildDraftPageVersion({ savedAt, publishedAt });

const render = (nodeId = 'shoes') =>
  renderHookWithProviders(() =>
    usePageDetailData(buildPageNode({ id: nodeId, title: 'Shoes' }))
  );

const settled = async (result: {
  current: { draftFetcher: { loading: boolean } };
}) => waitFor(() => expect(result.current.draftFetcher.loading).toBe(false));

describe('usePageDetailData builder state', () => {
  it('reports nothing for a node with no page yet', async () => {
    const { result } = render();
    await settled(result);

    expect(result.current.builderState).toBeNull();
    expect(result.current.appVersion).toBeNull();
    expect(result.current.publishedAt).toBeNull();
  });

  it('reports a draft-only page', async () => {
    seedDraft('shoes', buildDraftPagePayload());
    const { result } = render();
    await waitFor(() => expect(result.current.builderState).toBe('draft'));
  });

  it('reports a published page', async () => {
    seedPublished('shoes', buildPublishedPagePayload({ appVersion: 4 }));
    const { result } = render();
    await waitFor(() => expect(result.current.builderState).toBe('published'));
    expect(result.current.publishedAt).toEqual(expect.any(String));
  });

  it('prefers the draft version number over the published one', async () => {
    seedDraft(
      'shoes',
      buildDraftPagePayload({
        draft: {
          schemaVersion: 3,
          currentVersion: 7,
          pageId: 'shoes',
          versions: [buildDraftPageVersion({ appVersion: 7 })],
        },
      })
    );
    seedPublished('shoes', buildPublishedPagePayload({ appVersion: 4 }));

    const { result } = render();
    await waitFor(() => expect(result.current.appVersion).toBe(7));
  });

  it('falls back to the published version number', async () => {
    seedPublished('shoes', buildPublishedPagePayload({ appVersion: 4 }));
    const { result } = render();
    await waitFor(() => expect(result.current.appVersion).toBe(4));
  });
});

describe('usePageDetailData version history', () => {
  const withVersions = (...versions: ReturnType<typeof version>[]) =>
    seedDraft(
      'shoes',
      buildDraftPagePayload({
        draft: {
          schemaVersion: 3,
          currentVersion: versions.length,
          pageId: 'shoes',
          versions,
        },
      })
    );

  it('reports when the page was last saved', async () => {
    withVersions(version('2026-01-01'), version('2026-02-01'));
    const { result } = render();
    await waitFor(() => expect(result.current.lastSavedAt).toBe('2026-02-01'));
  });

  it('reports nothing saved for a page with no history', async () => {
    const { result } = render();
    await settled(result);
    expect(result.current.lastSavedAt).toBeNull();
  });

  it('counts every version as unpublished when nothing is published', async () => {
    withVersions(version('2026-01-01'), version('2026-02-01'));
    const { result } = render();
    await waitFor(() => expect(result.current.unpublishedCount).toBe(2));
  });

  it('counts only versions saved after the publish', async () => {
    withVersions(
      version('2026-01-01', '2026-01-15'),
      version('2026-02-01'),
      version('2026-03-01')
    );
    seedPublished(
      'shoes',
      buildPublishedPagePayload({ publishedAt: '2026-01-15' })
    );

    const { result } = render();
    await waitFor(() => expect(result.current.unpublishedCount).toBe(2));
  });

  it('lists the five most recent versions, newest first', async () => {
    withVersions(
      ...Array.from({ length: 8 }, (_, i) =>
        version(`2026-0${i + 1}-01`.slice(0, 10))
      )
    );
    const { result } = render();
    await waitFor(() => expect(result.current.recentVersions).toHaveLength(5));

    const [first, second] = result.current.recentVersions;
    expect(first.savedAt > second.savedAt).toBe(true);
  });

  it('reports no recent versions for a page with no history', async () => {
    const { result } = render();
    await settled(result);
    expect(result.current.recentVersions).toEqual([]);
  });
});

describe('usePageDetailData fallback content', () => {
  it('offers the fallback as a seed for a new page', async () => {
    seedDraft(FALLBACK_PAGE_ID, buildDraftPagePayload());
    const { result } = render('shoes');
    await waitFor(() => expect(result.current.canCopyFallback).toBe(true));
    expect(result.current.fallbackContent).not.toBeNull();
  });

  it('never offers the fallback as a seed for itself', async () => {
    seedDraft(FALLBACK_PAGE_ID, buildDraftPagePayload());
    const { result } = render(FALLBACK_PAGE_ID);
    await settled(result);
    expect(result.current.canCopyFallback).toBe(false);
  });

  it('offers nothing when the fallback has no content', async () => {
    const { result } = render('shoes');
    await settled(result);
    expect(result.current.canCopyFallback).toBe(false);
    expect(result.current.fallbackContent).toBeNull();
  });
});

describe('usePageDetailData PDP override', () => {
  it('derives the override id from the node', async () => {
    const { result } = render('shoes');
    expect(result.current.pdpOverrideId).toBe('pdp-shoes');
  });

  it('reports no override until one exists', async () => {
    const { result } = render();
    await settled(result);
    expect(result.current.pdpOverrideState).toBeNull();
    expect(result.current.pdpOverrideVersion).toBeNull();
  });

  it('reports a draft override', async () => {
    seedDraft('pdp-shoes', buildDraftPagePayload());
    const { result } = render();
    await waitFor(() => expect(result.current.pdpOverrideState).toBe('draft'));
  });

  it('reports a published override with its version', async () => {
    seedPublished('pdp-shoes', buildPublishedPagePayload({ appVersion: 3 }));
    const { result } = render();
    await waitFor(() =>
      expect(result.current.pdpOverrideState).toBe('published')
    );
    expect(result.current.pdpOverrideVersion).toBe(3);
  });

  it('counts unpublished override versions since its publish', async () => {
    seedDraft(
      'pdp-shoes',
      buildDraftPagePayload({
        draft: {
          schemaVersion: 3,
          currentVersion: 2,
          pageId: 'pdp-shoes',
          versions: [
            version('2026-01-01', '2026-01-15'),
            version('2026-02-01'),
          ],
        },
      })
    );
    seedPublished(
      'pdp-shoes',
      buildPublishedPagePayload({ publishedAt: '2026-01-15' })
    );

    const { result } = render();
    await waitFor(() =>
      expect(result.current.pdpOverrideUnpublishedCount).toBe(1)
    );
  });
});

describe('usePageDetailData global PDP', () => {
  it('reports no global PDP until one exists', async () => {
    const { result } = render();
    await settled(result);
    expect(result.current.globalPdpState).toBeNull();
    expect(result.current.canCopyGlobalPdp).toBe(false);
  });

  it('offers the global PDP as a seed for an override', async () => {
    seedDraft(PDP_FALLBACK_ID, buildDraftPagePayload());
    const { result } = render();
    await waitFor(() => expect(result.current.canCopyGlobalPdp).toBe(true));
    expect(result.current.globalPdpContent).not.toBeNull();
  });

  it('reports the global PDP state and version', async () => {
    seedPublished(
      PDP_FALLBACK_ID,
      buildPublishedPagePayload({ appVersion: 6 })
    );
    const { result } = render();
    await waitFor(() =>
      expect(result.current.globalPdpState).toBe('published')
    );
    expect(result.current.globalPdpVersion).toBe(6);
  });
});
