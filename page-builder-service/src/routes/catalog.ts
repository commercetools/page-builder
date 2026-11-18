/**
 * Catalog ingest: `GET/POST /v1/catalog`, `POST /v1/catalog/validate`, `POST /v1/catalog/publish`.
 *
 * Authenticated with the admin secret (CI). Push is draft-only and idempotent; publish is the
 * separate go-live step, so a deploy pipeline can push before and publish after the host ships.
 */

import type { FastifyInstance } from 'fastify';
import { adminAuth } from '../auth.js';
import type { ServiceConfig } from '../config.js';
import type { CatalogWriter } from '../domain/catalog-write.js';
import { validateCatalogDocument } from '../domain/catalog-validate.js';
import type { Catalog } from '../domain/types.js';

export interface CatalogRouteDeps {
  config: ServiceConfig;
  writer: CatalogWriter;
}

const invalid = (errors: string[], warnings: string[]) => ({ errors, warnings });

export function registerCatalog(app: FastifyInstance, { config, writer }: CatalogRouteDeps): void {
  const auth = { onRequest: [adminAuth(config)] };

  app.get<{ Querystring: { state?: string } }>('/v1/catalog', auth, async (req, reply) => {
    const state = req.query.state === 'draft' ? 'draft' : 'published';
    const doc = await writer.read(state);
    if (!doc) return reply.code(404).send({ error: { code: 'catalog_not_found', message: `No ${state} catalog` } });
    return reply.header('cache-control', 'no-store').send(doc);
  });

  app.post('/v1/catalog/validate', auth, async (req, reply) => {
    const report = validateCatalogDocument(req.body);
    return reply.code(report.errors.length ? 422 : 200).send(invalid(report.errors, report.warnings));
  });

  app.post('/v1/catalog', auth, async (req, reply) => {
    const report = validateCatalogDocument(req.body);
    if (report.errors.length) return reply.code(422).send(invalid(report.errors, report.warnings));
    const result = await writer.push(req.body as Catalog);
    return { ...result, warnings: report.warnings };
  });

  app.post('/v1/catalog/publish', auth, async (_req, reply) => {
    const result = await writer.publish();
    if (!result) return reply.code(404).send({ error: { code: 'catalog_not_found', message: 'Nothing to publish: push a catalog first' } });
    return result;
  });
}
