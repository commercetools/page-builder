/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApolloError } from '@apollo/client';
import { useMcQuery } from '@commercetools-frontend/application-shell-connectors';
import { useMcMutation } from '@commercetools-frontend/application-shell';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import FetchQuery from './fetch-image-picker-token.ctp.graphql';
import UpsertMutation from './upsert-image-picker-token.ctp.graphql';

// Shared with the contentools Merchant Center app, which mints the token in the first
// place (see its `src/constants.ts`). Both apps store the bare JWT as a JSON string, so
// `JSON.stringify(token)` here and its `` `"${token}"` `` are the same bytes.
const CONTAINER = 'contentools-configuration';
const KEY = 'contentools-jwt-token';

/** Refresh this far ahead of `exp` so a long picker session can't expire mid-upload. */
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

type RawCustomObject<T = unknown> = {
  id: string;
  key: string;
  container: string;
  version: number;
  value: T;
  lastModifiedAt: string;
};

type FetchResult = { customObject?: RawCustomObject<string> | null };
type FetchVars = { container: string; key: string };
type UpsertResult = {
  createOrUpdateCustomObject?: RawCustomObject<string> | null;
};
type UpsertVars = {
  draft: {
    container: string;
    key: string;
    value: string;
    version?: number | null;
  };
};

type RefreshJwtResponse = { token?: string };

/**
 * True when the token is unusable: absent, unparseable, or within `EXPIRY_SKEW_MS` of its
 * `exp`. Errs towards "expired" — a needless refresh is cheap, a rejected upload is not.
 */
export function isTokenExpired(token: string | null | undefined): boolean {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number };
    if (typeof payload.exp !== 'number') return true;
    return Date.now() + EXPIRY_SKEW_MS >= payload.exp * 1000;
  } catch {
    return true;
  }
}

export type ImagePickerTokenResult = {
  /** A non-expired service JWT, or null when none is available. */
  token: string | null;
  loading: boolean;
  refreshing: boolean;
  error?: ApolloError;
};

/**
 * The contentools media service JWT, read from the custom object the contentools MC app
 * writes it to. Browsing the media library only needs the `x-project-key` header, so a
 * missing token degrades to browse-only rather than failing — only `upload-file` needs it.
 *
 * Expired tokens are traded for a fresh one via `POST {baseUrl}/refresh-jwt` (the service
 * accepts an expired token there) and written back, so the operator seeds the custom
 * object once and it stays valid. Mirrors `AuthProvider` in the contentools MC app.
 *
 * Never throws: every failure path leaves `token` null and lets the caller show a note.
 */
export function useImagePickerToken(
  baseUrl: string | undefined
): ImagePickerTokenResult {
  const { data, error, loading } = useMcQuery<FetchResult, FetchVars>(
    FetchQuery,
    {
      variables: { container: CONTAINER, key: KEY },
      context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
      // A stale token would be refreshed on every mount; always read through.
      fetchPolicy: 'cache-and-network',
      skip: !baseUrl,
    }
  );

  const [upsert] = useMcMutation<UpsertResult, UpsertVars>(UpsertMutation);

  const storedToken = data?.customObject?.value ?? null;
  const ctVersion = data?.customObject?.version ?? null;

  const [refreshedToken, setRefreshedToken] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Keyed on the stored token so one refresh runs per value, not per render.
  const attemptedFor = useRef<string | null>(null);

  const refresh = useCallback(
    async (token: string): Promise<void> => {
      if (!baseUrl) return;
      setRefreshing(true);
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/refresh-jwt`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }
        const body = (await res.json()) as RefreshJwtResponse;
        if (!body.token) throw new Error('response had no token');

        setRefreshedToken(body.token);
        try {
          await upsert({
            context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
            variables: {
              draft: {
                container: CONTAINER,
                key: KEY,
                value: JSON.stringify(body.token),
                ...(ctVersion !== null ? { version: ctVersion } : {}),
              },
            },
          });
        } catch (writeError) {
          // The fresh token still works for this session; only persistence failed
          // (most likely a concurrent write bumping the version).
          console.warn(
            '[image-picker] could not persist the refreshed token',
            writeError
          );
        }
      } catch (refreshError) {
        console.warn('[image-picker] token refresh failed', refreshError);
      } finally {
        setRefreshing(false);
      }
    },
    [baseUrl, ctVersion, upsert]
  );

  useEffect(() => {
    if (!storedToken || !isTokenExpired(storedToken)) return;
    if (attemptedFor.current === storedToken) return;
    attemptedFor.current = storedToken;
    void refresh(storedToken);
  }, [storedToken, refresh]);

  const usable = [refreshedToken, storedToken].find(
    (t): t is string => !!t && !isTokenExpired(t)
  );

  return { token: usable ?? null, loading, refreshing, error };
}
