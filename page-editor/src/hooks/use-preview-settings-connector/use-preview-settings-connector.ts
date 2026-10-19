/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import { useMemo } from 'react';
import type { ApolloError } from '@apollo/client';
import { useMcQuery } from '@commercetools-frontend/application-shell-connectors';
import { useMcMutation } from '@commercetools-frontend/application-shell';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import { extractErrorFromGraphQlResponse } from '../../helpers';
import type { PreviewSettings } from '../../components/page-builder/types';
import FetchQuery from './fetch-preview-settings.ctp.graphql';
import UpsertMutation from './upsert-preview-settings.ctp.graphql';

const CONTAINER = 'page-editor';
const KEY = 'settings';
// v2 introduced per-environment base URLs (`environments`). Older objects are
// migrated on read (see `withEnvironments`); the shape is only re-persisted on
// the next save, so this bump is non-destructive.
const SCHEMA_VERSION = 2;

/**
 * Preview settings are operator configuration, not authored content — a single
 * plain object with no draft/publish flow (unlike the schema-v2 entities).
 */
export type PreviewSettingsPayload = {
  schemaVersion: number;
  preview: PreviewSettings;
};

export const DEFAULT_PREVIEW_SETTINGS: PreviewSettings = {
  enabled: false,
  baseUrl: '',
  token: '',
  defaultLocale: 'en-us',
  locales: ['en-us'],
  routes: {
    home: '/{locale}',
    category: '/{locale}/category/{slug}',
    pdp: '/{locale}/{slug}/p/{sku}',
    content: '/{locale}/{slug}',
  },
  samples: { pdp: { sku: '', slug: '' } },
  vars: {},
  homePageId: 'home',
  environments: {
    production: { baseUrl: '', token: '' },
    staging: { baseUrl: '', token: '' },
  },
};

/**
 * Read-time migration: settings authored before v2 have no `environments`, so
 * synthesize one from the legacy single `baseUrl`/`token` (as production). Only
 * re-persisted when the operator next saves.
 */
const withEnvironments = (s: PreviewSettings): PreviewSettings =>
  s.environments
    ? s
    : {
        ...s,
        environments: {
          production: { baseUrl: s.baseUrl ?? '', token: s.token },
          staging: { baseUrl: '', token: undefined },
        },
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

export type PreviewSettingsFetcherResult = {
  settings: PreviewSettings | null;
  ctVersion: number | null;
  loading: boolean;
  error?: ApolloError;
};

export const usePreviewSettingsFetcher = (): PreviewSettingsFetcherResult => {
  const { data, error, loading } = useMcQuery<
    FetchResult<PreviewSettingsPayload>,
    FetchVars
  >(FetchQuery, {
    variables: { container: CONTAINER, key: KEY },
    context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
  });

  const raw = data?.customObject?.value?.preview ?? null;
  // Memoize so the (possibly migrated) settings object keeps a stable identity
  // across renders. Consumers key effects on `settings`; a fresh object each
  // render — which `withEnvironments` produces for legacy v1 objects — would
  // loop those effects. `raw` is Apollo-stable while the cached value is unchanged.
  const settings = useMemo(() => (raw ? withEnvironments(raw) : null), [raw]);
  return {
    settings,
    ctVersion: data?.customObject?.version ?? null,
    loading,
    error,
  };
};

export const usePreviewSettingsUpdater = () => {
  const [upsert, { loading }] = useMcMutation<UpsertResult, UpsertVars>(
    UpsertMutation
  );

  const saveSettings = async (
    settings: PreviewSettings,
    ctVersion: number | null
  ) => {
    const payload: PreviewSettingsPayload = {
      schemaVersion: SCHEMA_VERSION,
      preview: settings,
    };
    try {
      const result = await upsert({
        context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
        variables: {
          draft: {
            container: CONTAINER,
            key: KEY,
            value: JSON.stringify(payload),
            ...(ctVersion !== null ? { version: ctVersion } : {}),
          },
        },
      });
      return {
        ctVersion: result?.data?.createOrUpdateCustomObject?.version ?? null,
      };
    } catch (graphQlResponse) {
      throw extractErrorFromGraphQlResponse(graphQlResponse);
    }
  };

  return { loading, saveSettings };
};
