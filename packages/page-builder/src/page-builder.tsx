/**
 * `<PageBuilder>` — the one thing a host route mounts.
 *
 * Fetches the render tree for the request from the page-builder service, renders it on the
 * self-contained grid with the host's components, and (in edit mode) mounts the visual-editing
 * bridge. The host knows nothing about commercetools, drafts, or preview gating: it forwards the
 * URL's query string and the service decides.
 *
 * No page for the path renders `fallback`; a failure (timeout, unreachable or misconfigured
 * service, rejected credentials) renders `errorFallback`, which defaults to `fallback`. Either
 * renders nothing when unset. There is no stale content and no host-side cache.
 */

import type { ReactNode } from 'react';
import { BridgeMount } from './bridge-mount.js';
import { fetchRender, type RenderOutcome } from './client.js';
import { readConfig, ShimConfigError, type ShimConfigOverrides } from './config.js';
import { Sections, type ComponentMap } from './grid.js';
import { buildCss } from './styles.js';

export type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | URLSearchParams
  | undefined;

export interface PageBuilderContext {
  locale: string;
  currency: string;
  country: string;
  /** commercetools store key; scopes products to the store. */
  store?: string;
}

export interface PageBuilderProps extends ShimConfigOverrides {
  /** Block `type` → component. */
  components: ComponentMap;
  /** The request's URL path, e.g. `/en-us/category/women`; the service maps it to a page. */
  path: string;
  /** The shopper's market: locale, currency, country (and store). */
  context: PageBuilderContext;
  /** The request's query string; forwards `pb_preview`/`pb_edit`/`pb_page_id`, facets and sort. */
  searchParams?: SearchParamsInput;
  /** Rendered when the service has no page for the path. */
  fallback?: ReactNode;
  /** Rendered when the service cannot be reached or answers with an error; defaults to `fallback`. */
  errorFallback?: ReactNode;
  /** Test seam. */
  fetch?: typeof fetch;
}

/** Serialise the framework's search params back into a query string (without `?`). */
export function toSearch(input: SearchParamsInput): string {
  if (!input) return '';
  if (input instanceof URLSearchParams) return input.toString();
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) q.append(key, v);
  }
  return q.toString();
}

function report(outcome: Extract<RenderOutcome, { status: 'error' }>): void {
  const detail = outcome.detail ? `: ${outcome.detail}` : '';
  const status = outcome.httpStatus ? ` (HTTP ${outcome.httpStatus})` : '';
  // eslint-disable-next-line no-console
  console.error(`[page-builder] render failed — ${outcome.reason}${status}${detail}; rendering the error fallback`);
}

export async function PageBuilder(props: PageBuilderProps): Promise<ReactNode> {
  const { components, path, context, searchParams, fallback = null } = props;
  const errorFallback = props.errorFallback ?? fallback;

  let config;
  try {
    config = readConfig(props);
  } catch (err) {
    if (!(err instanceof ShimConfigError) || process.env.NODE_ENV !== 'production') throw err;
    // eslint-disable-next-line no-console
    console.error(err.message);
    return errorFallback;
  }

  const outcome = await fetchRender(
    config,
    { path, ...context, search: toSearch(searchParams) },
    props.fetch
  );
  if (outcome.status === 'not_found') return fallback;
  if (outcome.status === 'error') {
    report(outcome);
    return errorFallback;
  }

  const { tree } = outcome;
  return (
    <>
      <style data-pb-styles dangerouslySetInnerHTML={{ __html: buildCss(tree.theme) }} />
      <Sections sections={tree.sections} components={components} theme={tree.theme} editMode={tree.editMode} />
      {tree.editMode ? <BridgeMount allowedOrigins={tree.allowedOrigins ?? []} manifest={tree.manifest ?? []} /> : null}
    </>
  );
}
