/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import { useMemo } from 'react';
import type { ApolloError } from '@apollo/client';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import {
  extractErrorFromGraphQlResponse,
  mapWithConcurrency,
} from '../../helpers';
import {
  COMPONENTS_CONTAINER,
  componentKey,
  type CombinedComponent,
  type ComponentAuthored,
  type ComponentRef,
} from '../../components/page-builder/types';
import { appendComponentVersion } from './envelope';
import FetchComponentInstancesQuery from './fetch-component-instances.ctp.graphql';
import UpsertComponentInstanceMutation from './upsert-component-instance.ctp.graphql';
import DeleteComponentInstanceMutation from './delete-component-instance.ctp.graphql';
import {
  useCtClient,
  useCtMutation,
  useCtQuery,
} from '../../service/transport';

type RawCustomObject<T = unknown> = {
  id: string;
  key: string;
  container: string;
  version: number;
  value: T;
};
type FetchResult<T = unknown> = {
  customObjects?: { results: RawCustomObject<T>[] } | null;
};
type FetchVars = { container: string; where: string; limit: number };
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
type DeleteResult = { deleteCustomObject?: { id: string } | null };
type DeleteVars = { container: string; key: string; version?: number | null };

const CONTAINER = COMPONENTS_CONTAINER;
const CTX = { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM };

/** CT `in (...)` predicate operand — a comma-separated list of quoted strings. */
const quoteList = (values: string[]) => values.map((v) => `"${v}"`).join(', ');

export type ComponentsByIdResult = {
  /** Keyed by CT-assigned custom-object id (what a ComponentRef stores). */
  byId: Map<string, RawCustomObject<CombinedComponent>>;
  loading: boolean;
  error?: ApolloError;
};

/**
 * LOAD: fetch the component objects a page references (by their CT ids), so the page
 * connector can inline them back into an embedded `Page` for the builder / host preview.
 */
export const useComponentInstancesByIds = (
  ids: string[]
): ComponentsByIdResult => {
  const skip = ids.length === 0;
  const { data, loading, error } = useCtQuery<
    FetchResult<CombinedComponent>,
    FetchVars
  >('page-components', FetchComponentInstancesQuery, {
    variables: {
      container: CONTAINER,
      where: `id in (${quoteList(ids)})`,
      limit: Math.max(ids.length, 1),
    },
    skip,
    context: CTX,
    fetchPolicy: 'cache-and-network',
  });

  const byId = useMemo(() => {
    const m = new Map<string, RawCustomObject<CombinedComponent>>();
    for (const r of data?.customObjects?.results ?? []) m.set(r.id, r);
    return m;
  }, [data]);

  return { byId, loading: skip ? false : loading, error };
};

export type ComponentToSync = {
  componentId: string;
  type: string;
  authored: ComponentAuthored;
};

/**
 * Imperative writer for the `page-editor-components` container. The page connector calls
 * `syncComponents` before writing a page's ref-tree (leaves-before-root), and
 * `deleteComponentsByRefIds` when a page is deleted.
 */
export const usePageComponentsUpdater = (pageId: string) => {
  const client = useCtClient('page-components');
  const [upsert] = useCtMutation<UpsertResult<CombinedComponent>, UpsertVars>(
    'page-components',
    UpsertComponentInstanceMutation
  );
  const [remove] = useCtMutation<DeleteResult, DeleteVars>(
    'page-components',
    DeleteComponentInstanceMutation
  );

  const readByWhere = async (
    where: string,
    limit: number
  ): Promise<RawCustomObject<CombinedComponent>[]> => {
    if (limit <= 0) return [];
    const { data } = await client.query<
      FetchResult<CombinedComponent>,
      FetchVars
    >({
      query: FetchComponentInstancesQuery,
      variables: { container: CONTAINER, where, limit },
      context: CTX,
      fetchPolicy: 'network-only',
    });
    return data?.customObjects?.results ?? [];
  };

  const upsertOne = (
    key: string,
    value: CombinedComponent,
    ctVersion: number | null
  ) =>
    upsert({
      context: CTX,
      variables: {
        draft: {
          container: CONTAINER,
          key,
          value: JSON.stringify(value),
          ...(ctVersion !== null ? { version: ctVersion } : {}),
        },
      },
    });

  /** Upsert one component, re-reading and re-appending on a version conflict. */
  const syncOneWithRetry = async (
    c: ComponentToSync,
    now: string,
    seed: RawCustomObject<CombinedComponent> | null,
    attempts = 3
  ): Promise<ComponentRef> => {
    let current = seed;
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      const { combined, changed } = appendComponentVersion(
        current?.value ?? null,
        c.componentId,
        c.type,
        pageId,
        c.authored,
        now
      );
      if (!changed && current) {
        return { typeId: 'key-value-document', id: current.id };
      }
      try {
        const res = await upsertOne(
          componentKey(c.componentId),
          combined,
          current?.version ?? null
        );
        const obj = res?.data?.createOrUpdateCustomObject;
        if (!obj)
          throw new Error('createOrUpdateCustomObject returned no object');
        return { typeId: 'key-value-document', id: obj.id };
      } catch (e) {
        lastErr = e;
        const rows = await readByWhere(
          `key in ("${componentKey(c.componentId)}")`,
          1
        );
        current = rows[0] ?? null;
      }
    }
    throw extractErrorFromGraphQlResponse(lastErr);
  };

  /**
   * Persist each component to its own object (appending a draft version only when content
   * changed) and return one ComponentRef per componentId. A single batch read fetches all
   * current objects; unchanged components are not rewritten.
   */
  const syncComponents = async (
    comps: ComponentToSync[]
  ): Promise<Map<string, ComponentRef>> => {
    const refs = new Map<string, ComponentRef>();
    if (comps.length === 0) return refs;
    const now = new Date().toISOString();
    const keys = comps.map((c) => componentKey(c.componentId));
    const rows = await readByWhere(`key in (${quoteList(keys)})`, keys.length);
    const byComponentId = new Map<string, RawCustomObject<CombinedComponent>>();
    for (const r of rows) byComponentId.set(r.value.draft.componentId, r);
    for (const c of comps) {
      refs.set(
        c.componentId,
        await syncOneWithRetry(c, now, byComponentId.get(c.componentId) ?? null)
      );
    }
    return refs;
  };

  /** Delete component objects named by the given CT ids (best-effort; orphan-safe). */
  const deleteComponentsByRefIds = async (refIds: string[]): Promise<void> => {
    if (refIds.length === 0) return;
    const rows = await readByWhere(
      `id in (${quoteList(refIds)})`,
      refIds.length
    );
    // Distinct objects, and each failure is already swallowed below, so these
    // overlap safely; bounded so a big orphan sweep cannot burst CT's rate limit.
    await mapWithConcurrency(rows, 5, async (r) => {
      try {
        await remove({
          context: CTX,
          variables: { container: CONTAINER, key: r.key, version: r.version },
        });
      } catch {
        // best-effort: a leftover object is a harmless orphan (an orphan sweep
        // reclaims it), never a dangling reference from a live page.
      }
    });
  };

  return { syncComponents, deleteComponentsByRefIds };
};
