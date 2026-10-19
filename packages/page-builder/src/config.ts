/**
 * Typed runtime config for the host storefront.
 *
 * A single validated accessor for the `PB_*` / `CTP_*` environment contract, so the preview
 * gate, the bridge mount, and any CT read all read the same values from one place instead of
 * scattering `process.env` lookups (a token typo used to silently disable edit mode).
 *
 * Pure and edge-safe: no `node:fs`/`node:path`. The CLI's dotenv `loadEnv` lives in
 * `./core/env` (Node-only); the `CtEnv` type here is a type-only import (erased at runtime).
 */

import type { CtEnv } from './core/env.js';

export type { CtEnv } from './core/env.js';

export interface PageBuilderConfig {
  /** Merchant Center origins allowed to embed + drive the bridge (`PB_ALLOWED_ORIGINS`). */
  allowedOrigins: string[];
  /** `PB_PREVIEW_TOKEN` — preview/edit are gated on a match. */
  previewToken: string | undefined;
  /** `DYNAMIC_PAGES === 'true'` — serve page content from CT rather than hardcoded markup. */
  dynamicPages: boolean;
  /** Runtime CT credentials, or `null` when not all `CTP_*` vars are present. */
  ct: CtEnv | null;
}

const CT_KEYS = [
  'CTP_PROJECT_KEY',
  'CTP_CLIENT_ID',
  'CTP_CLIENT_SECRET',
  'CTP_AUTH_URL',
  'CTP_API_URL',
] as const;

/** Read + validate the page-builder env contract from a plain record (default `process.env`). */
export function getPageBuilderConfig(
  env: Record<string, string | undefined> = process.env
): PageBuilderConfig {
  const allowedOrigins = (env.PB_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const hasCt = CT_KEYS.every((k) => env[k]);
  const ct: CtEnv | null = hasCt
    ? {
        projectKey: env.CTP_PROJECT_KEY!,
        clientId: env.CTP_CLIENT_ID!,
        clientSecret: env.CTP_CLIENT_SECRET!,
        authUrl: env.CTP_AUTH_URL!.replace(/\/$/, ''),
        apiUrl: env.CTP_API_URL!.replace(/\/$/, ''),
        scopes: env.CTP_SCOPES || `manage_key_value_documents:${env.CTP_PROJECT_KEY}`,
      }
    : null;

  return {
    allowedOrigins,
    previewToken: env.PB_PREVIEW_TOKEN,
    dynamicPages: env.DYNAMIC_PAGES === 'true',
    ct,
  };
}
