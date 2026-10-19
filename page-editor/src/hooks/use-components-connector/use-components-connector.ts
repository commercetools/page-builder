/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import type { ApolloError } from '@apollo/client';
import { useMcQuery } from '@commercetools-frontend/application-shell-connectors';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import type {
  ComponentType,
  ComponentGroup,
} from '../../components/page-builder/types';
import FetchComponentsQuery from './fetch-components.ctp.graphql';

// Read-only: component definitions are owned by host code and synced into CT by
// `@commercetools-labs/page-builder-sync`; the MC app no longer writes this object.

const CONTAINER = 'page-editor';
const KEY = 'components';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ComponentVersion = {
  appVersion: number;
  savedAt: string;
  publishedAt: string | null;
  groups: ComponentGroup[];
  components: ComponentType[];
};

export type ComponentsHistoryPayload = {
  schemaVersion: number;
  currentVersion: number;
  versions: ComponentVersion[];
};

export type ComponentsPublishedPayload = {
  schemaVersion: number;
  appVersion: number;
  publishedAt: string;
  groups: ComponentGroup[];
  components: ComponentType[];
};

/** Combined schema v2 shape stored in the single custom object. */
type CombinedPayload = {
  schemaVersion: number;
  draft: ComponentsHistoryPayload;
  published: ComponentsPublishedPayload | null;
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

type FetchComponentsQueryResult<T = unknown> = {
  customObject?: RawCustomObject<T> | null;
};

type FetchComponentsQueryVariables = {
  container: string;
  key: string;
};

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

export type ComponentsPublishedFetcherResult = {
  payload: ComponentsPublishedPayload | null;
  ctVersion: number | null;
  loading: boolean;
  error?: ApolloError;
};

export const useComponentsPublishedFetcher =
  (): ComponentsPublishedFetcherResult => {
    const { data, error, loading } = useMcQuery<
      FetchComponentsQueryResult<CombinedPayload>,
      FetchComponentsQueryVariables
    >(FetchComponentsQuery, {
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
