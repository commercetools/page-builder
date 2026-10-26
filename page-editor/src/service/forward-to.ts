/**
 * The service transport used in the Merchant Center: every call goes through the MC API
 * Gateway's `/proxy/forward-to`, which authenticates the user, checks their access to the
 * project, and forwards the call to the service with an exchange JWT the service verifies.
 *
 * The `forward-url-origin` audience policy makes the JWT audience the service origin, so it does
 * not depend on the request path (the service sits under its Connect endpoint prefix).
 */

import {
  buildApiUrl,
  executeHttpClientRequest,
} from '@commercetools-frontend/application-shell';
import type { ServiceConfig } from './config';
import type { ServiceRequest } from './service-link';

export const createForwardRequest =
  (config: Pick<ServiceConfig, 'origin' | 'basePath'>): ServiceRequest =>
  ({ method, path, query, body }) => {
    const url = new URL(`${config.basePath}${path}`, config.origin);
    for (const [name, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }

    return executeHttpClientRequest(
      async (options: {
        credentials: 'include';
        headers: Record<string, string>;
      }) => {
        const res = await fetch(buildApiUrl('/proxy/forward-to'), {
          method,
          credentials: options.credentials,
          headers: {
            ...options.headers,
            ...(body === undefined
              ? {}
              : { 'content-type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        let json: unknown;
        try {
          json = text ? JSON.parse(text) : undefined;
        } catch {
          json = undefined;
        }
        return {
          data: { status: res.status, json },
          statusCode: res.status,
          getHeader: (name: string) => res.headers.get(name),
        };
      },
      {
        forwardToConfig: {
          uri: url.toString(),
          audiencePolicy: 'forward-url-origin',
        },
      }
    );
  };
