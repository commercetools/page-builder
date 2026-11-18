/**
 * Wire-version negotiation for the render surface.
 *
 * The shim sends `X-PB-Wire-Version`; the service accepts only versions it can serve and answers
 * 426 with the supported list otherwise, so a stale shim fails loudly instead of rendering a
 * misread tree. Bump `WIRE_VERSION` (and extend `SUPPORTED_WIRE_VERSIONS` while old shims are
 * still served) on any incompatible change to a schema in `openapi.yaml`.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { components } from './generated/api.js';

export const WIRE_VERSION = 1 as const;
export const SUPPORTED_WIRE_VERSIONS: readonly number[] = [1];
export const WIRE_VERSION_HEADER = 'x-pb-wire-version';

type UnsupportedWireVersion = components['schemas']['UnsupportedWireVersion'];

function reject(reply: FastifyReply, status: 400 | 426, code: string, message: string): FastifyReply {
  const body: UnsupportedWireVersion = {
    error: { code, message },
    supported: [...SUPPORTED_WIRE_VERSIONS] as UnsupportedWireVersion['supported'],
  };
  return reply.code(status).send(body);
}

/** `preHandler` for routes that speak the render wire format. */
export async function requireWireVersion(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply | void> {
  // Node joins repeated custom headers into one comma-separated string, which fails the
  // numeric check below and is rejected as unsupported.
  const raw = req.headers[WIRE_VERSION_HEADER];
  const value = typeof raw === 'string' ? raw : '';
  if (value === '') {
    return reject(
      reply,
      400,
      'wire_version_required',
      `The ${WIRE_VERSION_HEADER} header is required; supported versions: ${SUPPORTED_WIRE_VERSIONS.join(', ')}`
    );
  }
  const version = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!SUPPORTED_WIRE_VERSIONS.includes(version)) {
    return reject(
      reply,
      426,
      'wire_version_unsupported',
      `Wire version "${value}" is not supported; supported versions: ${SUPPORTED_WIRE_VERSIONS.join(', ')}`
    );
  }
}
