/**
 * The render call. Never throws: every failure is classified so the mount can render the host's
 * fallback and the dev console can say why.
 *
 * No caching here by design: `cache: 'no-store'` keeps Next's data cache out of it, and the
 * service already caches commercetools reads. No stale-on-error either; a failure renders the
 * fallback.
 */

import type { ShimConfig } from './config.js';
import { WIRE_VERSION, type RenderResult } from './wire.js';

export interface RenderParams {
  path: string;
  locale: string;
  currency: string;
  country: string;
  store?: string;
  /** The host page's query string (without `?`). */
  search?: string;
}

export type RenderOutcome =
  | { status: 'ok'; tree: RenderResult }
  | { status: 'not_found' }
  | { status: 'error'; reason: 'timeout' | 'network' | 'unauthorized' | 'forbidden' | 'wire_version' | 'bad_response' | 'server' | 'bad_route'; httpStatus?: number; detail?: string };

export function renderUrl(config: Pick<ShimConfig, 'serviceUrl'>, params: RenderParams): string {
  const q = new URLSearchParams({
    path: params.path,
    locale: params.locale,
    currency: params.currency,
    country: params.country,
  });
  if (params.store) q.set('store', params.store);
  if (params.search) q.set('search', params.search);
  return `${config.serviceUrl}/v1/render?${q.toString()}`;
}

function isRenderResult(value: unknown): value is RenderResult {
  return !!value && typeof value === 'object' && Array.isArray((value as RenderResult).sections);
}

export async function fetchRender(
  config: ShimConfig,
  params: RenderParams,
  fetchImpl: typeof fetch = fetch
): Promise<RenderOutcome> {
  const headers: Record<string, string> = { 'x-pb-wire-version': String(WIRE_VERSION), accept: 'application/json' };
  if (config.renderKey) headers['x-pb-render-key'] = config.renderKey;
  if (config.origin) headers['x-pb-origin'] = config.origin;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const res = await fetchImpl(renderUrl(config, params), {
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });

    if (res.status === 404) {
      // Only the service's own "no such page" answer means the path has no page. Any other 404
      // (wrong PB_SERVICE_URL, a proxy, a stale route) is a misconfiguration, so it must not
      // look like a missing page.
      if ((await peekCode(res)) === 'page_not_found') return { status: 'not_found' };
      return { status: 'error', reason: 'bad_route', httpStatus: 404, detail: await peekMessage(res) };
    }
    if (res.status === 401) return { status: 'error', reason: 'unauthorized', httpStatus: 401 };
    if (res.status === 403) return { status: 'error', reason: 'forbidden', httpStatus: 403 };
    if (res.status === 426 || (res.status === 400 && (await peekCode(res)) === 'wire_version_required')) {
      return { status: 'error', reason: 'wire_version', httpStatus: res.status, detail: await peekMessage(res) };
    }
    if (!res.ok) return { status: 'error', reason: 'server', httpStatus: res.status };

    const body: unknown = await res.json();
    return isRenderResult(body) ? { status: 'ok', tree: body } : { status: 'error', reason: 'bad_response', httpStatus: res.status };
  } catch (err) {
    const aborted = controller.signal.aborted || (err as { name?: string } | null)?.name === 'AbortError';
    return aborted
      ? { status: 'error', reason: 'timeout' }
      : { status: 'error', reason: 'network', detail: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function peekBody(res: Response): Promise<{ error?: { code?: string; message?: string } } | null> {
  try {
    return (await res.clone().json()) as { error?: { code?: string; message?: string } };
  } catch {
    return null;
  }
}
const peekCode = async (res: Response): Promise<string | undefined> => (await peekBody(res))?.error?.code;
const peekMessage = async (res: Response): Promise<string | undefined> => (await peekBody(res))?.error?.message;
