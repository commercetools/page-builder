/**
 * The commercetools API client: `@commercetools/ts-client` (client-credentials auth, token
 * caching and refresh, HTTP) behind the typed `@commercetools/platform-sdk` request builders.
 *
 * `createApiRoot` is built once at startup and shared; the injectable `fetch` is how tests and
 * `dev:fake` put the in-memory commercetools underneath it. Every outbound call has a timeout
 * so a slow commercetools fails the request instead of hanging it. It knows nothing about
 * page-builder; see `store.ts` for custom objects.
 */

import { createApiBuilderFromCtpClient, type ByProjectKeyRequestBuilder } from '@commercetools/platform-sdk';
import { ClientBuilder } from '@commercetools/ts-client';
import type { CtConfig } from '../config.js';

export type ApiRoot = ByProjectKeyRequestBuilder;

export interface ApiRootOptions {
  fetch?: typeof fetch;
}

/** Outbound budget per commercetools call. */
export const CT_TIMEOUT_MS = 10_000;

export function createApiRoot(ct: CtConfig, options: ApiRootOptions = {}): ApiRoot {
  const httpClient = options.fetch ?? fetch;
  const client = new ClientBuilder()
    .withClientCredentialsFlow({
      host: ct.authUrl,
      projectKey: ct.projectKey,
      credentials: { clientId: ct.clientId, clientSecret: ct.clientSecret },
      // Unset: no `scope` in the token request, so the token carries the API client's own scopes.
      ...(ct.scopes && { scopes: ct.scopes.split(/\s+/).filter(Boolean) }),
      httpClient,
    })
    .withHttpMiddleware({ host: ct.apiUrl, httpClient, timeout: CT_TIMEOUT_MS, enableRetry: false })
    .build();
  return createApiBuilderFromCtpClient(client).withProjectKey({ projectKey: ct.projectKey });
}

/** The HTTP status of a failed commercetools call (the client throws errors carrying it). */
export function ctStatus(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'statusCode' in err && typeof err.statusCode === 'number') {
    return err.statusCode;
  }
  return undefined;
}

/** Whether `err` is a failure from the commercetools client (API or token endpoint). */
export function isCtError(err: unknown): boolean {
  // Every client error carries `statusCode`, though it is unset for a token-endpoint rejection.
  return typeof err === 'object' && err !== null && 'statusCode' in err;
}

export const isCtStatus = (err: unknown, status: number): boolean => ctStatus(err) === status;
