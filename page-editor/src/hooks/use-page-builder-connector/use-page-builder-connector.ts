/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import { useMemo } from 'react';
import {
  useApolloClient,
  type ApolloCache,
  type ApolloError,
} from '@apollo/client';
import { useMcQuery } from '@commercetools-frontend/application-shell-connectors';
import { useMcMutation } from '@commercetools-frontend/application-shell';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import {
  extractErrorFromGraphQlResponse,
  mapWithConcurrency,
} from '../../helpers';
import type {
  CombinedComponent,
  ComponentElement,
  ComponentRef,
  DraftPagePayload,
  DraftPageVersion,
  Page,
  PageTypeId,
  PublishedPagePayload,
  RefLayoutElement,
  RefPage,
} from '../../components/page-builder/types';
import {
  COMPONENTS_CONTAINER,
  componentKey,
  DEFAULT_SECTIONS,
  DRAFT_PAGE_CONTAINER,
  LEGACY_PAGE_CONTAINER,
  MAX_VERSIONS,
  PAGE_SCHEMA_VERSION,
  PUBLISHED_PAGE_CONTAINER,
  pageKey,
} from '../../components/page-builder/types';
import {
  useComponentInstancesByIds,
  usePageComponentsUpdater,
  type ComponentToSync,
} from '../use-page-components-connector/use-page-components-connector';
import { componentDraftHead } from '../use-page-components-connector/envelope';
import { remapPageComponentIds } from '../../components/page-builder/ids';
import FetchPageQuery from './fetch-page.ctp.graphql';
import FetchPageKeysQuery from './fetch-page-keys.ctp.graphql';
import UpsertPageMutation from './upsert-page.ctp.graphql';
import DeletePageMutation from './delete-page.ctp.graphql';

const CTX = { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM };

// ---------------------------------------------------------------------------
// Public types (names kept stable for existing consumers)
// ---------------------------------------------------------------------------

/** Version-history metadata surface consumers read (page content omitted). */
export type PageDraftHistoryPayload = {
  schemaVersion: number;
  currentVersion: number;
  pageId: string;
  versions: Array<{
    appVersion: number;
    savedAt: string;
    publishedAt: string | null;
  }>;
};
export type PagePublishedPayload = PublishedPagePayload;
export type PageMeta = { title?: string; path?: string };

// ---------------------------------------------------------------------------
// Legacy (schema v2) combined page object — still read for migration + fallback
// ---------------------------------------------------------------------------

type LegacyDraftVersion = {
  appVersion: number;
  savedAt: string;
  publishedAt: string | null;
  page: Page;
};
type LegacyCombinedPayload = {
  schemaVersion: number;
  pageType?: PageTypeId;
  title?: string;
  path?: string;
  draft: {
    schemaVersion: number;
    currentVersion: number;
    pageId: string;
    versions: LegacyDraftVersion[];
  };
  published: {
    schemaVersion: number;
    appVersion: number;
    publishedAt: string;
    pageId: string;
    page: Page;
  } | null;
};

// ---------------------------------------------------------------------------
// Internal GraphQL shapes
// ---------------------------------------------------------------------------

type RawCustomObject<T = unknown> = {
  id: string;
  key: string;
  container: string;
  version: number;
  value: T;
  lastModifiedAt?: string;
};
type FetchResult<T = unknown> = { customObject?: RawCustomObject<T> | null };
type FetchVars = { container: string; key: string };
type UpsertResult<T = unknown> = {
  createOrUpdateCustomObject?: RawCustomObject<T> | null;
};
type UpsertVars = {
  draft: {
    container: string;
    key: string;
    value: string;
    version?: number | null;
  };
};
type FetchKeysResult<T = unknown> = {
  customObjects?: { results: { key: string; value: T }[] } | null;
};
type FetchKeysVars = { container: string; limit: number };

// ---------------------------------------------------------------------------
// Pure helpers: split (Page -> refs) and join (refs -> Page)
// ---------------------------------------------------------------------------

const emptyRefPage = (): RefPage =>
  Object.fromEntries(DEFAULT_SECTIONS.map((s) => [s.id, []]));

/** Flatten a Page's components into the per-object sync payloads. */
const collectComponents = (page: Page): ComponentToSync[] => {
  const out: ComponentToSync[] = [];
  for (const layouts of Object.values(page)) {
    for (const layout of layouts) {
      for (const child of layout.children) {
        out.push({
          componentId: child.id,
          type: child.type,
          authored: {
            name: child.name,
            visibility: child.visibility,
            ...(child.style !== undefined ? { style: child.style } : {}),
            settings: child.settings,
          },
        });
      }
    }
  }
  return out;
};

