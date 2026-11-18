/**
 * Cross-origin access for local development of the Merchant Center app.
 *
 * In production the app reaches the service through the gateway's `forward-to`, a server-to-server
 * call, so the service never sees a browser origin and has no CORS. Locally the app's dev server
 * (a different origin from the service) calls it directly, which the browser allows only with these
 * headers. Registered only when `PB_DEV_TOKEN` is set, which configuration refuses in production.
 *
 * Narrow on purpose: the admin surface only, the configured editor origins only (never `*`), no
 * credentials (the token travels in `Authorization`, not a cookie).
 */

import type { FastifyInstance } from 'fastify';

const PREFLIGHT_MAX_AGE_SECONDS = '600';

export interface DevCorsOptions {
  /** Origins of the Merchant Center app dev server (`PB_EDITOR_ORIGINS`). */
  origins: readonly string[];
  /** URL path prefix of the admin surface, including the Connect base path. */
  adminPrefix: string;
}

export function registerDevCors(app: FastifyInstance, { origins, adminPrefix }: DevCorsOptions): void {
  const allowed = new Set(origins);

  // On the root instance so it also answers a preflight for a route that has no OPTIONS handler,
  // and runs before authentication so even a 401 carries the headers the browser needs to read it.
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (typeof origin !== 'string' || !allowed.has(origin)) return;
    if (!(req.url.split('?')[0] ?? '').startsWith(adminPrefix)) return;

    reply.header('access-control-allow-origin', origin).header('vary', 'origin');

    if (req.method === 'OPTIONS' && req.headers['access-control-request-method']) {
      return reply
        .header('access-control-allow-methods', 'GET, POST, PUT, DELETE')
        .header('access-control-allow-headers', 'authorization, content-type')
        .header('access-control-max-age', PREFLIGHT_MAX_AGE_SECONDS)
        .code(204)
        .send();
    }
  });
}
