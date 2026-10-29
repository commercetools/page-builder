/**
 * Merchant Center media API: upload a file, and browse what has been uploaded.
 *
 * Same trust model as the admin object gateway — the editor calls it through the MC API Gateway's
 * `forward-to` (or, in local development, directly with `PB_DEV_TOKEN`), and the credential is
 * verified before anything else happens. There is no separate
 * media credential and nothing to configure per business unit: one service serves one project, and
 * its bucket prefix is its namespace. Every upload is audit-logged with the acting user.
 *
 * Without `PB_MEDIA_*` configuration the route still exists and answers 501 (after authentication), so
 * the editor can tell "not set up" from "broken".
 */

import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Authenticate } from '../mc-auth.js';
import { MediaError } from '../media/errors.js';
import { reasonOf, type MediaService } from '../media/media-service.js';
import { MEDIA_KINDS, type MediaKind } from '../media/mime.js';

export const MEDIA_PATH = '/v1/admin/media';
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;
/** Provider continuation tokens are short; this only bounds what a caller can make the service pass on. */
const MAX_CURSOR = 2048;

export interface MediaRouteDeps {
  /** Proves the call comes from the Merchant Center app (see `editorAuth`). */
  authenticate: Authenticate;
  /** `null` when media storage is not configured. */
  media: MediaService | null;
}

function fail(reply: FastifyReply, status: number, code: string, message: string): FastifyReply {
  return reply.code(status).send({ error: { code, message } });
}

const notConfigured = async (_req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> =>
  fail(reply, 501, 'media_not_configured', 'Media storage is not configured (PB_MEDIA_BUCKET)');

function mediaFailure(req: FastifyRequest, reply: FastifyReply, err: unknown): FastifyReply {
  if (!(err instanceof MediaError)) throw err;
  if (err.status >= 500) req.log.error({ reason: reasonOf(err.cause) }, 'media storage failed');
  return fail(reply, err.status, err.code, err.message);
}

/** Whatever fails while the upload stream is being read is the caller's: a cut-off or malformed body, or one over the cap. */
function uploadReadFailure(err: unknown): unknown {
  if (err instanceof MediaError) return err;
  if ((err as { code?: unknown }).code === 'FST_REQ_FILE_TOO_LARGE') return new MediaError(413, 'file_too_large', 'File is too large');
  return new MediaError(400, 'invalid_upload', 'The upload could not be read', { cause: err });
}

/** The first file part, as a buffer; the multipart parser aborts it past the size cap. */
async function readUpload(req: FastifyRequest): Promise<{ buffer: Buffer; filename: string; mimetype: string }> {
  if (!req.isMultipart()) throw new MediaError(400, 'file_required', 'Expected a multipart/form-data upload');
  try {
    const part = await req.file();
    if (!part || part.fieldname !== 'file') throw new MediaError(400, 'file_required', 'A file part named "file" is required');
    return { buffer: await part.toBuffer(), filename: part.filename, mimetype: part.mimetype };
  } catch (err) {
    throw uploadReadFailure(err);
  }
}

function registerUpload(scope: FastifyInstance, media: MediaService): void {
  scope.post(MEDIA_PATH, async (req, reply) => {
    try {
      const upload = await media.upload(await readUpload(req));
      req.log.info(
        { audit: true, actor: req.actor, op: 'media.upload', key: upload.key, size: upload.size, contentType: upload.contentType },
        'media upload'
      );
      return reply.code(201).send(upload);
    } catch (err) {
      return mediaFailure(req, reply, err);
    }
  });
}

function registerList(scope: FastifyInstance, media: MediaService): void {
  scope.get<{ Querystring: { type: MediaKind; limit?: number; cursor?: string } }>(
    MEDIA_PATH,
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['type'],
          properties: {
            type: { type: 'string', enum: [...MEDIA_KINDS] },
            limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT },
            cursor: { type: 'string', minLength: 1, maxLength: MAX_CURSOR },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        const { type, limit = DEFAULT_LIMIT, cursor } = req.query;
        const page = await media.list({ kind: type, limit, ...(cursor && { cursor }) });
        return reply.header('cache-control', 'no-store').send(page);
      } catch (err) {
        return mediaFailure(req, reply, err);
      }
    }
  );
}

export function registerMedia(app: FastifyInstance, deps: MediaRouteDeps): void {
  const { media } = deps;
  app.register(async (scope) => {
    scope.addHook('onRequest', deps.authenticate);
    if (!media) {
      // Answered from the hook, before the body is parsed: a multipart request to a service with no
      // multipart parser would otherwise be refused with a misleading 415.
      scope.addHook('onRequest', notConfigured);
      scope.all(MEDIA_PATH, notConfigured);
      return;
    }
    // One file and nothing else: the parser drops extra fields and files as they stream past, unbuffered.
    await scope.register(multipart, {
      limits: { fileSize: media.maxUploadBytes, files: 1, fields: 0, parts: 4, headerPairs: 20 },
    });
    registerUpload(scope, media);
    registerList(scope, media);
  });
}