/** Collect the component-object CT ids a ref-page points at. */
const collectRefIds = (refPage: RefPage | null | undefined): string[] => {
  if (!refPage) return [];
  const ids: string[] = [];
  for (const layouts of Object.values(refPage)) {
    for (const layout of layouts) {
      for (const ref of layout.children) if (ref?.id) ids.push(ref.id);
    }
  }
  return ids;
};

/** Rebuild a page tree with component children replaced by references. */
const toRefPage = (page: Page, refs: Map<string, ComponentRef>): RefPage => {
  const out: RefPage = {};
  for (const [sectionId, layouts] of Object.entries(page)) {
    out[sectionId] = layouts.map(
      (layout): RefLayoutElement => ({
        ...layout,
        children: layout.children
          .map((child) => refs.get(child.id))
          .filter((r): r is ComponentRef => r != null),
      })
    );
  }
  return out;
};

/** Inline a single ref back into a ComponentElement, or a placeholder if missing. */
const inlineComponent = (
  ref: ComponentRef,
  byId: Map<
    string,
    RawCustomObject<
      import('../../components/page-builder/types').CombinedComponent
    >
  >
): ComponentElement => {
  const raw = byId.get(ref.id);
  if (!raw) {
    return {
      id: `missing-${ref.id}`,
      type: 'unknown',
      name: { 'en-US': 'Missing component' },
      visibility: { mobile: true, tablet: true, desktop: true },
      settings: { __missing: true, __refId: ref.id },
    };
  }
  const head = componentDraftHead(raw.value);
  return {
    id: raw.value.draft.componentId,
    type: raw.value.type,
    name: head?.name ?? {},
    visibility: head?.visibility ?? {
      mobile: true,
      tablet: true,
      desktop: true,
    },
    ...(head?.style !== undefined ? { style: head.style } : {}),
    settings: head?.settings ?? {},
  };
};

/** Join a stored ref-page into an embedded Page the builder/preview can render. */
const inlineRefPage = (
  refPage: RefPage,
  byId: Map<
    string,
    RawCustomObject<
      import('../../components/page-builder/types').CombinedComponent
    >
  >
): Page => {
  const out: Page = {};
  for (const [sectionId, layouts] of Object.entries(refPage)) {
    out[sectionId] = layouts.map((layout) => ({
      ...layout,
      children: layout.children.map((ref) => inlineComponent(ref, byId)),
    }));
  }
  return out;
};

const legacyDraftHead = (v: LegacyCombinedPayload): LegacyDraftVersion | null =>
  v.draft.versions.length
    ? v.draft.versions[v.draft.versions.length - 1]
    : null;

const legacyPublishedToPayload = (
  v: LegacyCombinedPayload
): PublishedPagePayload | null =>
  v.published
    ? {
        schemaVersion: v.published.schemaVersion,
        ...(v.pageType !== undefined ? { pageType: v.pageType } : {}),
        ...(v.title !== undefined ? { title: v.title } : {}),
        ...(v.path !== undefined ? { path: v.path } : {}),
        appVersion: v.published.appVersion,
        publishedAt: v.published.publishedAt,
        pageId: v.published.pageId,
        page: v.published.page,
      }
    : null;

// ---------------------------------------------------------------------------
// Draft fetcher (join) + migration detection
// ---------------------------------------------------------------------------

export type PageDraftFetcherResult = {
  current: {
    page: Page;
    appVersion: number;
    publishedAt: string | null;
  } | null;
  history: PageDraftHistoryPayload | null;
  currentPublished: PagePublishedPayload | null;
  pageType: PageTypeId | undefined;
  title: string | undefined;
  path: string | undefined;
  /** True when this page still uses the pre-v3 embedded shape and must be migrated. */
  needsMigration: boolean;
  /** The raw legacy object (present only when needsMigration) — input to the migrator. */
  legacy: { value: LegacyCombinedPayload; ctVersion: number } | null;
  ctVersion: number | null;
  loading: boolean;
  error?: ApolloError;
};

