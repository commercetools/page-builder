/**
 * Authentication for the Merchant Center admin API.
 *
 * The MC app calls the service through the MC API Gateway's `/proxy/forward-to`, which verifies
 * the user's session and project access, then forwards the request with an exchange JWT
 * (`Authorization: Bearer`) signed with the gateway's rotating key. The service verifies that
 * JWT against the gateway's JWKS (RS256, issuer = the gateway, audience = this service's origin)
 * and that it is for this service's own project.
 *
 * The app must forward with the `forward-url-origin` audience policy so the audience is the
 * service origin and does not depend on the request path (Connect prefixes the app endpoint).
 *
 * Local development has one more way in: `PB_DEV_TOKEN`. The gateway runs in the cloud and cannot
 * forward to a service on localhost, so the app's dev server calls the service directly with that
 * token instead (see `devAuth`). Configuration refuses it in production.
 */

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { safeEqual } from './auth.js';
import type { McConfig } from './config.js';

export interface Actor {
  userId: string;
  projectKey: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** The verified Merchant Center user; set by `mcAuth` on admin routes. */
    actor?: Actor;
  }
}

export function createRemoteKeys(issuer: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL('/.well-known/jwks.json', issuer));
}

function bearerOf(req: FastifyRequest): string | undefined {
  return /^Bearer (.+)$/.exec(typeof req.headers.authorization === 'string' ? req.headers.authorization : '')?.[1];
}

function deny(reply: FastifyReply, code: string, message: string): FastifyReply {
  return reply.code(401).send({ error: { code, message } });
}

export function mcAuth(
  mc: McConfig,
  projectKey: string,
  keys: JWTVerifyGetKey
): (req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | void> {
  return async (req, reply) => {
    const token = bearerOf(req);
    if (!token) return deny(reply, 'missing_token', 'Missing Merchant Center token');

    let payload;
    try {
      ({ payload } = await jwtVerify(token, keys, {
        algorithms: ['RS256'],
        issuer: mc.issuer,
        audience: mc.audience,
      }));
    } catch (err) {
      req.log.warn({ err: (err as Error).message }, 'merchant center token rejected');
      return deny(reply, 'invalid_token', 'Invalid Merchant Center token');
    }

    const claimedProject = payload[`${mc.issuer}/claims/project_key`];
    if (claimedProject !== projectKey) {
      return deny(reply, 'wrong_project', 'The token is not for this service\'s project');
    }
    if (typeof payload.sub !== 'string' || payload.sub === '') {
      return deny(reply, 'invalid_token', 'Invalid Merchant Center token');
    }
    req.actor = { userId: payload.sub, projectKey };
  };
}

/** The identity recorded in audit logs for a call made with `PB_DEV_TOKEN`. */
export const DEV_USER_ID = 'local-dev';

export type Authenticate = (req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | void>;

/** Accepts exactly the configured development token, acting as the service's own project. */
export function devAuth(token: string, projectKey: string): Authenticate {
  return async (req, reply) => {
    const presented = bearerOf(req);
    if (!presented) return deny(reply, 'missing_token', 'Missing development token');
    if (!safeEqual(presented, token)) return deny(reply, 'invalid_token', 'Invalid development token');
    req.actor = { userId: DEV_USER_ID, projectKey };
  };
}

export interface EditorAuthOptions {
  projectKey: string;
  /** Verifies gateway JWTs; null when `PB_MC_ISSUER` is not configured. */
  mc: { config: McConfig; keys: JWTVerifyGetKey } | null;
  /** `PB_DEV_TOKEN`; undefined outside local development. */
  devToken: string | undefined;
}

/**
 * How a request to the admin surface proves it comes from the Merchant Center app: a gateway JWT,
 * or, in local development, the dev token. `null` when neither is configured (the surface is closed).
 */
export function editorAuth({ projectKey, mc, devToken }: EditorAuthOptions): Authenticate | null {
  const jwt = mc ? mcAuth(mc.config, projectKey, mc.keys) : null;
  const dev = devToken ? devAuth(devToken, projectKey) : null;
  if (jwt && dev) {
    // A signed JWT is never equal to the token, so the token check decides first and the JWT is
    // checked for everything else; the real sign-in path keeps working while developing.
    return async (req, reply) => {
      const presented = bearerOf(req);
      return presented !== undefined && safeEqual(presented, devToken!) ? dev(req, reply) : jwt(req, reply);
    };
  }
  return jwt ?? dev;
}
