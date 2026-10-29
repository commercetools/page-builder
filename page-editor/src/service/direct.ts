/**
 * The service transport for local development: a plain `fetch` straight to the service.
 *
 * In the Merchant Center every call goes through the gateway's `forward-to` (see `forward-to.ts`).
 * The gateway runs in the cloud, so it cannot forward to a service on `localhost`. A development
 * build can therefore call the service itself, presenting the service's `PB_DEV_TOKEN` in place of
 * the gateway's exchange JWT. The service accepts that token only when it is not in production, and
 * answers the browser's cross-origin preflight only for its configured editor origins.
 *
 * Never reached from a production build: see `serviceRequestFor`.
 */

import type { ServiceConfig } from './config';
import { encodeBody, readJson, serviceUrl } from './service-http';
import type { ServiceRequest } from './service-link';

export const createDirectRequest =
  (
    config: Pick<ServiceConfig, 'origin' | 'basePath'>,
    token: string
  ): ServiceRequest =>
  async ({ method, path, query, body }) => {
    const encoded = encodeBody(body);
    let res: Response;
    try {
      res = await fetch(serviceUrl(config, path, query), {
        method,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token}`,
          ...encoded.headers,
        },
        body: encoded.body,
      });
    } catch (cause) {
      // A browser reports an unreachable service and a refused preflight alike as "Failed to fetch".
      throw new Error(
        `Could not reach the page-builder service at ${config.origin}${config.basePath} directly (development mode). ` +
          'Is it running with PB_DEV_TOKEN set and PB_EDITOR_ORIGINS including this app’s origin?',
        { cause }
      );
    }
    return { status: res.status, json: await readJson(res) };
  };
