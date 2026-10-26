/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import type { ApolloError } from '@apollo/client';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import type {
  DataSourceType,
  DataSourceGroup,
} from '../../components/page-builder/types';
import FetchDataSourcesQuery from './fetch-data-sources.ctp.graphql';
import { useCtQuery } from '../../service/transport';

// Read-only: data-source definitions are owned by host code and synced into CT by
// the page-builder service's catalog ingest; the MC app no longer writes this object.

const CONTAINER = 'page-editor';
const KEY = 'data-sources';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** One entry in the draft history. */
export type DraftVersion = {
  appVersion: number;
  savedAt: string;
  /** ISO timestamp when this version was published; null if never published. */
  publishedAt: string | null;
  groups: DataSourceGroup[];
  sources: DataSourceType[];
};

/** Shape stored in the draft subkey. */
export type DraftHistoryPayload = {
  schemaVersion: number;
  currentVersion: number;
  versions: DraftVersion[]; // oldest → newest, capped at MAX_VERSIONS
};

/** Shape stored in the published subkey. */
export type PublishedPayload = {
  schemaVersion: number;
  appVersion: number;
  publishedAt: string;
  groups: DataSourceGroup[];
  sources: DataSourceType[];
};

/** Combined schema v2 shape stored in the single custom object. */
type CombinedPayload = {
  schemaVersion: number;
  draft: DraftHistoryPayload;
  published: PublishedPayload | null;
};

// ---------------------------------------------------------------------------
// Internal query/mutation types
// ---------------------------------------------------------------------------

type RawCustomObject<T = unknown> = {
  id: string;
  key: string;
  container: string;
  version: number;
  value: T;
  lastModifiedAt: string;
};

type FetchDataSourcesQueryResult<T = unknown> = {
  customObject?: RawCustomObject<T> | null;
};

type FetchDataSourcesQueryVariables = {
  container: string;
  key: string;
};

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

export type PublishedFetcherResult = {
  payload: PublishedPayload | null;
  ctVersion: number | null;
  loading: boolean;
  error?: ApolloError;
};

export const useDataSourcesPublishedFetcher = (): PublishedFetcherResult => {
  const { data, error, loading } = useCtQuery<
    FetchDataSourcesQueryResult<CombinedPayload>,
    FetchDataSourcesQueryVariables
  >('data-sources', FetchDataSourcesQuery, {
    variables: { container: CONTAINER, key: KEY },
    context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
  });

  return {
    payload: data?.customObject?.value?.published ?? null,
    ctVersion: data?.customObject?.version ?? null,
    loading,
    error,
  };
};
