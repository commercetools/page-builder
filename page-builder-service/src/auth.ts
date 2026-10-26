/**
 * Authentication for the render surface: a render key plus an origin allowlist.
 *
 * Both are required in production (enforced at startup by `loadConfig`) and skipped when unset
 * in local development. The caller's origin is the browser's `Origin` header when present;
 * a server-side shim fetch has none, so it states its public origin in `X-PB-Origin`.
 *
 * The render key is the credential. The origin allowlist is defence in depth: a server can
 * claim any `X-PB-Origin`, so it constrains browser callers and limits a leaked key to
 * callers that also know a valid origin, not to arbitrary scripts.
 */

import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ServiceConfig } from './config.js';

export const RENDER_KEY_HEADER = 'x-pb-render-key';
export const HOST_ORIGIN_HEADER = 'x-pb-origin';

/** Constant-time string comparison that does not leak the secret's length by timing. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  const length = Math.max(left.length, right.length, 1);
  const paddedLeft = Buffer.alloc(length);
  const paddedRight = Buffer.alloc(length);
  left.copy(paddedLeft);
  right.copy(paddedRight);
  return timingSafeEqual(paddedLeft, paddedRight) && left.length === right.length;
}

function header(req: FastifyRequest, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function normaliseOrigin(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
}

function deny(reply: FastifyReply, status: 401 | 403, code: string, message: string): FastifyReply {
  return reply.code(status).send({ error: { code, message } });
}

/** `preHandler` for render routes. */
export function renderAuth(
  config: Pick<ServiceConfig, 'renderKey' | 'renderOrigins'>
): (req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | void> {
  return async (req, reply) => {
    if (config.renderKey) {
      const presented = header(req, RENDER_KEY_HEADER);
      if (!presented || !safeEqual(presented, config.renderKey)) {
        return deny(reply, 401, 'invalid_render_key', 'Missing or invalid render key');
      }
    }

    if (config.renderOrigins.length > 0) {
      const origin = normaliseOrigin(header(req, 'origin') ?? header(req, HOST_ORIGIN_HEADER));
      if (!origin || !config.renderOrigins.includes(origin)) {
        return deny(reply, 403, 'origin_not_allowed', 'Origin is not on the render allowlist');
      }
    }
  };
}

/** `onRequest` hook for catalog/admin routes: `Authorization: Bearer <PB_ADMIN_SECRET>`. */
export function adminAuth(
  config: Pick<ServiceConfig, 'adminSecret'>
): (req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | void> {
  return async (req, reply) => {
    // Without a configured secret the surface is closed, never open: only production requires
    // one at startup, and local development can opt in by setting it.
    if (!config.adminSecret) {
      return deny(reply, 401, 'admin_disabled', 'PB_ADMIN_SECRET is not configured');
    }
    const match = /^Bearer (.+)$/.exec(header(req, 'authorization') ?? '');
    if (!match || !safeEqual(match[1]!, config.adminSecret)) {
      return deny(reply, 401, 'invalid_admin_secret', 'Missing or invalid admin secret');
    }
  };
}
