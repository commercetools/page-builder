import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from '@commercetools/nimbus';
import {
  usePageDraftFetcher,
  usePageUpdater,
} from '../../hooks/use-page-builder-connector';
import type {
  PageDraftHistoryPayload,
  PagePublishedPayload,
} from '../../hooks/use-page-builder-connector';
import {
  useDataSourceInstancesFetcher,
  useDataSourceInstancesUpdater,
} from '../../hooks/use-data-source-instances-connector';
import { remapPageComponentIds } from './ids';
import { pageTypeForNode } from './page-tree';
import { DEFAULT_SECTIONS } from './types';
import type { Page, PageNode, SavedDataSource, Section } from './types';

type UsePageDocumentArgs = {
  pageId: string;
  /** Resolved tree node for this page, real or synthesized. */
  pageNode: PageNode;
  /** True when `pageNode` came from the live tree rather than being synthesized. */
  pageNodeIsLive: boolean;
  /** Section definitions the page is built from. */
  sections: Section[];
};

/**
 * Everything about the page document itself: loading it, editing it with
 * undo/redo, and persisting it — together with the data-source instances, which
 * are saved and published in the same round-trips and so cannot sensibly live
 * apart from it.
 *
 * The optimistic-concurrency versions and the draft-history payload are refs:
 * they are written after each round-trip and read by the next one, and none of
 * them is rendered.
 */
