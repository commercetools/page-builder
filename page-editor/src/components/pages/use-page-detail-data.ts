import { useMemo } from 'react';
import {
  usePageDraftFetcher,
  usePagePublishedFetcher,
} from '../../hooks/use-page-builder-connector';
import type { Page, PageNode } from '../page-builder/types';
import { FALLBACK_PAGE_ID, PDP_FALLBACK_ID } from './page-detail-ids';

/**
 * Every commercetools read the page-detail view needs, and the values derived
 * straight from them: the node's own PLP page, its PDP override, and the two
 * fallbacks a new page can be seeded from.
 *
 * Grouped here because they are three copies of the same shape — draft +
 * published fetcher, a state label, a version, an unpublished count — and
 * reading them interleaved with the view's rendering logic obscured that.
 */
export const usePageDetailData = (node: PageNode) => {
  // PLP live data
  const draftFetcher = usePageDraftFetcher(node.id);
  const publishedFetcher = usePagePublishedFetcher(node.id);

  // Fallback ("All categories") content — used to optionally seed a new
  // dedicated page as a copy of the fallback.
  const fallbackDraft = usePageDraftFetcher(FALLBACK_PAGE_ID);
  const fallbackContent: Page | null =
    fallbackDraft.current?.page ?? fallbackDraft.currentPublished?.page ?? null;
  const canCopyFallback =
    node.id !== FALLBACK_PAGE_ID &&
    !fallbackDraft.loading &&
    fallbackContent !== null;

  const builderState: 'published' | 'draft' | null = useMemo(() => {
    if (publishedFetcher.payload) return 'published';
    if (draftFetcher.current) return 'draft';
    return null;
  }, [publishedFetcher, draftFetcher]);

  const appVersion =
    draftFetcher.current?.appVersion ??
    publishedFetcher.payload?.appVersion ??
    null;

  const publishedAt = publishedFetcher.payload?.publishedAt ?? null;

  const lastSavedAt = useMemo(() => {
    const versions = draftFetcher.history?.versions;
    return versions?.length ? versions[versions.length - 1].savedAt : null;
  }, [draftFetcher.history]);

  const unpublishedCount = useMemo(() => {
    const versions = draftFetcher.history?.versions ?? [];
    if (!publishedAt) return versions.length;
    return versions.filter((v) => v.savedAt > publishedAt && !v.publishedAt)
      .length;
  }, [draftFetcher.history, publishedAt]);

  const recentVersions = useMemo(() => {
    const versions = draftFetcher.history?.versions ?? [];
    return [...versions].reverse().slice(0, 5);
  }, [draftFetcher.history]);

  // PDP override live data (key: pdp-<nodeId>)
  const pdpOverrideId = `pdp-${node.id}`;
  const pdpOverrideDraft = usePageDraftFetcher(pdpOverrideId);
  const pdpOverridePublished = usePagePublishedFetcher(pdpOverrideId);

  const pdpOverrideState: 'published' | 'draft' | null = useMemo(() => {
    if (pdpOverridePublished.payload) return 'published';
    if (pdpOverrideDraft.current) return 'draft';
    return null;
  }, [pdpOverridePublished, pdpOverrideDraft]);

  // Which assignment the Delete action targets, driven by the current view.

  const pdpOverrideVersion =
    pdpOverrideDraft.current?.appVersion ??
    pdpOverridePublished.payload?.appVersion ??
    null;

  const pdpOverridePublishedAt =
    pdpOverridePublished.payload?.publishedAt ?? null;

  const pdpOverrideUnpublishedCount = useMemo(() => {
    const versions = pdpOverrideDraft.history?.versions ?? [];
    if (!pdpOverridePublishedAt) return versions.length;
    return versions.filter(
      (v) => v.savedAt > pdpOverridePublishedAt && !v.publishedAt
    ).length;
  }, [pdpOverrideDraft.history, pdpOverridePublishedAt]);

  // Fallback PDP live data — "All categories"' PDP (key: pdp-cat-root), which
  // every subcategory PDP inherits from when it has no dedicated override.
  const globalPdpDraft = usePageDraftFetcher(PDP_FALLBACK_ID);
  const globalPdpPublished = usePagePublishedFetcher(PDP_FALLBACK_ID);

  const globalPdpState: 'published' | 'draft' | null = useMemo(() => {
    if (globalPdpPublished.payload) return 'published';
    if (globalPdpDraft.current) return 'draft';
    return null;
  }, [globalPdpPublished, globalPdpDraft]);

  const globalPdpVersion =
    globalPdpDraft.current?.appVersion ??
    globalPdpPublished.payload?.appVersion ??
    null;

  // Fallback PDP content — the base a category PDP override can copy from.
  const globalPdpContent: Page | null =
    globalPdpDraft.current?.page ??
    globalPdpDraft.currentPublished?.page ??
    null;
  const canCopyGlobalPdp = !globalPdpDraft.loading && globalPdpContent !== null;

  return {
    draftFetcher,
    publishedFetcher,
    fallbackContent,
    canCopyFallback,
    builderState,
    appVersion,
    publishedAt,
    lastSavedAt,
    unpublishedCount,
    recentVersions,
    pdpOverrideId,
    pdpOverrideDraft,
    pdpOverridePublished,
    pdpOverrideState,
    pdpOverrideVersion,
    pdpOverridePublishedAt,
    pdpOverrideUnpublishedCount,
    globalPdpState,
    globalPdpVersion,
    globalPdpContent,
    canCopyGlobalPdp,
  };
};
