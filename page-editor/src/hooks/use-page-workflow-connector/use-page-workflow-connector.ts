/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import type { ApolloCache, ApolloError } from '@apollo/client';
import { useMcQuery } from '@commercetools-frontend/application-shell-connectors';
import { useMcMutation } from '@commercetools-frontend/application-shell';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import { extractErrorFromGraphQlResponse } from '../../helpers';
import type { PageWorkflowState } from '../../components/workflows/types';
import FetchQuery from './fetch-page-workflow.ctp.graphql';
import UpsertMutation from './upsert-page-workflow.ctp.graphql';

const CONTAINER = 'page-editor';
const stateKey = (pageId: string) => `wfstate-${pageId}`;

type RawCustomObject<T = unknown> = {
  id: string;
  key: string;
  container: string;
  version: number;
  value: T;
  lastModifiedAt: string;
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

export type PageWorkflowFetcherResult = {
  state: PageWorkflowState | null;
  ctVersion: number | null;
  loading: boolean;
  error?: ApolloError;
};

/** Reads a page's workflow runtime state (position + append-only history). */
export const usePageWorkflowFetcher = (
  pageId: string
): PageWorkflowFetcherResult => {
  const { data, loading, error } = useMcQuery<
    FetchResult<PageWorkflowState>,
    FetchVars
  >(FetchQuery, {
    variables: { container: CONTAINER, key: stateKey(pageId) },
    context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
    fetchPolicy: 'cache-and-network',
  });

  return {
    state: data?.customObject?.value ?? null,
    ctVersion: data?.customObject?.version ?? null,
    loading,
    error,
  };
};

export const usePageWorkflowUpdater = (pageId: string) => {
  const [upsert, { loading }] = useMcMutation<
    UpsertResult<PageWorkflowState>,
    UpsertVars
  >(UpsertMutation);
  const key = stateKey(pageId);

  const savePageWorkflow = async (
    state: PageWorkflowState,
    ctVersion: number | null
  ): Promise<{ ctVersion: number | null }> => {
    try {
      const result = await upsert({
        context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
        variables: {
          draft: {
            container: CONTAINER,
            key,
            value: JSON.stringify(state),
            ...(ctVersion !== null ? { version: ctVersion } : {}),
          },
        },
        update: (
          cache: ApolloCache<unknown>,
          { data }: { data?: UpsertResult<PageWorkflowState> | null }
        ) => {
          const obj = data?.createOrUpdateCustomObject;
          if (!obj) return;
          cache.writeQuery<FetchResult<PageWorkflowState>, FetchVars>({
            query: FetchQuery,
            variables: { container: CONTAINER, key },
            data: { customObject: obj },
          });
        },
      });
      return {
        ctVersion: result?.data?.createOrUpdateCustomObject?.version ?? null,
      };
    } catch (graphQlResponse) {
      throw extractErrorFromGraphQlResponse(graphQlResponse);
    }
  };

  return { loading, savePageWorkflow };
};
