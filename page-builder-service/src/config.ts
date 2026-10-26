/**
 * Typed service configuration, read once at startup from the environment.
 *
 * Fails fast: every missing/invalid value is reported in a single error so a bad deploy
 * is fixed in one pass. Production (`NODE_ENV=production`) requires the CT credentials,
 * render key, render-origin allowlist and admin secret; outside production the render key
 * and allowlist are optional and an unset one skips that check.
 */

export interface CtConfig {
  projectKey: string;
  clientId: string;
  clientSecret: string;
  authUrl: string;
  apiUrl: string;
  scopes: string;
}

export interface ServiceConfig {
  production: boolean;
  port: number;
  host: string;
  /** URL prefix every route is mounted under; Connect does not strip the app's `endpoint`. */
  basePath: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  ct: CtConfig | null;
  /** `PB_PREVIEW_TOKEN` — preview and edit are gated on a match; unset closes the feature. */
  previewToken: string | undefined;
  /** `PB_RENDER_KEY` — presented by the shim on render calls. */
  renderKey: string | undefined;
  /** Server origins allowed to call the render API (`PB_RENDER_ORIGINS`). */
  renderOrigins: string[];
  /** Merchant Center origins the bridge may talk to (`PB_EDITOR_ORIGINS`). */
  editorOrigins: string[];
  /** `PB_ADMIN_SECRET` — bearer token for catalog push/publish. */
  adminSecret: string | undefined;
  /** Merchant Center JWT verification for the admin API; null disables `/v1/admin/*`. */
  mc: McConfig | null;
  /** Seconds to cache commercetools reads for; 0 disables the cache. */
  cacheTtlSeconds: number;
  /** Attribute names to offer as facets, in order; empty derives them from product types. */
  facetAttributes: string[];
  /** Maximum derived facets when `facetAttributes` is empty. */
  facetLimit: number;
}

export interface McConfig {
  /** The MC API Gateway URL that issues the forwarded JWTs. */
  issuer: string;
  /** This service's public origin, as the gateway puts it in the JWT `aud` claim. */
  audience: string;
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid page-builder service configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

const CT_KEYS = [
  'CTP_PROJECT_KEY',
  'CTP_CLIENT_ID',
  'CTP_CLIENT_SECRET',
  'CTP_AUTH_URL',
  'CTP_API_URL',
] as const;

/**
 * Connect's conventional configuration names (`CTP_REGION`, `CTP_SCOPE`) are accepted as
 * aliases: the region derives the auth/API URLs unless those are set explicitly.
 */
function withConnectAliases(
  env: Record<string, string | undefined>
): Record<string, string | undefined> {
  const region = env.CTP_REGION;
  return {
    ...env,
    CTP_AUTH_URL: env.CTP_AUTH_URL || (region ? `https://auth.${region}.commercetools.com` : undefined),
    CTP_API_URL: env.CTP_API_URL || (region ? `https://api.${region}.commercetools.com` : undefined),
    CTP_SCOPES: env.CTP_SCOPES || env.CTP_SCOPE,
  };
}

function normaliseBasePath(raw: string | undefined, problems: string[]): string {
  const value = (raw ?? '').trim();
  if (value === '' || value === '/') return '';
  if (!/^\/?[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\/?$/.test(value)) {
    problems.push(`PB_BASE_PATH: "${raw}" is not a valid path prefix`);
    return '';
  }
  return `/${value.replace(/^\/+|\/+$/g, '')}`;
}

/** Custom objects (read + write) plus the commercetools reads the resolvers perform. */
const defaultScopes = (projectKey: string): string =>
  ['manage_key_value_documents', 'view_products', 'view_categories', 'view_stores']
    .map((scope) => `${scope}:${projectKey}`)
    .join(' ');

const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;

const list = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** Cloud identifier → MC API Gateway URL (`@commercetools-backend/express` `MC_API_URLS`). */
const MC_ISSUERS: Record<string, string> = {
  'gcp-au': 'https://mc-api.australia-southeast1.gcp.commercetools.com',
  'gcp-eu': 'https://mc-api.europe-west1.gcp.commercetools.com',
  'gcp-us': 'https://mc-api.us-central1.gcp.commercetools.com',
  'aws-eu': 'https://mc-api.eu-central-1.aws.commercetools.com',
  'aws-us': 'https://mc-api.us-east-2.aws.commercetools.com',
};

const trimSlash = (url: string): string => url.replace(/\/+$/, '');

function parseOrigin(raw: string, name: string, problems: string[]): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('scheme');
    return url.origin;
  } catch {
    problems.push(`${name}: "${raw}" is not an http(s) origin`);
    return null;
  }
}

function origins(value: string | undefined, name: string, problems: string[]): string[] {
  return list(value)
    .map((raw) => parseOrigin(raw, name, problems))
    .filter((o): o is string => o !== null);
}

type Env = Record<string, string | undefined>;

function parsePort(env: Env, problems: string[]): number {
  const portRaw = env.PORT ?? '8080';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    problems.push(`PORT: "${portRaw}" is not a valid port`);
  }
  return port;
}