export const usePageDraftFetcher = (pageId: string): PageDraftFetcherResult => {
  const draftQ = useMcQuery<FetchResult<DraftPagePayload>, FetchVars>(
    FetchPageQuery,
    {
      variables: { container: DRAFT_PAGE_CONTAINER, key: pageKey(pageId) },
      context: CTX,
      fetchPolicy: 'cache-and-network',
    }
  );
  const draftObj = draftQ.data?.customObject ?? null;
  const draftValue = draftObj?.value ?? null;
  const draftHeadVersion: DraftPageVersion | null = draftValue
    ? draftValue.draft.versions[draftValue.draft.versions.length - 1] ?? null
    : null;

  // Phase 2: fetch the components the draft head references (skipped when none).
  const refIds = useMemo(
    () => collectRefIds(draftHeadVersion?.page),
    [draftHeadVersion]
  );
  const { byId, loading: compsLoading } = useComponentInstancesByIds(refIds);

  // Published container (self-contained inline snapshot).
  const publishedQ = useMcQuery<FetchResult<PublishedPagePayload>, FetchVars>(
    FetchPageQuery,
    {
      variables: { container: PUBLISHED_PAGE_CONTAINER, key: pageKey(pageId) },
      context: CTX,
      fetchPolicy: 'cache-and-network',
    }
  );
  const publishedObj = publishedQ.data?.customObject ?? null;

  // Legacy container — only consulted when the page is not (yet) in the draft container.
  const draftPresent = !!draftObj;
  const legacyQ = useMcQuery<FetchResult<LegacyCombinedPayload>, FetchVars>(
    FetchPageQuery,
    {
      variables: { container: LEGACY_PAGE_CONTAINER, key: pageKey(pageId) },
      context: CTX,
      fetchPolicy: 'cache-and-network',
      skip: draftQ.loading || draftPresent,
    }
  );
  const legacyObj = legacyQ.data?.customObject ?? null;
  const legacyValue = legacyObj?.value ?? null;

  return useMemo<PageDraftFetcherResult>(() => {
    // ── New (v3) shape ──────────────────────────────────────────────────
    if (draftValue && draftHeadVersion) {
      const currentPublished = publishedObj?.value ?? null;
      return {
        current: {
          page: inlineRefPage(draftHeadVersion.page, byId),
          appVersion: draftHeadVersion.appVersion,
          publishedAt: draftHeadVersion.publishedAt,
        },
        history: draftValue.draft as unknown as PageDraftHistoryPayload,
        currentPublished,
        pageType: draftValue.pageType,
        title: draftValue.title,
        path: draftValue.path,
        needsMigration: false,
        legacy: null,
        ctVersion: draftObj?.version ?? null,
        loading: draftQ.loading || compsLoading,
        error: draftQ.error,
      };
    }
    // ── Legacy (v2) shape — surface content but flag for forced migration ──
    if (legacyValue) {
      const head = legacyDraftHead(legacyValue);
      return {
        current: head
          ? {
              page: head.page,
              appVersion: head.appVersion,
              publishedAt: head.publishedAt,
            }
          : null,
        history: legacyValue.draft as unknown as PageDraftHistoryPayload,
        currentPublished: legacyPublishedToPayload(legacyValue),
        pageType: legacyValue.pageType,
        title: legacyValue.title,
        path: legacyValue.path,
        needsMigration: true,
        legacy: { value: legacyValue, ctVersion: legacyObj!.version },
        ctVersion: legacyObj?.version ?? null,
        loading: legacyQ.loading,
        error: legacyQ.error,
      };
    }
    // ── Nothing yet (new page, or still loading) ────────────────────────
    return {
      current: null,
      history: null,
      currentPublished: publishedObj?.value ?? null,
      pageType: undefined,
      title: undefined,
      path: undefined,
      needsMigration: false,
      legacy: null,
      ctVersion: null,
      loading: draftQ.loading || legacyQ.loading,
      error: draftQ.error ?? legacyQ.error,
    };
  }, [
    draftValue,
    draftHeadVersion,
    draftObj,
    byId,
    publishedObj,
    legacyValue,
    legacyObj,
    draftQ.loading,
    compsLoading,
    legacyQ.loading,
    draftQ.error,
    legacyQ.error,
  ]);
};

// ---------------------------------------------------------------------------
// Published fetcher (reads the published container; legacy fallback)
// ---------------------------------------------------------------------------

export type PagePublishedFetcherResult = {
  payload: PagePublishedPayload | null;
  ctVersion: number | null;
  loading: boolean;
  error?: ApolloError;
};

