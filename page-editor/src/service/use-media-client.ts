import { useMemo } from 'react';
import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { parseServiceEndpoint } from './config';
import { createMediaClient, type MediaClient } from './media';
import { serviceRequestFor } from './transport';

/**
 * The media client for this app's page-builder service, or `null` when `PAGE_BUILDER_SERVICE_URL`
 * is not set. Only the URL is needed: media does not depend on which hook families use the service.
 */
export function useMediaClient(): MediaClient | null {
  const environment = useApplicationContext((ctx) => ctx.environment) as
    | Record<string, unknown>
    | undefined;
  const endpoint = useMemo(
    () => parseServiceEndpoint(environment),
    [environment]
  );
  return useMemo(
    () => (endpoint ? createMediaClient(serviceRequestFor(endpoint)) : null),
    [endpoint]
  );
}