function parseCacheTtl(env: Env, problems: string[]): number {
  const ttlRaw = env.PB_CACHE_TTL_SECONDS ?? '15';
  const cacheTtlSeconds = Number(ttlRaw);
  if (!Number.isFinite(cacheTtlSeconds) || cacheTtlSeconds < 0) {
    problems.push(`PB_CACHE_TTL_SECONDS: "${ttlRaw}" must be a number >= 0`);
  }
  return cacheTtlSeconds;
}

function parseLogLevel(env: Env, problems: string[]): ServiceConfig['logLevel'] {
  const logLevel = (env.LOG_LEVEL ?? 'info') as ServiceConfig['logLevel'];
  if (!LOG_LEVELS.includes(logLevel)) {
    problems.push(`LOG_LEVEL: "${env.LOG_LEVEL}" must be one of ${LOG_LEVELS.join(', ')}`);
  }
  return logLevel;
}

function parseFacetLimit(env: Env, problems: string[]): number {
  const facetLimitRaw = env.PB_FACET_LIMIT ?? '8';
  const facetLimit = Number(facetLimitRaw);
  if (!Number.isInteger(facetLimit) || facetLimit < 0) {
    problems.push(`PB_FACET_LIMIT: "${facetLimitRaw}" must be an integer >= 0`);
  }
  return facetLimit;
}

function loadCt(env: Env, production: boolean, problems: string[]): CtConfig | null {
  const missingCt = CT_KEYS.filter((k) => !env[k]);
  if (missingCt.length === 0) {
    return {
      projectKey: env.CTP_PROJECT_KEY!,
      clientId: env.CTP_CLIENT_ID!,
      clientSecret: env.CTP_CLIENT_SECRET!,
      authUrl: trimSlash(env.CTP_AUTH_URL!),
      apiUrl: trimSlash(env.CTP_API_URL!),
      scopes: env.CTP_SCOPES || defaultScopes(env.CTP_PROJECT_KEY!),
    };
  }
  if (production || missingCt.length < CT_KEYS.length) {
    // Partially-set credentials are always a mistake, even in development.
    problems.push(`commercetools credentials incomplete, missing: ${missingCt.join(', ')}`);
  }
  return null;
}

function requireProductionSettings(
  renderKey: string | undefined,
  renderOrigins: string[],
  adminSecret: string | undefined,
  problems: string[]
): void {
  if (!renderKey) problems.push('PB_RENDER_KEY is required in production');
  if (renderOrigins.length === 0) problems.push('PB_RENDER_ORIGINS is required in production');
  if (!adminSecret) problems.push('PB_ADMIN_SECRET is required in production');
}

export function loadConfig(rawEnv: Record<string, string | undefined> = process.env): ServiceConfig {
  const env = withConnectAliases(rawEnv);
  const problems: string[] = [];
  const production = env.NODE_ENV === 'production';

  const port = parsePort(env, problems);
  const cacheTtlSeconds = parseCacheTtl(env, problems);
  const logLevel = parseLogLevel(env, problems);
  const ct = loadCt(env, production, problems);
  const renderOrigins = origins(env.PB_RENDER_ORIGINS, 'PB_RENDER_ORIGINS', problems);
  const editorOrigins = origins(env.PB_EDITOR_ORIGINS, 'PB_EDITOR_ORIGINS', problems);
  const basePath = normaliseBasePath(env.PB_BASE_PATH, problems);
  const facetLimit = parseFacetLimit(env, problems);
  const mc = loadMc(env, problems);
  const renderKey = env.PB_RENDER_KEY || undefined;
  const adminSecret = env.PB_ADMIN_SECRET || undefined;

  if (production) requireProductionSettings(renderKey, renderOrigins, adminSecret, problems);

  if (problems.length > 0) throw new ConfigError(problems);

  return {
    production,
    port,
    host: env.HOST ?? '0.0.0.0',
    basePath,
    logLevel,
    ct,
    previewToken: env.PB_PREVIEW_TOKEN || undefined,
    renderKey,
    renderOrigins,
    editorOrigins,
    adminSecret,
    mc,
    cacheTtlSeconds,
    facetAttributes: list(env.PB_FACET_ATTRIBUTES),
    facetLimit,
  };
}

function loadMc(env: Record<string, string | undefined>, problems: string[]): McConfig | null {
  const issuerRaw = env.PB_MC_ISSUER?.trim();
  const audienceRaw = env.PB_MC_AUDIENCE?.trim();
  if (!issuerRaw && !audienceRaw) return null;
  if (!issuerRaw || !audienceRaw) {
    problems.push('PB_MC_ISSUER and PB_MC_AUDIENCE must be set together');
    return null;
  }
  const issuer = MC_ISSUERS[issuerRaw] ?? trimSlash(issuerRaw);
  try {
    new URL(issuer);
  } catch {
    problems.push(`PB_MC_ISSUER: "${issuerRaw}" is neither a cloud identifier nor a URL`);
    return null;
  }
  const audience = parseOrigin(audienceRaw, 'PB_MC_AUDIENCE', problems);
  return audience ? { issuer, audience } : null;
}