export const usePagePublishedFetcher = (
  pageId: string
): PagePublishedFetcherResult => {
  const publishedQ = useMcQuery<FetchResult<PublishedPagePayload>, FetchVars>(
    FetchPageQuery,
    {
      variables: { container: PUBLISHED_PAGE_CONTAINER, key: pageKey(pageId) },
      context: CTX,
      fetchPolicy: 'cache-and-network',
    }
  );
  const publishedObj = publishedQ.data?.customObject ?? null;

  const legacyQ = useMcQuery<FetchResult<LegacyCombinedPayload>, FetchVars>(
    FetchPageQuery,
    {
      variables: { container: LEGACY_PAGE_CONTAINER, key: pageKey(pageId) },
      context: CTX,
      fetchPolicy: 'cache-and-network',
      skip: publishedQ.loading || !!publishedObj,
    }
  );
  const legacyValue = legacyQ.data?.customObject?.value ?? null;

  if (publishedObj) {
    return {
      payload: publishedObj.value,
      ctVersion: publishedObj.version,
      loading: publishedQ.loading,
      error: publishedQ.error,
    };
  }
  return {
    payload: legacyValue ? legacyPublishedToPayload(legacyValue) : null,
    ctVersion: null,
    loading: publishedQ.loading || legacyQ.loading,
    error: publishedQ.error ?? legacyQ.error,
  };
};

// ---------------------------------------------------------------------------
// Built-page listing (draft + legacy containers merged)
// ---------------------------------------------------------------------------

export type BuiltPage = {
  pageId: string;
  state: 'draft' | 'published';
  pageType?: PageTypeId;
  title?: string;
  path?: string;
};

export const useBuiltPageIds = (): {
  pageStates: Map<string, 'draft' | 'published'>;
  pages: BuiltPage[];
  /** Page ids still stored in the legacy (pre-v3) container — candidates for migration. */
  legacyPageIds: string[];
  loading: boolean;
} => {
  const draftQ = useMcQuery<FetchKeysResult<DraftPagePayload>, FetchKeysVars>(
    FetchPageKeysQuery,
    { variables: { container: DRAFT_PAGE_CONTAINER, limit: 500 }, context: CTX }
  );
  const legacyQ = useMcQuery<
    FetchKeysResult<LegacyCombinedPayload>,
    FetchKeysVars
  >(FetchPageKeysQuery, {
    variables: { container: LEGACY_PAGE_CONTAINER, limit: 500 },
    context: CTX,
  });

  const { pageStates, pages, legacyPageIds } = useMemo(() => {
    const pageStates = new Map<string, 'draft' | 'published'>();
    const pages: BuiltPage[] = [];
    const legacyPageIds: string[] = [];
    const seen = new Set<string>();

    // Draft container wins over legacy (a migrated page).
    for (const { key, value } of draftQ.data?.customObjects?.results ?? []) {
      const m = key.match(/^page-(.+)$/);
      if (!m) continue;
      const id = m[1];
      seen.add(id);
      const state: 'draft' | 'published' = value?.publishedAt
        ? 'published'
        : 'draft';
      if (!pageStates.has(id)) pageStates.set(id, state);
      pages.push({
        pageId: id,
        state,
        pageType: value?.pageType,
        title: value?.title,
        path: value?.path,
      });
    }
    for (const { key, value } of legacyQ.data?.customObjects?.results ?? []) {
      const m = key.match(/^page-(.+)$/);
      if (!m) continue;
      const id = m[1];
      if (seen.has(id)) continue;
      legacyPageIds.push(id);
      const state: 'draft' | 'published' =
        value?.published != null ? 'published' : 'draft';
      if (!pageStates.has(id)) pageStates.set(id, state);
      pages.push({
        pageId: id,
        state,
        pageType: value?.pageType,
        title: value?.title,
        path: value?.path,
      });
    }
    return { pageStates, pages, legacyPageIds };
  }, [draftQ.data, legacyQ.data]);

  return {
    pageStates,
    pages,
    legacyPageIds,
    loading: draftQ.loading || legacyQ.loading,
  };
};

// ---------------------------------------------------------------------------
// Updater: save draft / publish (internal read-modify-write + component split)
// ---------------------------------------------------------------------------

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw extractErrorFromGraphQlResponse(lastErr);
}

