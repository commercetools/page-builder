/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import type { ApolloError } from '@apollo/client';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import { extractErrorFromGraphQlResponse } from '../../helpers';
import type { SavedDataSource } from '../../components/page-builder/types';
import FetchQuery from './fetch-data-source-instances.ctp.graphql';
import UpsertMutation from './upsert-data-source-instances.ctp.graphql';
import { useCtMutation, useCtQuery } from '../../service/transport';

const CONTAINER = 'page-editor';
const KEY = 'data-source-instances';
const SCHEMA_VERSION = 2;

export type InstancesPayload = {
  schemaVersion: number;
  instances: SavedDataSource[];
};

/** Combined schema v2 shape stored in the single custom object. */
type CombinedPayload = {
  schemaVersion: number;
  draft: InstancesPayload;
  published: InstancesPayload | null;
};

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

export type InstancesFetcherResult = {
  payload: InstancesPayload | null;
  ctVersion: number | null;
  loading: boolean;
  error?: ApolloError;
};

export const useDataSourceInstancesFetcher = (
  key: 'draft' | 'published'
): InstancesFetcherResult => {
  const { data, error, loading } = useCtQuery<
    FetchResult<CombinedPayload>,
    FetchVars
  >('instances', FetchQuery, {
    variables: {
      container: CONTAINER,
      key: KEY,
    },
    context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
  });

  return {
    payload: data?.customObject?.value?.[key] ?? null,
    ctVersion: data?.customObject?.version ?? null,
    loading,
    error,
  };
};

export const useDataSourceInstancesUpdater = () => {
  const [upsert, { loading }] = useCtMutation<UpsertResult, UpsertVars>(
    'instances',
    UpsertMutation
  );

  const upsertKey = async (value: unknown, ctVersion: number | null) => {
    return upsert({
      context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
      variables: {
        draft: {
          container: CONTAINER,
          key: KEY,
          value: JSON.stringify(value),
          ...(ctVersion !== null ? { version: ctVersion } : {}),
        },
      },
    });
  };

  const saveInstances = async (
    instances: SavedDataSource[],
    ctVersion: number | null,
    currentPublished: InstancesPayload | null = null
  ) => {
    const draftPayload: InstancesPayload = {
      schemaVersion: 1,
      instances,
    };
    const combined: CombinedPayload = {
      schemaVersion: SCHEMA_VERSION,
      draft: draftPayload,
      published: currentPublished,
    };
    try {
      const result = await upsertKey(combined, ctVersion);
      const obj = result?.data?.createOrUpdateCustomObject;
      return { ctVersion: obj?.version ?? null };
    } catch (graphQlResponse) {
      throw extractErrorFromGraphQlResponse(graphQlResponse);
    }
  };

  const publishInstances = async (
    instances: SavedDataSource[],
    ctVersion: number | null
  ) => {
    const instancesPayload: InstancesPayload = {
      schemaVersion: 1,
      instances,
    };
    const combined: CombinedPayload = {
      schemaVersion: SCHEMA_VERSION,
      draft: instancesPayload,
      published: instancesPayload,
    };
    try {
      const result = await upsertKey(combined, ctVersion);
      const obj = result?.data?.createOrUpdateCustomObject;
      return { ctVersion: obj?.version ?? null };
    } catch (graphQlResponse) {
      throw extractErrorFromGraphQlResponse(graphQlResponse);
    }
  };

  return { loading, saveInstances, publishInstances };
};
