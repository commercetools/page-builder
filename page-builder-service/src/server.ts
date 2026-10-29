/**
 * HTTP server assembly. Routes are registered by feature modules (render, catalog, admin) as they
 * land, all under `config.basePath`; this module owns only cross-cutting concerns: structured
 * logging with a request id, a health endpoint, and the shared error shape.
 */

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Deps } from './app.js';
import type { ServiceConfig } from './config.js';
import { registerDevCors } from './dev-cors.js';
import { editorAuth } from './mc-auth.js';
import { registerAdmin } from './routes/admin.js';
import { registerCatalog } from './routes/catalog.js';
import { registerMedia } from './routes/media.js';
import { registerRender } from './routes/render.js';

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface ServerOptions {
  /** Where structured logs go; defaults to stdout. Tests capture it. */
  logStream?: { write(line: string): void };
}

function requestId(req: IncomingMessage): string {
  const incoming = req.headers['x-request-id'];
  return typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
}

function createApp(config: ServiceConfig, options: ServerOptions): FastifyInstance {
  return Fastify({
    // Catalog documents are the largest request body the service accepts.
    bodyLimit: 5 * 1024 * 1024,
    logger: {
      level: config.logLevel,
      ...(options.logStream ? { stream: options.logStream } : {}),
      // Never log credentials presented by callers.
      redact: ['req.headers.authorization', 'req.headers["x-pb-render-key"]'],
    },
    genReqId: requestId,
    requestIdHeader: false,
  });
}

function handleNotFound(_req: FastifyRequest, reply: FastifyReply): void {
  const body: ErrorBody = { error: { code: 'not_found', message: 'Route not found' } };
  reply.code(404).send(body);
}

function handleError(err: Error & { statusCode?: number }, req: FastifyRequest, reply: FastifyReply): void {
  const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  if (status >= 500) req.log.error({ err }, 'unhandled error');
  const body: ErrorBody = {
    error: {
      code: status >= 500 ? 'internal_error' : 'bad_request',
      // Do not leak internals for server faults.
      message: status >= 500 ? 'Internal server error' : err.message,
    },
  };
  reply.code(status).send(body);
}

function registerJsonParser(scope: FastifyInstance): void {
  // Body-less POSTs (e.g. `publish`) are common even when a client sets a JSON content type.
  scope.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (body === '') return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(Object.assign(new Error('Body is not valid JSON'), { statusCode: 400 }), undefined);
    }
  });
}

function registerAdminOrUnavailable(scope: FastifyInstance, config: ServiceConfig, deps: Deps): void {
  const authenticate =
    config.ct &&
    editorAuth({
      projectKey: config.ct.projectKey,
      mc: config.mc && deps.mcKeys ? { config: config.mc, keys: deps.mcKeys } : null,
      devToken: config.devToken,
    });
  if (authenticate) {
    registerAdmin(scope, { authenticate, store: deps.store });
    registerMedia(scope, { authenticate, media: deps.media });
    return;
  }
  scope.all('/v1/admin/*', async (_req, reply) =>
    reply.code(503).send({
      error: { code: 'mc_auth_not_configured', message: 'PB_MC_ISSUER is not configured' },
    })
  );
}

function registerFeatureRoutes(scope: FastifyInstance, config: ServiceConfig, deps: Deps | null): void {
  if (!deps) {
    // Local development without commercetools credentials: the service still boots.
    scope.all('/v1/*', async (_req, reply) =>
      reply.code(503).send({
        error: { code: 'not_configured', message: 'commercetools credentials are not configured' },
      })
    );
    return;
  }
  registerRender(scope, { config, pages: deps.pages, catalog: deps.catalog, commerce: deps.commerce });
  registerCatalog(scope, { config, writer: deps.catalogWriter });
  registerAdminOrUnavailable(scope, config, deps);
}

export function buildServer(config: ServiceConfig, deps: Deps | null = null, options: ServerOptions = {}): FastifyInstance {
  const app = createApp(config, options);

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  app.setNotFoundHandler(handleNotFound);
  app.setErrorHandler(handleError);

  // Local development only: `loadConfig` refuses `PB_DEV_TOKEN` in production.
  if (config.devToken) {
    registerDevCors(app, { origins: config.editorOrigins, adminPrefix: `${config.basePath}/v1/admin/` });
  }

  // Every route lives under the configured base path (Connect does not strip the app endpoint).
  app.register(
    async (scope) => {
      registerJsonParser(scope);
      // `/status` is Connect's conventional liveness path; `/healthz` is kept for existing probes.
      for (const path of ['/status', '/healthz']) scope.get(path, async () => ({ status: 'ok' }));
      registerFeatureRoutes(scope, config, deps);
    },
    { prefix: config.basePath }
  );

  return app;
}
