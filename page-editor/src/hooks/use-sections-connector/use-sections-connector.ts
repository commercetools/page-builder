/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import type { ApolloError } from '@apollo/client';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import type { Section } from '../../components/page-builder/types';
import FetchSectionsQuery from './fetch-sections.ctp.graphql';
import { useCtQuery } from '../../service/transport';

// Read-only: section definitions are owned by host code and synced into CT by
// the page-builder service's catalog ingest; the MC app no longer writes this object.

const CONTAINER = 'page-editor';
const KEY = 'sections';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SectionsVersion = {
  appVersion: number;
  savedAt: string;
  publishedAt: string | null;
  sections: Section[];
};

export type SectionsHistoryPayload = {
  schemaVersion: number;
  currentVersion: number;
  versions: SectionsVersion[];
};

export type SectionsPublishedPayload = {
  schemaVersion: number;
  appVersion: number;
  publishedAt: string;
  sections: Section[];
};

/** Combined schema v2 shape stored in the single custom object. */
type CombinedPayload = {
  schemaVersion: number;
  draft: SectionsHistoryPayload;
  published: SectionsPublishedPayload | null;
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

type FetchSectionsQueryResult<T = unknown> = {
  customObject?: RawCustomObject<T> | null;
};

type FetchSectionsQueryVariables = {
  container: string;
  key: string;
};

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

export type SectionsPublishedFetcherResult = {
  payload: SectionsPublishedPayload | null;
  ctVersion: number | null;
  loading: boolean;
  error?: ApolloError;
};

export const useSectionsPublishedFetcher =
  (): SectionsPublishedFetcherResult => {
    const { data, error, loading } = useCtQuery<
      FetchSectionsQueryResult<CombinedPayload>,
      FetchSectionsQueryVariables
    >('sections', FetchSectionsQuery, {
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
