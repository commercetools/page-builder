/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import { useMemo } from 'react';
import type { ApolloError } from '@apollo/client';
import { useMcQuery } from '@commercetools-frontend/application-shell-connectors';
import { useMcMutation } from '@commercetools-frontend/application-shell';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import { extractErrorFromGraphQlResponse } from '../../helpers';
import type { WorkflowDefinition } from '../../components/workflows/types';
import FetchWorkflowsQuery from './fetch-workflows.ctp.graphql';
import UpsertWorkflowMutation from './upsert-workflow.ctp.graphql';
import DeleteWorkflowMutation from './delete-workflow.ctp.graphql';

const CONTAINER = 'page-editor';

const refetchQuery = {
  query: FetchWorkflowsQuery,
  variables: { container: CONTAINER, limit: 500 },
  context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
};
const workflowKey = (id: string) => `workflow-${id}`;
const WORKFLOW_KEY_RE = /^workflow-/;
const EMPTY: WorkflowDefinition[] = [];

type FetchResult = {
  customObjects?: {
    results: { key: string; value: WorkflowDefinition | null }[];
  } | null;
};
type FetchVars = { container: string; limit: number };
type UpsertVars = {
  draft: {
    container: string;
    key: string;
    value: string;
    version?: number | null;
  };
};
type UpsertResult = {
  createOrUpdateCustomObject?: { id: string; version: number } | null;
};
type DeleteVars = { container: string; key: string };
type DeleteResult = { deleteCustomObject?: { id: string } | null };

export type WorkflowsFetcherResult = {
  workflows: WorkflowDefinition[];
  loading: boolean;
  error?: ApolloError;
  refetch: () => void;
};

/** Lists every workflow definition (custom objects keyed `workflow-*`). */
export const useWorkflowsFetcher = (): WorkflowsFetcherResult => {
  const { data, loading, error, refetch } = useMcQuery<FetchResult, FetchVars>(
    FetchWorkflowsQuery,
    {
      variables: { container: CONTAINER, limit: 500 },
      context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
      fetchPolicy: 'cache-and-network',
    }
  );

  const workflows = useMemo(() => {
    const out: WorkflowDefinition[] = [];
    for (const { key, value } of data?.customObjects?.results ?? []) {
      if (!WORKFLOW_KEY_RE.test(key) || !value) continue;
      out.push(value);
    }
    out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return out;
  }, [data]);

  return {
    workflows: workflows.length ? workflows : EMPTY,
    loading,
    error,
    refetch: () => {
      void refetch();
    },
  };
};

/**
 * Create/update/delete workflow definitions. Definitions are admin-edited and
 * low-contention, so writes are blind upserts (no optimistic version); the
 * per-page runtime state snapshots steps, so a redefinition never corrupts an
 * in-flight page.
 */
export const useWorkflowUpdater = () => {
  const [upsert, { loading: saving }] = useMcMutation<UpsertResult, UpsertVars>(
    UpsertWorkflowMutation
  );
  const [del, { loading: deleting }] = useMcMutation<DeleteResult, DeleteVars>(
    DeleteWorkflowMutation
  );

  const saveWorkflow = async (def: WorkflowDefinition) => {
    try {
      await upsert({
        context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
        variables: {
          draft: {
            container: CONTAINER,
            key: workflowKey(def.id),
            value: JSON.stringify(def),
          },
        },
        refetchQueries: [refetchQuery],
      });
    } catch (graphQlResponse) {
      throw extractErrorFromGraphQlResponse(graphQlResponse);
    }
  };

  const deleteWorkflow = async (id: string) => {
    try {
      await del({
        context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
        variables: { container: CONTAINER, key: workflowKey(id) },
        refetchQueries: [refetchQuery],
      });
    } catch (graphQlResponse) {
      throw extractErrorFromGraphQlResponse(graphQlResponse);
    }
  };

  return { saving, deleting, saveWorkflow, deleteWorkflow };
};