export const usePageDocument = ({
  pageId,
  pageNode,
  pageNodeIsLive,
  sections,
}: UsePageDocumentArgs) => {
  const location = useLocation();

  const draftFetcher = usePageDraftFetcher(pageId);
  const { loading: saveLoading, saveDraft, publish } = usePageUpdater(pageId);
  const instancesFetcher = useDataSourceInstancesFetcher('draft');
  const {
    loading: instancesSaveLoading,
    saveInstances,
    publishInstances,
  } = useDataSourceInstancesUpdater();

  // A live tree match (home/cat-root/a real category) is authoritative and
  // overrides a stale `pageType` a previous save may have persisted under the
  // classification bug this replaces. Only unmatched (synthetic) ids fall back
  // to whatever was last stored, since there's no better source for those.
  const pageType = pageNodeIsLive
    ? pageTypeForNode(pageNode)
    : draftFetcher.pageType ?? pageTypeForNode(pageNode);
  // Preserve arbitrary-page metadata (title/path) across saves — same pattern
  // as `pageType`. Undefined for non-arbitrary pages, so nothing is written.
  const pageMeta = { title: draftFetcher.title, path: draftFetcher.path };

  const ctVersionRef = useRef<number | null>(null);
  const draftHistoryRef = useRef<PageDraftHistoryPayload | null>(null);
  const instancesCtVersionRef = useRef<number | null>(null);

  const [initialized, setInitialized] = useState<string | null>(null);
  const [currentPublished, setCurrentPublished] =
    useState<PagePublishedPayload | null>(null);
  const [page, setPage] = useState<Page>(() =>
    Object.fromEntries(DEFAULT_SECTIONS.map((s) => [s.id, []]))
  );
  const [history, setHistory] = useState<Page[]>([]);
  const [future, setFuture] = useState<Page[]>([]);
  const [dirty, setDirty] = useState(false);
  const [unpublishedSave, setUnpublishedSave] = useState(false);
  const [savedDataSources, setSavedDataSources] = useState<SavedDataSource[]>(
    []
  );
  const [instancesSaving, setInstancesSaving] = useState(false);
  const [instancesDirty, setInstancesDirty] = useState(false);

  useEffect(() => {
    if (instancesFetcher.loading) return;
    if (instancesFetcher.ctVersion !== null) {
      instancesCtVersionRef.current = instancesFetcher.ctVersion;
    }
    if (instancesFetcher.payload) {
      setSavedDataSources(instancesFetcher.payload.instances);
    }
  }, [
    instancesFetcher.loading,
    instancesFetcher.ctVersion,
    instancesFetcher.payload,
  ]);

  // Seeds the editable document once the draft query resolves, and re-seeds when
  // the route's pageId changes. This has to be an effect: the content arrives
  // asynchronously and the user edits it afterwards, so it cannot be derived
  // during render. `initialized` is what makes it idempotent per page — React
  // Router v5 keeps this component mounted when only `:pageId` changes, and
  // forcing a remount with a key instead would tear down the preview iframe,
  // which the splitter deliberately avoids doing on selection changes.
  useEffect(() => {
    if (draftFetcher.loading) return;
    if (initialized === pageId) return;
    // When creating a dedicated page as a copy of the fallback, the source
    // content is handed over via router state and used to seed a brand-new,
    // unsaved page (only when no draft already exists for this id).
    const copyFromPage =
      (location.state as { copyFromPage?: Page } | null)?.copyFromPage ?? null;
    let seededFromCopy = false;
    if (draftFetcher.current) {
      // A legacy (unmigrated) page is seeded with fresh component ids so any save writes a
      // valid v3 page (globally-unique component keys). Bulk migration lives on /pages.
      const fetched = draftFetcher.needsMigration
        ? remapPageComponentIds(draftFetcher.current.page)
        : draftFetcher.current.page;
      const fullPage = Object.fromEntries(
        sections.map((s) => [s.id, fetched[s.id] ?? []])
      );
      setPage(fullPage);
      setUnpublishedSave(!draftFetcher.current.publishedAt);
    } else if (copyFromPage) {
      const copied = remapPageComponentIds(copyFromPage);
      setPage(
        Object.fromEntries(sections.map((s) => [s.id, copied[s.id] ?? []]))
      );
      setUnpublishedSave(false);
      seededFromCopy = true;
    } else {
      setPage(Object.fromEntries(sections.map((s) => [s.id, []])));
      setUnpublishedSave(false);
    }
    setHistory([]);
    setFuture([]);
    // A copied page starts dirty so the user is prompted to save the copy.
    setDirty(seededFromCopy);
    draftHistoryRef.current = draftFetcher.history;
    ctVersionRef.current = draftFetcher.ctVersion;
    setCurrentPublished(draftFetcher.currentPublished);
    setInitialized(pageId);
    // `sections` is a real dependency: the body builds the page from it, and it
    // changes once sectionsFetcher resolves after mount. `draftFetcher` is
    // depended on whole because `.current` is a field on a memoised object, not
    // a valid dependency on its own; the object only changes when the query
    // does, and the `initialized === pageId` guard above makes extra runs a
    // no-op.
  }, [pageId, initialized, location.state, sections, draftFetcher]);

  const saving = saveLoading || instancesSaveLoading;
  const saveState: 'saving' | 'dirty' | 'saved' = saving
    ? 'saving'
    : dirty
    ? 'dirty'
    : 'saved';

  const upsertLocally = useCallback(
    (ds: SavedDataSource): SavedDataSource[] => {
      const idx = savedDataSources.findIndex((s) => s.id === ds.id);
      const next =
        idx === -1
          ? [...savedDataSources, ds]
          : savedDataSources.map((s) => (s.id === ds.id ? ds : s));
      setSavedDataSources(next);
      return next;
    },
    [savedDataSources]
  );

  const saveDataSource = useCallback(
    async (ds: SavedDataSource) => {
      const updated = upsertLocally(ds);
      setInstancesSaving(true);
      try {
        const result = await saveInstances(
          updated.length ? updated : [ds],
          instancesCtVersionRef.current
        );
        if (result.ctVersion !== null)
          instancesCtVersionRef.current = result.ctVersion;
        setInstancesDirty(true);
        toast.success({ title: 'Data source saved!' });
      } catch {
        toast.error({ title: 'Save failed. Please try again.' });
      } finally {
        setInstancesSaving(false);
      }
    },
    [upsertLocally, saveInstances]
  );

  const publishDataSource = useCallback(
    async (ds: SavedDataSource) => {
      const updated = upsertLocally(ds);
      setInstancesSaving(true);
      try {
        const result = await publishInstances(
          updated.length ? updated : [ds],
          instancesCtVersionRef.current
        );
        if (result.ctVersion !== null)
          instancesCtVersionRef.current = result.ctVersion;
        setInstancesDirty(false);
        toast.success({ title: 'Data source published!' });
      } catch {
        toast.error({ title: 'Publish failed. Please try again.' });
      } finally {
        setInstancesSaving(false);
      }
    },
    [upsertLocally, publishInstances]
  );

  const pushHistory = useCallback(
    (next: Page) => {
      setHistory((h) => [...h, page]);
      setFuture([]);
      setPage(next);
      setDirty(true);
    },
    [page]
  );

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setFuture((f) => [page, ...f]);
    setHistory((h) => h.slice(0, -1));
    setPage(prev);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory((h) => [...h, page]);
    setFuture((f) => f.slice(1));
    setPage(next);
  };

  /**
   * Persist the draft without a toast, and let failures propagate. The workflow
   * runtime uses this to save before advancing, so a failure there is reported
   * as "could not advance" rather than as a save error.
   */
  const saveDraftSilently = async () => {
    const pageResult = await saveDraft(
      page,
      draftHistoryRef.current,
      currentPublished,
      ctVersionRef.current,
      pageType,
      pageMeta
    );
    if (pageResult.ctVersion !== null)
      ctVersionRef.current = pageResult.ctVersion;
    draftHistoryRef.current = pageResult.history;
    setDirty(false);
    setUnpublishedSave(true);
  };

  const save = async () => {
    try {
      const [pageResult, instancesResult] = await Promise.all([
        saveDraft(
          page,
          draftHistoryRef.current,
          currentPublished,
          ctVersionRef.current,
          pageType,
          pageMeta
        ),
        saveInstances(savedDataSources, instancesCtVersionRef.current),
      ]);
      if (pageResult.ctVersion !== null)
        ctVersionRef.current = pageResult.ctVersion;
      if (instancesResult.ctVersion !== null)
        instancesCtVersionRef.current = instancesResult.ctVersion;
      draftHistoryRef.current = pageResult.history;
      setDirty(false);
      setUnpublishedSave(true);
      toast.success({ title: 'Draft saved!' });
    } catch {
      toast.error({ title: 'Save failed. Please try again.' });
    }
  };

  const publishPage = async () => {
    try {
      const [pageResult, instancesResult] = await Promise.all([
        publish(
          page,
          draftHistoryRef.current,
          ctVersionRef.current,
          pageType,
          pageMeta
        ),
        publishInstances(savedDataSources, instancesCtVersionRef.current),
      ]);
      if (pageResult.ctVersion !== null)
        ctVersionRef.current = pageResult.ctVersion;
      if (instancesResult.ctVersion !== null)
        instancesCtVersionRef.current = instancesResult.ctVersion;
      draftHistoryRef.current = pageResult.history;
      setCurrentPublished(pageResult.published);
      setDirty(false);
      setUnpublishedSave(false);
      setInstancesDirty(false);
      toast.success({ title: 'Page published!' });
    } catch {
      toast.error({ title: 'Publish failed. Please try again.' });
    }
  };

  const saveAndPublish = async () => {
    try {
      const [pageResult, instancesResult] = await Promise.all([
        saveDraft(
          page,
          draftHistoryRef.current,
          currentPublished,
          ctVersionRef.current,
          pageType,
          pageMeta
        ),
        saveInstances(savedDataSources, instancesCtVersionRef.current),
      ]);
      const newPageCtVersion = pageResult.ctVersion ?? ctVersionRef.current;
      const newInstancesCtVersion =
        instancesResult.ctVersion ?? instancesCtVersionRef.current;
      if (pageResult.ctVersion !== null)
        ctVersionRef.current = pageResult.ctVersion;
      if (instancesResult.ctVersion !== null)
        instancesCtVersionRef.current = instancesResult.ctVersion;
      draftHistoryRef.current = pageResult.history;
      setDirty(false);
      setUnpublishedSave(true);

      const [pubPageResult, pubInstancesResult] = await Promise.all([
        publish(page, pageResult.history, newPageCtVersion, pageType, pageMeta),
        publishInstances(savedDataSources, newInstancesCtVersion),
      ]);
      if (pubPageResult.ctVersion !== null)
        ctVersionRef.current = pubPageResult.ctVersion;
      if (pubInstancesResult.ctVersion !== null)
        instancesCtVersionRef.current = pubInstancesResult.ctVersion;
      draftHistoryRef.current = pubPageResult.history;
      setCurrentPublished(pubPageResult.published);
      setUnpublishedSave(false);
      setInstancesDirty(false);
      toast.success({ title: 'Page saved and published!' });
    } catch {
      toast.error({ title: 'Save and publish failed. Please try again.' });
    }
  };

  return {
    page,
    setPage,
    pageType,
    pageMeta,
    pushHistory,
    undo,
    redo,
    canUndo: history.length > 0,
    canRedo: future.length > 0,
    dirty,
    saving,
    saveState,
    initialized,
    currentPublished,
    draftFetcher,
    /** Publish gate for pages not governed by a workflow. */
    legacyCanPublish:
      (unpublishedSave || !draftFetcher.current?.publishedAt) &&
      !!draftFetcher.current &&
      !saving,
    save,
    publishPage,
    saveAndPublish,
    saveDraftSilently,
    savedDataSources,
    instancesSaving,
    instancesDirty,
    saveDataSource,
    publishDataSource,
  };
};

export type PageDocument = ReturnType<typeof usePageDocument>;