export const usePageUpdater = (pageId: string) => {
  const client = useApolloClient();
  const [upsert, { loading }] = useMcMutation<UpsertResult, UpsertVars>(
    UpsertPageMutation
  );
  const { syncComponents } = usePageComponentsUpdater(pageId);
  const key = pageKey(pageId);

  const readObject = async <T>(
    container: string
  ): Promise<{ value: T | null; ctVersion: number | null }> => {
    const { data } = await client.query<FetchResult<T>, FetchVars>({
      query: FetchPageQuery,
      variables: { container, key },
      context: CTX,
      fetchPolicy: 'network-only',
    });
    const co = data?.customObject ?? null;
    return { value: co?.value ?? null, ctVersion: co?.version ?? null };
  };

  const writeObject = <T>(
    container: string,
    value: T,
    ctVersion: number | null
  ) =>
    upsert({
      context: CTX,
      variables: {
        draft: {
          container,
          key,
          value: JSON.stringify(value),
          ...(ctVersion !== null ? { version: ctVersion } : {}),
        },
      },
      update: (
        cache: ApolloCache<unknown>,
        { data }: { data?: UpsertResult | null }
      ) => {
        const obj = data?.createOrUpdateCustomObject;
        if (!obj) return;
        cache.writeQuery<FetchResult, FetchVars>({
          query: FetchPageQuery,
          variables: { container, key },
          data: { customObject: obj },
        });
      },
    });

  /** Persist the current page as a new draft version (splits components first). */
  const saveDraft = async (
    page: Page,
    _history: PageDraftHistoryPayload | null,
    _currentPublished: PagePublishedPayload | null,
    _ctVersion: number | null,
    pageType?: PageTypeId,
    meta?: PageMeta
  ) => {
    // Leaves-before-root: write component objects, then the page ref-tree.
    const refs = await syncComponents(collectComponents(page));
    const refPage = toRefPage(page, refs);
    const savedAt = new Date().toISOString();

    const obj = await withRetry(async () => {
      const { value, ctVersion } = await readObject<DraftPagePayload>(
        DRAFT_PAGE_CONTAINER
      );
      const prevVersions = value?.draft.versions ?? [];
      const nextAppVersion = (value?.draft.currentVersion ?? 0) + 1;
      const newVersion: DraftPageVersion = {
        appVersion: nextAppVersion,
        savedAt,
        publishedAt: null,
        page: refPage,
      };
      const next: DraftPagePayload = {
        schemaVersion: PAGE_SCHEMA_VERSION,
        ...(pageType !== undefined ? { pageType } : {}),
        ...(meta?.title !== undefined ? { title: meta.title } : {}),
        ...(meta?.path !== undefined ? { path: meta.path } : {}),
        ...(value?.publishedAt !== undefined
          ? { publishedAt: value.publishedAt }
          : {}),
        draft: {
          schemaVersion: PAGE_SCHEMA_VERSION,
          currentVersion: nextAppVersion,
          pageId,
          versions: [...prevVersions, newVersion].slice(-MAX_VERSIONS),
        },
      };
      const res = await writeObject(DRAFT_PAGE_CONTAINER, next, ctVersion);
      return res?.data?.createOrUpdateCustomObject ?? null;
    });

    const value = obj?.value as DraftPagePayload | undefined;
    return {
      ctVersion: obj?.version ?? null,
      history: (value?.draft ?? null) as PageDraftHistoryPayload | null,
      appVersion: value?.draft.currentVersion ?? null,
    };
  };

  /** Save the draft, then freeze the current page inline into the published container. */
  const publish = async (
    page: Page,
    history: PageDraftHistoryPayload | null,
    ctVersion: number | null,
    pageType?: PageTypeId,
    meta?: PageMeta
  ) => {
    const saved = await saveDraft(
      page,
      history,
      null,
      ctVersion,
      pageType,
      meta
    );
    const publishedAt = new Date().toISOString();

    // Frozen inline snapshot — the in-memory page already carries full component content.
    const publishedPayload: PublishedPagePayload = {
      schemaVersion: PAGE_SCHEMA_VERSION,
      ...(pageType !== undefined ? { pageType } : {}),
      ...(meta?.title !== undefined ? { title: meta.title } : {}),
      ...(meta?.path !== undefined ? { path: meta.path } : {}),
      appVersion: saved.appVersion ?? 1,
      publishedAt,
      pageId,
      page,
    };
    await withRetry(async () => {
      const { ctVersion: pubVersion } = await readObject<PublishedPagePayload>(
        PUBLISHED_PAGE_CONTAINER
      );
      return writeObject(
        PUBLISHED_PAGE_CONTAINER,
        publishedPayload,
        pubVersion
      );
    });

    // Stamp the draft's published marker + the head version's publishedAt.
    const draftObj = await withRetry(async () => {
      const { value, ctVersion: dv } = await readObject<DraftPagePayload>(
        DRAFT_PAGE_CONTAINER
      );
      if (!value) return null;
      const versions = value.draft.versions.map((v, i) =>
        i === value.draft.versions.length - 1 ? { ...v, publishedAt } : v
      );
      const next: DraftPagePayload = {
        ...value,
        publishedAt,
        draft: { ...value.draft, versions },
      };
      const res = await writeObject(DRAFT_PAGE_CONTAINER, next, dv);
      return res?.data?.createOrUpdateCustomObject ?? null;
    });

    const dval = draftObj?.value as DraftPagePayload | undefined;
    return {
      ctVersion: draftObj?.version ?? saved.ctVersion,
      history: (dval?.draft ?? saved.history) as PageDraftHistoryPayload | null,
      published: publishedPayload,
      appVersion: saved.appVersion,
    };
  };

  return { loading, saveDraft, publish };
};

