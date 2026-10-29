/**
 * Drop-in replacements for `useMcQuery` / `useMcMutation` / `useApolloClient` for the
 * page-builder's custom-object hooks.
 *
 * Each takes the hook family's feature name. When the app is configured to send that family to
 * the page-builder service (see `config.ts`) the call is answered by the service-backed Apollo
 * client; otherwise it behaves exactly like the Merchant Center hook it wraps. The decision is
 * stable for the life of the app (it comes from build-time environment), so both underlying hooks
 * are always called and the unused one is skipped, which keeps the rules of hooks.
 */

import { useMemo } from 'react';
import {
  ApolloClient,
  InMemoryCache,
  useApolloClient,
  useMutation,
  useQuery,
  type DocumentNode,
  type MutationHookOptions,
  type OperationVariables,
  type QueryHookOptions,
  type QueryResult,
  type TypedDocumentNode,
} from '@apollo/client';
import { useMcMutation } from '@commercetools-frontend/application-shell';
import {
  useApplicationContext,
  useMcQuery,
} from '@commercetools-frontend/application-shell-connectors';
import {
  parseServiceConfig,
  type ServiceConfig,
  type ServiceFeature,
} from './config';
import { createDirectRequest } from './direct';
import { createForwardRequest } from './forward-to';
import { createServiceLink, type ServiceRequest } from './service-link';

/** One client per (service, project): its cache must not leak across projects. */
const clients = new Map<string, ApolloClient<object>>();

let requestOverride: ServiceRequest | null = null;

/** Test seam: answer service calls in-process instead of through the MC proxy. */
export function setServiceRequestForTests(
  request: ServiceRequest | null
): void {
  requestOverride = request;
  clients.clear();
}

/**
 * How a call reaches the service: through the MC gateway, the in-process stand-in under test, or,
 * in a development build with a dev token configured, straight to the service.
 *
 * The gateway cannot forward to a service on localhost, so local development calls it directly.
 * `process.env.NODE_ENV` is replaced when the app is built, so in a production bundle the direct
 * branch is dead code: a token in the environment changes nothing there.
 */
export function serviceRequestFor(
  config: Pick<ServiceConfig, 'origin' | 'basePath' | 'devToken'>
): ServiceRequest {
  if (requestOverride) return requestOverride;
  return process.env.NODE_ENV === 'development' && config.devToken
    ? createDirectRequest(config, config.devToken)
    : createForwardRequest(config);
}

export function serviceClientFor(
  config: Pick<ServiceConfig, 'origin' | 'basePath' | 'devToken'>,
  projectKey: string,
  request?: ServiceRequest
) {
  const id = `${config.origin}${config.basePath}|${projectKey}`;
  let client = clients.get(id);
  if (!client) {
    client = new ApolloClient({
      cache: new InMemoryCache(),
      link: createServiceLink(request ?? serviceRequestFor(config)),
      // Reads must reflect writes from other tabs and users; the service never serves stale data.
      defaultOptions: { watchQuery: { nextFetchPolicy: undefined } },
    });
    clients.set(id, client);
  }
  return client;
}

/** The service-backed client for a feature, or null when the feature still uses the MC gateway. */
export function useServiceClient(
  feature: ServiceFeature
): ApolloClient<object> | null {
  const environment = useApplicationContext((ctx) => ctx.environment) as
    | Record<string, unknown>
    | undefined;
  const projectKey = useApplicationContext((ctx) => ctx.project?.key) ?? '';
  const config = useMemo(() => parseServiceConfig(environment), [environment]);
  return useMemo(
    () =>
      config && config.features.has(feature)
        ? serviceClientFor(config, projectKey)
        : null,
    [config, feature, projectKey]
  );
}

/** The options `useMcQuery` takes (it requires the Apollo `context` target). */
type McQueryOptions<TData, TVariables extends OperationVariables> = Parameters<
  typeof useMcQuery<TData, TVariables>
>[1];

export function useCtQuery<
  TData = unknown,
  TVariables extends OperationVariables = OperationVariables
>(
  feature: ServiceFeature,
  query: DocumentNode | TypedDocumentNode<TData, TVariables>,
  options: McQueryOptions<TData, TVariables>
): QueryResult<TData, TVariables> {
  const client = useServiceClient(feature);
  const viaMc = useMcQuery<TData, TVariables>(query, {
    ...options,
    skip: options?.skip || client !== null,
  } as McQueryOptions<TData, TVariables>);
  const { context: _mcContext, ...serviceOptions } = (options ??
    {}) as QueryHookOptions<TData, TVariables>;
  const viaService = useQuery<TData, TVariables>(query, {
    ...serviceOptions,
    client: client ?? undefined,
    skip: serviceOptions.skip || client === null,
  });
  return client ? viaService : (viaMc as QueryResult<TData, TVariables>);
}

type McMutationTuple<TData, TVariables extends OperationVariables> = ReturnType<
  typeof useMcMutation<TData, TVariables>
>;

export function useCtMutation<
  TData = unknown,
  TVariables extends OperationVariables = OperationVariables
>(
  feature: ServiceFeature,
  mutation: DocumentNode | TypedDocumentNode<TData, TVariables>,
  options: MutationHookOptions<TData, TVariables> = {}
): McMutationTuple<TData, TVariables> {
  const client = useServiceClient(feature);
  const viaMc = useMcMutation<TData, TVariables>(mutation, options);
  const viaService = useMutation<TData, TVariables>(mutation, {
    ...options,
    client: client ?? undefined,
  });
  // Same call shape as the Merchant Center hook: the service client accepts the same options.
  return (client ? viaService : viaMc) as McMutationTuple<TData, TVariables>;
}

/** `useApolloClient()` for imperative reads (`client.query`) in a feature's hooks. */
export function useCtClient(feature: ServiceFeature): ApolloClient<object> {
  const mc = useApolloClient();
  return useServiceClient(feature) ?? mc;
}
