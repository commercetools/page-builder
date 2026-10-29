/**
 * The service transport used in the Merchant Center: every call goes through the MC API
 * Gateway's `/proxy/forward-to`, which authenticates the user, checks their access to the
 * project, and forwards the call to the service with an exchange JWT the service verifies.
 *
 * The `forward-url-origin` audience policy makes the JWT audience the service origin, so it does
 * not depend on the request path (the service sits under its Connect endpoint prefix).
 *
 * A `FormData` body (a media upload) is handed to `fetch` as it is, with no content type of ours:
 * the browser writes the multipart boundary into the header itself.
 */

import {
  buildApiUrl,
  executeHttpClientRequest,
} from '@commercetools-frontend/application-shell';
import type { ServiceConfig } from './config';
import { encodeBody, readJson, serviceUrl } from './service-http';
import type { ServiceRequest } from './service-link';

export const createForwardRequest =
  (config: Pick<ServiceConfig, 'origin' | 'basePath'>): ServiceRequest =>
  ({ method, path, query, body }) => {
    const url = serviceUrl(config, path, query);
    const encoded = encodeBody(body);

    return executeHttpClientRequest(
      async (options: {
        credentials: 'include';
        headers: Record<string, string>;
      }) => {
        const res = await fetch(buildApiUrl('/proxy/forward-to'), {
          method,
          credentials: options.credentials,
          headers: { ...options.headers, ...encoded.headers },
          body: encoded.body,
        });
        return {
          data: { status: res.status, json: await readJson(res) },
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
