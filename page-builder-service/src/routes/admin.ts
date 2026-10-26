/**
 * Merchant Center admin API: the page-builder's custom objects behind MC-JWT authentication.
 *
 * The MC app holds no commercetools custom-object permission; this is its only way to read and
 * write page-builder data. The surface is deliberately a thin object gateway (get / list /
 * upsert / delete) so each MC hook keeps its own semantics (ref hydration, version history,
 * publish snapshots, optimistic-concurrency retries) and only its transport changes.
 *
 * Guard rails the MC app never had:
 *  - only the page-builder containers are reachable (never other apps' objects);
 *  - the host catalog is host-owned: those objects are read-only here and change only through
 *    the catalog ingest API;
 *  - every write is audit-logged with the acting user from the JWT. Gating by team or role stays
 *    presentational in the MC app; the service records, it does not enforce.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { JWTVerifyGetKey } from 'jose';
import { mcAuth } from '../mc-auth.js';
import type { McConfig } from '../config.js';
import { ctStatus, isCtError } from '../ct/client.js';
import type { CtStore } from '../ct/store.js';
import {
  CATALOG_CONTAINER,
  CATALOG_KEYS,
  COMPONENTS_CONTAINER,
  DRAFT_PAGE_CONTAINER,
  PUBLISHED_PAGE_CONTAINER,
} from '../domain/types.js';

export const ADMIN_CONTAINERS: readonly string[] = [
  CATALOG_CONTAINER,
  DRAFT_PAGE_CONTAINER,
  PUBLISHED_PAGE_CONTAINER,
  COMPONENTS_CONTAINER,
];

/** Objects in the catalog container that only catalog ingest may change. */
export const HOST_OWNED_KEYS: readonly string[] = Object.values(CATALOG_KEYS);

const MAX_LIMIT = 500;
const KEY_PATTERN = '^[A-Za-z0-9_-]{1,256}$';

export interface AdminDeps {
  mc: McConfig;
  projectKey: string;
  keys: JWTVerifyGetKey;
  store: CtStore;
}

interface Params {
  container: string;
  key: string;
}

const isHostOwned = (container: string, key: string): boolean => container === CATALOG_CONTAINER && HOST_OWNED_KEYS.includes(key);

function fail(reply: FastifyReply, status: number, code: string, message: string): FastifyReply {
  return reply.code(status).send({ error: { code, message } });
}

/** Map a commercetools failure to the status the MC hooks key off (409 drives their retries). */
function upstream(reply: FastifyReply, err: unknown): FastifyReply {
  if (!isCtError(err)) throw err;
  const status = ctStatus(err);
  if (status === 409) return fail(reply, 409, 'conflict', 'The object was modified by someone else');
  if (status === 404) return fail(reply, 404, 'not_found', 'No such object');
  if (status === 400) return fail(reply, 400, 'bad_request', 'commercetools rejected the request');
  return fail(reply, 502, 'upstream_error', 'commercetools request failed');
}

const objectParams = {
  type: 'object',
  required: ['container', 'key'],
  properties: { container: { type: 'string' }, key: { type: 'string', pattern: KEY_PATTERN } },
} as const;

const hostOwnedFailure = (reply: FastifyReply): FastifyReply =>
  fail(reply, 403, 'host_owned', 'The catalog is owned by the host and changes only through catalog ingest');

async function rejectForeignContainer(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
  const container = (req.params as Partial<Params>).container;
  if (container !== undefined && !ADMIN_CONTAINERS.includes(container)) {
    return fail(reply, 403, 'container_not_allowed', `Container "${container}" is not managed by the page-builder`);
  }
}

function registerGetObject(scope: FastifyInstance, store: CtStore): void {
  scope.get<{ Params: Params }>('/v1/admin/objects/:container/:key', { schema: { params: objectParams } }, async (req, reply) => {
    const object = await store.get(req.params.container, req.params.key, { bypass: true });
    if (!object) return fail(reply, 404, 'not_found', 'No such object');
    return reply.header('cache-control', 'no-store').send(object);
  });
}

function registerListObjects(scope: FastifyInstance, store: CtStore): void {
  scope.get<{ Params: { container: string }; Querystring: { where?: string; limit?: number; offset?: number } }>(
    '/v1/admin/objects/:container',
    {
      schema: {
        params: { type: 'object', required: ['container'], properties: { container: { type: 'string' } } },
        querystring: {
          type: 'object',
          properties: {
            where: { type: 'string', maxLength: 8192 },
            limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: 20 },
            offset: { type: 'integer', minimum: 0, default: 0 },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        const { where, limit = 20, offset = 0 } = req.query;
        const page = await store.query(req.params.container, { where, limit, offset });
        return reply.header('cache-control', 'no-store').send(page);
      } catch (err) {
        return upstream(reply, err);
      }
    }
  );
}

function registerPutObject(scope: FastifyInstance, store: CtStore): void {
  scope.put<{ Params: Params; Body: { value: unknown; version?: number } }>(
    '/v1/admin/objects/:container/:key',
    {
      schema: {
        params: objectParams,
        body: {
          type: 'object',
          required: ['value'],
          properties: { version: { type: 'integer', minimum: 0 } },
        },
      },
    },
    async (req, reply) => {
      const { container, key } = req.params;
      if (isHostOwned(container, key)) return hostOwnedFailure(reply);
      try {
        const object = await store.put(container, key, req.body.value, req.body.version);
        req.log.info({ audit: true, actor: req.actor, op: 'put', container, key, version: object.version }, 'admin write');
        return reply.send(object);
      } catch (err) {
        return upstream(reply, err);
      }
    }
  );
}

function registerDeleteObject(scope: FastifyInstance, store: CtStore): void {
  scope.delete<{ Params: Params; Querystring: { version?: number } }>(
    '/v1/admin/objects/:container/:key',
    {
      schema: {
        params: objectParams,
        querystring: { type: 'object', properties: { version: { type: 'integer', minimum: 0 } } },
      },
    },
    async (req, reply) => {
      const { container, key } = req.params;
      if (isHostOwned(container, key)) return hostOwnedFailure(reply);
      try {
        const removed = await store.remove(container, key, req.query.version);
        if (!removed) return fail(reply, 404, 'not_found', 'No such object');
        req.log.info({ audit: true, actor: req.actor, op: 'delete', container, key }, 'admin write');
        return reply.send(removed);
      } catch (err) {
        return upstream(reply, err);
      }
    }
  );
}

export function registerAdmin(app: FastifyInstance, deps: AdminDeps): void {
  const { store } = deps;

  app.register(async (scope) => {
    scope.addHook('onRequest', mcAuth(deps.mc, deps.projectKey, deps.keys));
    scope.addHook('preValidation', rejectForeignContainer);

    registerGetObject(scope, store);
    registerListObjects(scope, store);
    registerPutObject(scope, store);
    registerDeleteObject(scope, store);
  });
}