// ---------------------------------------------------------------------------
// Deleter: cascade across draft + published + component objects + legacy
// ---------------------------------------------------------------------------

export const usePageDeleter = (pageId: string) => {
  const client = useApolloClient();
  const [deleteMutation, { loading }] = useMcMutation<
    { deleteCustomObject?: { id: string } | null },
    { container: string; key: string; version?: number | null }
  >(DeletePageMutation);
  const { deleteComponentsByRefIds } = usePageComponentsUpdater(pageId);
  const key = pageKey(pageId);

  const readVersion = async (
    container: string
  ): Promise<{ version: number; value: unknown } | null> => {
    const { data } = await client.query<FetchResult, FetchVars>({
      query: FetchPageQuery,
      variables: { container, key },
      context: CTX,
      fetchPolicy: 'network-only',
    });
    const co = data?.customObject ?? null;
    return co ? { version: co.version, value: co.value } : null;
  };

  const delObject = (container: string, version: number | null) =>
    deleteMutation({
      context: CTX,
      variables: { container, key, ...(version !== null ? { version } : {}) },
      update: (cache: ApolloCache<unknown>) => {
        cache.writeQuery<FetchResult, FetchVars>({
          query: FetchPageQuery,
          variables: { container, key },
          data: { customObject: null },
        });
      },
    });

  const deletePage = async (_ctVersion?: number | null) => {
    try {
      // Draft container (+ its component objects).
      const draft = await readVersion(DRAFT_PAGE_CONTAINER);
      if (draft) {
        const draftValue = draft.value as DraftPagePayload;
        const head =
          draftValue.draft.versions[draftValue.draft.versions.length - 1];
        await deleteComponentsByRefIds(collectRefIds(head?.page));
        await delObject(DRAFT_PAGE_CONTAINER, draft.version);
      }
      // Published container.
      const published = await readVersion(PUBLISHED_PAGE_CONTAINER);
      if (published)
        await delObject(PUBLISHED_PAGE_CONTAINER, published.version);
      // Legacy combined object (unmigrated pages).
      const legacy = await readVersion(LEGACY_PAGE_CONTAINER);
      if (legacy) await delObject(LEGACY_PAGE_CONTAINER, legacy.version);

      // Refresh the pages list.
      await Promise.all(
        [DRAFT_PAGE_CONTAINER, LEGACY_PAGE_CONTAINER].map((container) =>
          client.query({
            query: FetchPageKeysQuery,
            variables: { container, limit: 500 },
            context: CTX,
            fetchPolicy: 'network-only',
          })
        )
      );
    } catch (graphQlResponse) {
      throw extractErrorFromGraphQlResponse(graphQlResponse);
    }
  };

  return { loading, deletePage };
};

// ---------------------------------------------------------------------------
// Creator (empty draft page in the draft container)
// ---------------------------------------------------------------------------

export const useCreatePage = () => {
  const [upsert, { loading }] = useMcMutation<UpsertResult, UpsertVars>(
    UpsertPageMutation
  );

  const createPage = async (
    pageId: string,
    opts: { title?: string; path?: string; pageType?: PageTypeId }
  ) => {
    const savedAt = new Date().toISOString();
    const value: DraftPagePayload = {
      schemaVersion: PAGE_SCHEMA_VERSION,
      ...(opts.pageType !== undefined ? { pageType: opts.pageType } : {}),
      ...(opts.title !== undefined ? { title: opts.title } : {}),
      ...(opts.path !== undefined ? { path: opts.path } : {}),
      draft: {
        schemaVersion: PAGE_SCHEMA_VERSION,
        currentVersion: 1,
        pageId,
        versions: [
          { appVersion: 1, savedAt, publishedAt: null, page: emptyRefPage() },
        ],
      },
    };
    try {
      return await upsert({
        context: CTX,
        variables: {
          draft: {
            container: DRAFT_PAGE_CONTAINER,
            key: pageKey(pageId),
            value: JSON.stringify(value),
          },
        },
        update: (
          cache: ApolloCache<unknown>,
          { data }: { data?: UpsertResult<DraftPagePayload> | null }
        ) => {
          const obj = data?.createOrUpdateCustomObject;
          if (!obj) return;
          cache.writeQuery<FetchResult<DraftPagePayload>, FetchVars>({
            query: FetchPageQuery,
            variables: {
              container: DRAFT_PAGE_CONTAINER,
              key: pageKey(pageId),
            },
            data: { customObject: obj },
          });
        },
        refetchQueries: [
          {
            query: FetchPageKeysQuery,
            variables: { container: DRAFT_PAGE_CONTAINER, limit: 500 },
            context: CTX,
          },
        ],
      });
    } catch (graphQlResponse) {
      throw extractErrorFromGraphQlResponse(graphQlResponse);
    }
  };

  return { loading, createPage };
};

