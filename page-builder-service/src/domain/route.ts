/**
 * Request path → page.
 *
 * The MC app stores, per project, the public URL templates of the host's routes
 * (`settings.preview.routes`: `home`, `category`, `pdp`, `content`, with `{locale}`, `{slug}`,
 * `{sku}` and arbitrary `{var}` tokens). The service matches the incoming path against those,
 * so hosts carry no routing knowledge. Page ids then follow the editor's conventions:
 * `home`, `<slug>` for content pages, `<categoryId>` → `cat-root` for category listings, and
 * `pdp-<categoryId>` → `pdp-cat-root` → `pdp` for product pages.
 */

import type { PreviewSettings, PreviewRouteTemplates } from './types.js';

export type RouteMatch =
  | { type: 'home' }
  | { type: 'category'; slug: string }
  | { type: 'pdp'; slug: string; sku: string }
  | { type: 'content'; slug: string };

export const DEFAULT_ROUTES: Required<PreviewRouteTemplates> = {
  home: '/{locale}',
  category: '/{locale}/category/{slug}',
  pdp: '/{locale}/{slug}/p/{sku}',
  content: '/{locale}/{slug}',
};

type RouteType = keyof PreviewRouteTemplates;

interface Compiled {
  type: RouteType;
  segments: string[];
  literals: number;
}

const TOKEN = /^\{(\w+)\}$/;

const segmentsOf = (path: string): string[] => path.split('?')[0].split('/').filter(Boolean);

function compile(type: RouteType, template: string): Compiled {
  const segments = segmentsOf(template);
  return { type, segments, literals: segments.filter((s) => !TOKEN.test(s)).length };
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function matchOne(c: Compiled, path: string[]): Record<string, string> | null {
  if (c.segments.length !== path.length) return null;
  const captured: Record<string, string> = {};
  for (let i = 0; i < c.segments.length; i++) {
    const token = c.segments[i].match(TOKEN);
    if (token) captured[token[1]] = safeDecode(path[i]);
    else if (c.segments[i].toLowerCase() !== path[i].toLowerCase()) return null;
  }
  return captured;
}

function compileRoutes(settings: Pick<PreviewSettings, 'routes'> | undefined): Compiled[] {
  const routes = { ...DEFAULT_ROUTES, ...(settings?.routes ?? {}) };
  return (Object.keys(DEFAULT_ROUTES) as RouteType[])
    .map((type) => compile(type, routes[type] ?? DEFAULT_ROUTES[type]))
    // More literal segments first, then longer templates, then a stable type order.
    .sort((a, b) => b.literals - a.literals || b.segments.length - a.segments.length);
}

/** The route for a template that matched; null when its required captures are empty. */
function toRouteMatch(type: RouteType, captured: Record<string, string>): RouteMatch | null {
  switch (type) {
    case 'home':
      return { type: 'home' };
    case 'category':
      return captured.slug ? { type: 'category', slug: captured.slug } : null;
    case 'pdp':
      return captured.sku ? { type: 'pdp', slug: captured.slug ?? '', sku: captured.sku } : null;
    case 'content':
      return captured.slug ? { type: 'content', slug: captured.slug } : null;
  }
}

/** Match a request path against the configured route templates; most specific template wins. */
export function matchRoute(path: string, settings: Pick<PreviewSettings, 'routes'> | undefined): RouteMatch | null {
  const compiled = compileRoutes(settings);
  const parts = segmentsOf(path);
  for (const c of compiled) {
    const captured = matchOne(c, parts);
    const match = captured && toRouteMatch(c.type, captured);
    if (match) return match;
  }
  return null;
}

export interface PageIdDeps {
  /** Category id for a slug, or null. */
  categoryIdForSlug(slug: string): Promise<string | null>;
  /** Primary category id of the product with this sku, or null (also when the product is unknown). */
  primaryCategoryIdForSku(sku: string): Promise<string | null>;
}

/** Page ids to try, in order, for a matched route; the first renderable page wins. */
export async function candidatePageIds(
  route: RouteMatch,
  settings: Pick<PreviewSettings, 'homePageId'> | undefined,
  deps: PageIdDeps
): Promise<string[]> {
  switch (route.type) {
    case 'home':
      return [settings?.homePageId || 'home'];
    case 'content':
      return [route.slug];
    case 'category': {
      const id = await deps.categoryIdForSlug(route.slug);
      return id ? [id, 'cat-root'] : [];
    }
    case 'pdp': {
      const id = await deps.primaryCategoryIdForSku(route.sku);
      return id ? [`pdp-${id}`, 'pdp-cat-root', 'pdp'] : ['pdp-cat-root', 'pdp'];
    }
  }
}
