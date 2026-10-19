/**
 * Environment / credential loading for the sync CLI.
 *
 * Ported from seed/scripts/_lib.js. Zero dependencies. Credentials are read from the process
 * environment — defaulting to the host's own `.env` (see `hydrateEnv` in `../cli.js`), the
 * same file/client the storefront runtime uses. The write scope required is
 * `manage_key_value_documents`; grant it on the runtime client alongside whatever scope the
 * storefront already needs, rather than provisioning a second client. Pass `--env <path>` at
 * the CLI if you'd rather keep a dedicated deploy-time client/file instead — both are
 * supported, this is a deploy-pipeline preference, not a requirement of the CLI itself.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type CtEnv = {
  projectKey: string;
  clientId: string;
  clientSecret: string;
  authUrl: string;
  apiUrl: string;
  scopes: string;
};

const REQUIRED = [
  'CTP_PROJECT_KEY',
  'CTP_CLIENT_ID',
  'CTP_CLIENT_SECRET',
  'CTP_AUTH_URL',
  'CTP_API_URL',
] as const;

/**
 * Populate process.env from a dotenv-style file (does not overwrite already-set vars).
 * No-op if the file does not exist and `optional` is true.
 */
export function loadEnv(envFile: string, optional = false): void {
  const envPath = path.resolve(process.cwd(), envFile);
  if (!fs.existsSync(envPath)) {
    if (optional) return;
    throw new Error(
      `env file not found: ${envPath}\n` +
        `Create it (see .env.example) or pass --env <path>.`
    );
  }
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

/** Validate + collect required CT credentials from the environment. */
export function requireEnv(): CtEnv {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`missing required env variables: ${missing.join(', ')}`);
  }
  const projectKey = process.env.CTP_PROJECT_KEY!;
  return {
    projectKey,
    clientId: process.env.CTP_CLIENT_ID!,
    clientSecret: process.env.CTP_CLIENT_SECRET!,
    authUrl: process.env.CTP_AUTH_URL!.replace(/\/$/, ''),
    apiUrl: process.env.CTP_API_URL!.replace(/\/$/, ''),
    // Defaults to the minimal write scope, project-scoped, when CTP_SCOPES is unset.
    scopes: process.env.CTP_SCOPES || `manage_key_value_documents:${projectKey}`,
  };
}
