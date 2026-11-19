/**
 * The shim's whole configuration: where the service is and how to identify to it. Props win
 * over environment variables, which win over defaults.
 *
 * - `PB_SERVICE_URL` — the service's base URL including its Connect endpoint,
 *   e.g. `https://service-….europe-west1.gcp.commercetools.app/service`.
 * - `PB_RENDER_KEY`  — the render key (required by the service in production).
 * - `PB_ORIGIN`      — this storefront's public origin, sent as `X-PB-Origin` because a
 *   server-side fetch carries no browser `Origin`; checked against the service's allowlist.
 * - `PB_TIMEOUT_MS`  — render call timeout (default 2000).
 */

export interface ShimConfig {
  serviceUrl: string;
  renderKey?: string;
  origin?: string;
  timeoutMs: number;
}

export interface ShimConfigOverrides {
  serviceUrl?: string;
  renderKey?: string;
  origin?: string;
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 2000;

export class ShimConfigError extends Error {
  constructor(message: string) {
    super(`[page-builder] ${message}`);
    this.name = 'ShimConfigError';
  }
}

export function readConfig(
  overrides: ShimConfigOverrides = {},
  env: Record<string, string | undefined> = process.env
): ShimConfig {
  const serviceUrl = (overrides.serviceUrl ?? env.PB_SERVICE_URL ?? '').trim().replace(/\/+$/, '');
  if (!serviceUrl) {
    throw new ShimConfigError('PB_SERVICE_URL is not set (or pass `serviceUrl` to <PageBuilder>).');
  }
  try {
    const url = new URL(serviceUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('scheme');
  } catch {
    throw new ShimConfigError(`PB_SERVICE_URL "${serviceUrl}" is not an http(s) URL.`);
  }

  const timeoutRaw = overrides.timeoutMs ?? env.PB_TIMEOUT_MS;
  const timeoutMs = timeoutRaw === undefined || timeoutRaw === '' ? DEFAULT_TIMEOUT_MS : Number(timeoutRaw);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new ShimConfigError(`PB_TIMEOUT_MS "${timeoutRaw}" must be a positive number of milliseconds.`);
  }

  return {
    serviceUrl,
    renderKey: overrides.renderKey ?? (env.PB_RENDER_KEY || undefined),
    origin: overrides.origin ?? (env.PB_ORIGIN || undefined),
    timeoutMs,
  };
}
