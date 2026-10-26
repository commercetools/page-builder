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
 */

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { FastifyReply, FastifyRequest } from 'fastify';
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

function deny(reply: FastifyReply, code: string, message: string): FastifyReply {
  return reply.code(401).send({ error: { code, message } });
}

export function mcAuth(
  mc: McConfig,
  projectKey: string,
  keys: JWTVerifyGetKey
): (req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | void> {
  return async (req, reply) => {
    const match = /^Bearer (.+)$/.exec(typeof req.headers.authorization === 'string' ? req.headers.authorization : '');
    if (!match) return deny(reply, 'missing_token', 'Missing Merchant Center token');

    let payload;
    try {
      ({ payload } = await jwtVerify(match[1]!, keys, {
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