// ---------------------------------------------------------------------------
// Migration: one-time split of a legacy combined object into v3 objects
// ---------------------------------------------------------------------------

/** The writes a migration needs — abstracted so the single-page and bulk migrators share
 * one algorithm. `upsert` resolves to the created object's CT-assigned id. */
type MigrationIo = {
  upsert: (container: string, key: string, value: unknown) => Promise<string>;
  remove: (
    container: string,
    key: string,
    version: number | null
  ) => Promise<void>;
};

/**
 * Split ONE legacy combined page into v3 objects — a component object per instance
 * (`page-editor-components`), a draft page whose children are references
 * (`page-editor-draft`), and the inline published snapshot (`page-editor-published`) — then
 * delete the legacy object. Legacy component ids are page-local, so every component gets a
 * fresh globally-unique id. Older legacy draft history is collapsed to the head.
 */
async function migrateLegacyPageToV3(
  pageId: string,
  legacyValue: LegacyCombinedPayload,
  legacyCtVersion: number | null,
  io: MigrationIo
): Promise<void> {
  const head = legacyDraftHead(legacyValue);
  const embedded: Page =
    head?.page ??
    (Object.fromEntries(DEFAULT_SECTIONS.map((s) => [s.id, []])) as Page);
  const now = new Date().toISOString();

  // 1. Split the draft head's components into their own objects (fresh ids).
  const remapped = remapPageComponentIds(embedded);
  const refs = new Map<string, ComponentRef>();
  // Each component gets a freshly minted, globally-unique id, so no iteration
  // depends on another; overlap them, but bounded so a large page cannot burst
  // past CT's rate limit.
  const components = collectComponents(remapped);
  const ids = await mapWithConcurrency(components, 5, async (comp) => {
    const value: CombinedComponent = {
      schemaVersion: PAGE_SCHEMA_VERSION,
      type: comp.type,
      pageId,
      draft: {
        schemaVersion: PAGE_SCHEMA_VERSION,
        currentVersion: 1,
        componentId: comp.componentId,
        versions: [
          {
            appVersion: 1,
            savedAt: head?.savedAt ?? now,
            publishedAt: head?.publishedAt ?? null,
            ...comp.authored,
          },
        ],
      },
    };
    return io.upsert(
      COMPONENTS_CONTAINER,
      componentKey(comp.componentId),
      value
    );
  });
  components.forEach((comp, i) => {
    refs.set(comp.componentId, { typeId: 'key-value-document', id: ids[i] });
  });
  const refPage = toRefPage(remapped, refs);

  // 2. Draft object (v3), collapsing legacy history to the head.
  const draftValue: DraftPagePayload = {
    schemaVersion: PAGE_SCHEMA_VERSION,
    ...(legacyValue.pageType !== undefined
      ? { pageType: legacyValue.pageType }
      : {}),
    ...(legacyValue.title !== undefined ? { title: legacyValue.title } : {}),
    ...(legacyValue.path !== undefined ? { path: legacyValue.path } : {}),
    ...(legacyValue.published
      ? { publishedAt: legacyValue.published.publishedAt }
      : {}),
    draft: {
      schemaVersion: PAGE_SCHEMA_VERSION,
      currentVersion: 1,
      pageId,
      versions: [
        {
          appVersion: 1,
          savedAt: head?.savedAt ?? now,
          publishedAt: head?.publishedAt ?? null,
          page: refPage,
        },
      ],
    },
  };
  await io.upsert(DRAFT_PAGE_CONTAINER, pageKey(pageId), draftValue);

  // 3. Published object — the legacy published page is already inline (frozen).
  if (legacyValue.published) {
    const publishedValue: PublishedPagePayload = {
      schemaVersion: PAGE_SCHEMA_VERSION,
      ...(legacyValue.pageType !== undefined
        ? { pageType: legacyValue.pageType }
        : {}),
      ...(legacyValue.title !== undefined ? { title: legacyValue.title } : {}),
      ...(legacyValue.path !== undefined ? { path: legacyValue.path } : {}),
      appVersion: legacyValue.published.appVersion,
      publishedAt: legacyValue.published.publishedAt,
      pageId,
      page: legacyValue.published.page,
    };
    await io.upsert(PUBLISHED_PAGE_CONTAINER, pageKey(pageId), publishedValue);
  }

  // 4. Delete the legacy combined object.
  await io.remove(LEGACY_PAGE_CONTAINER, pageKey(pageId), legacyCtVersion);
}

