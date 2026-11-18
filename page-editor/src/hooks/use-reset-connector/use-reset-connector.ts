/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import { useCallback, useEffect, useState } from 'react';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import {
  COMPONENTS_CONTAINER,
  DRAFT_PAGE_CONTAINER,
  LEGACY_PAGE_CONTAINER,
  PUBLISHED_PAGE_CONTAINER,
} from '../../components/page-builder/types';
import FetchContainerObjectsQuery from './fetch-container-objects.ctp.graphql';
import DeleteCustomObjectMutation from './delete-custom-object.ctp.graphql';
import {
  useCtClient,
  useCtMutation,
  useServiceClient,
} from '../../service/transport';
import { HOST_OWNED_KEYS } from '../../service/host-owned';

const CTX = { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM };

/** commercetools caps the `customObjects` query at 500 results per request. */
const PAGE_SIZE = 500;
/** How many deletes to fire concurrently, to avoid hammering the gateway. */
const DELETE_BATCH = 25;

export type ResetContainer = {
  /** The commercetools custom-object container name. */
  container: string;
  /** What kind of data lives in the container (shown next to the checkbox). */
  description: string;
};

/**
 * Every custom-object container this app owns and may safely wipe.
 */
export const RESET_CONTAINERS: ResetContainer[] = [
  {
    container: LEGACY_PAGE_CONTAINER,
    description:
      'Component & data-source catalogs, sections, comments, workflows, data-source instances, preview settings (and any pre-v3 pages).',
  },
  {
    container: DRAFT_PAGE_CONTAINER,
    description: 'Work-in-progress page drafts and their version history.',
  },
  {
    container: PUBLISHED_PAGE_CONTAINER,
    description: 'Published page snapshots served to the storefront.',
  },
  {
    container: COMPONENTS_CONTAINER,
    description: 'Per-page component-instance records referenced by drafts.',
  },
];

type FetchResult = {
  customObjects?: {
    total: number;
    results: Array<{ key: string }>;
  } | null;
};
type FetchVars = { container: string; limit: number; offset: number };

export type ResetConnector = {
  /** Object count per container name; empty until the first load resolves. */
  counts: Record<string, number>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /**
   * Delete every object in each given container. Resolves with the number of
   * objects deleted per container. Always refreshes counts afterwards, even on
   * partial failure.
   */
  resetContainers: (containers: string[]) => Promise<Record<string, number>>;
};

export const useResetConnector = (): ResetConnector => {
  const client = useCtClient('reset');
  // The service owns the host catalog (it changes only through catalog ingest) and refuses to
  // delete it, so through the service a reset leaves those objects alone and does not count them.
  const skipHostOwned = useServiceClient('reset') !== null;
  const isResettable = useCallback(
    (container: string, key: string) =>
      !(
        skipHostOwned &&
        container === LEGACY_PAGE_CONTAINER &&
        HOST_OWNED_KEYS.includes(key)
      ),
    [skipHostOwned]
  );
  const [deleteObject] = useCtMutation<
    { deleteCustomObject?: { id: string } | null },
    { container: string; key: string }
  >('reset', DeleteCustomObjectMutation);

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Read every object key in a container, paging past the 500-per-request cap. */
  const fetchAllKeys = useCallback(
    async (container: string): Promise<string[]> => {
      const keys: string[] = [];
      let seen = 0;
      let offset = 0;
      for (;;) {
        const { data } = await client.query<FetchResult, FetchVars>({
          query: FetchContainerObjectsQuery,
          variables: { container, limit: PAGE_SIZE, offset },
          context: CTX,
          fetchPolicy: 'network-only',
        });
        const page = data?.customObjects?.results ?? [];
        seen += page.length;
        keys.push(
          ...page
            .map((o) => o.key)
            .filter((key) => isResettable(container, key))
        );
        const total = data?.customObjects?.total ?? seen;
        offset += PAGE_SIZE;
        if (page.length === 0 || seen >= total) break;
      }
      return keys;
    },
    [client, isResettable]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entries = await Promise.all(
        RESET_CONTAINERS.map(async ({ container }) => {
          // Only the container that holds host-owned objects needs its keys read to count fairly.
          if (skipHostOwned && container === LEGACY_PAGE_CONTAINER) {
            return [container, (await fetchAllKeys(container)).length] as const;
          }
          const { data } = await client.query<FetchResult, FetchVars>({
            query: FetchContainerObjectsQuery,
            // We only need `total`; keep the payload tiny.
            variables: { container, limit: 1, offset: 0 },
            context: CTX,
            fetchPolicy: 'network-only',
          });
          return [container, data?.customObjects?.total ?? 0] as const;
        })
      );
      setCounts(Object.fromEntries(entries));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to load container contents.'
      );
    } finally {
      setLoading(false);
    }
  }, [client, skipHostOwned, fetchAllKeys]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resetContainers = useCallback(
    async (containers: string[]): Promise<Record<string, number>> => {
      const deleted: Record<string, number> = {};
      try {
        for (const container of containers) {
          const keys = await fetchAllKeys(container);
          for (let i = 0; i < keys.length; i += DELETE_BATCH) {
            const batch = keys.slice(i, i + DELETE_BATCH);
            await Promise.all(
              batch.map((key) =>
                deleteObject({ context: CTX, variables: { container, key } })
              )
            );
          }
          deleted[container] = keys.length;
        }
        return deleted;
      } finally {
        await refresh();
      }
    },
    [deleteObject, fetchAllKeys, refresh]
  );

  return { counts, loading, error, refresh, resetContainers };
};
