/** Test helper: a signing key pair standing in for the Merchant Center API Gateway. */

import { generateKeyPair, SignJWT, type JWTPayload } from 'jose';

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

export const ISSUER = 'https://mc-api.test';
export const AUDIENCE = 'https://svc.test';
export const PROJECT = 'us-store';

export async function mcKit() {
  const pair = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  const sign = (
    over: { claims?: JWTPayload; issuer?: string; audience?: string; sub?: string | null; key?: PrivateKey; alg?: string; expires?: string } = {}
  ) => {
    const iss = over.issuer ?? ISSUER;
    const jwt = new SignJWT({ [`${iss}/claims/project_key`]: PROJECT, ...over.claims })
      .setProtectedHeader({ alg: over.alg ?? 'RS256' })
      .setIssuer(iss)
      .setAudience(over.audience ?? AUDIENCE)
      .setExpirationTime(over.expires ?? '5m');
    if (over.sub !== null) jwt.setSubject(over.sub ?? 'user-1');
    return jwt.sign(over.key ?? pair.privateKey);
  };
  return { keys: async () => pair.publicKey, sign, other };
}