export type MigrateAllResult = {
  total: number;
  migrated: number;
  failed: { pageId: string; error: string }[];
};

/**
 * Bulk migrator (the Pages list). Discovers every page still in the legacy container and
 * migrates each; returns per-page results. Idempotent — a page whose legacy object is already
 * gone is skipped, so it's safe to re-run.
 */
export const useMigrateAllPages = () => {
  const client = useApolloClient();
  const [upsert, { loading }] = useMcMutation<UpsertResult, UpsertVars>(
    UpsertPageMutation
  );
  const [remove] = useMcMutation<
    { deleteCustomObject?: { id: string } | null },
    { container: string; key: string; version?: number | null }
  >(DeletePageMutation);

  const io: MigrationIo = {
    upsert: async (container, key, value) => {
      const res = await upsert({
        context: CTX,
        variables: { draft: { container, key, value: JSON.stringify(value) } },
      });
      const obj = res?.data?.createOrUpdateCustomObject;
      if (!obj)
        throw new Error('createOrUpdateCustomObject returned no object');
      return obj.id;
    },
    remove: async (container, key, version) => {
      await remove({
        context: CTX,
        variables: { container, key, ...(version !== null ? { version } : {}) },
      });
    },
  };

  const migrateAll = async (
    onProgress?: (done: number, total: number) => void
  ): Promise<MigrateAllResult> => {
    // Discover legacy pages, plus which ids already exist in the draft container (migrated,
    // e.g. by editing in the builder) so we never re-migrate and clobber newer content.
    const [legacyKeys, draftKeys] = await Promise.all([
      client.query<FetchKeysResult<LegacyCombinedPayload>, FetchKeysVars>({
        query: FetchPageKeysQuery,
        variables: { container: LEGACY_PAGE_CONTAINER, limit: 500 },
        context: CTX,
        fetchPolicy: 'network-only',
      }),
      client.query<FetchKeysResult<DraftPagePayload>, FetchKeysVars>({
        query: FetchPageKeysQuery,
        variables: { container: DRAFT_PAGE_CONTAINER, limit: 500 },
        context: CTX,
        fetchPolicy: 'network-only',
      }),
    ]);
    const ids = (legacyKeys.data?.customObjects?.results ?? [])
      .map((r) => r.key.match(/^page-(.+)$/)?.[1])
      .filter((x): x is string => !!x);
    const alreadyMigrated = new Set(
      (draftKeys.data?.customObjects?.results ?? [])
        .map((r) => r.key.match(/^page-(.+)$/)?.[1])
        .filter((x): x is string => !!x)
    );

    const result: MigrateAllResult = {
      total: ids.length,
      migrated: 0,
      failed: [],
    };
    for (let i = 0; i < ids.length; i++) {
      const pageId = ids[i];
      try {
        // Re-read the full object for value + version; skip if already migrated/gone.
        const { data: pd } = await client.query<
          FetchResult<LegacyCombinedPayload>,
          FetchVars
        >({
          query: FetchPageQuery,
          variables: { container: LEGACY_PAGE_CONTAINER, key: pageKey(pageId) },
          context: CTX,
          fetchPolicy: 'network-only',
        });
        const co = pd?.customObject;
        if (co) {
          if (alreadyMigrated.has(pageId)) {
            // Already migrated (e.g. edited in the builder) — just drop the stale legacy object.
            await io.remove(LEGACY_PAGE_CONTAINER, pageKey(pageId), co.version);
          } else {
            await migrateLegacyPageToV3(pageId, co.value, co.version, io);
          }
          result.migrated++;
        }
      } catch (e) {
        result.failed.push({
          pageId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      onProgress?.(i + 1, ids.length);
    }

    // Refresh the list queries so the UI reflects the new state.
    await Promise.all(
      [DRAFT_PAGE_CONTAINER, LEGACY_PAGE_CONTAINER].map((container) =>
        client.query({
          query: FetchPageKeysQuery,
          variables: { container, limit: 500 },
          context: CTX,
          fetchPolicy: 'network-only',
        })
      )
    );
    return result;
  };

  return { loading, migrateAll };
};
