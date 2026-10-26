import type { PreviewSettings } from './types';

/**
 * Arbitrary ("static") pages are addressed by a single-segment URL slug that
 * doubles as the page's `pageId` and its custom-object key suffix
 * (`page-<slug>`). The host serves them at `/{locale}/{brand}/<slug>`. There is
 * no `/content/` prefix — validity is derived dynamically from the configured
 * home/PLP/PDP route templates + existing page ids (see `validateArbitrarySlug`).
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Best-effort normalization of free text into a single-segment slug. */
export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '') // strip leading slashes
    .replace(/\/+$/, '') // strip trailing slashes
    .replace(/[\s_]+/g, '-') // spaces / underscores -> hyphen
    .replace(/[^a-z0-9-]/g, '') // drop anything not slug-safe
    .replace(/-{2,}/g, '-') // collapse repeats
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}

/** The canonical URL path for an arbitrary page slug (host adds locale/brand). */
export function pathForSlug(slug: string): string {
  return `/${slug}`;
}

/**
 * Known host-static first segments at `/{locale}/{brand}/<seg>` that would
 * shadow — or be shadowed by — an arbitrary page. Kept small and explicit; the
 * dynamic route-template check below covers project-configured routes.
 */
const HOST_STATIC_SEGMENTS = [
  'account',
  'cart',
  'checkout',
  'search',
  'login',
  'register',
  'forgot-password',
  'reset-password',
];

/** First non-token path segment of a route template, skipping a leading
 *  `{locale}`/`{brand}`… token run. e.g. `/{locale}/category/{slug}` → `category`. */
function firstLiteralSegment(template: string): string | null {
  for (const seg of template.split('/').filter(Boolean)) {
    if (/^\{.*\}$/.test(seg)) continue; // skip tokens like {locale}, {brand}
    return seg.toLowerCase();
  }
  return null;
}

/**
 * Slugs an arbitrary page must NOT use because they collide with a reserved
 * page id or a configured/host route. Derived dynamically from the preview
 * route templates (their first literal segment after the leading tokens) plus
 * the fixed page-editor ids, the live category ids and host-static routes.
 */
export function reservedSlugs(
  settings: Pick<PreviewSettings, 'routes' | 'homePageId'> | null | undefined,
  categoryIds: Iterable<string> = []
): Set<string> {
  const reserved = new Set<string>([
    'home',
    settings?.homePageId || 'home',
    'cat-root',
    'pdp-cat-root',
    ...HOST_STATIC_SEGMENTS,
  ]);
  if (settings?.routes) {
    for (const template of Object.values(settings.routes)) {
      const literal = firstLiteralSegment(template);
      if (literal) reserved.add(literal);
    }
  }
  for (const id of categoryIds) reserved.add(id);
  return reserved;
}

export type SlugValidationReason =
  | 'empty'
  | 'format'
  | 'reserved'
  | 'duplicate';

export type SlugValidationResult =
  | { ok: true }
  | { ok: false; reason: SlugValidationReason };

/**
 * Dynamic verification that a proposed arbitrary-page slug does not conflict
 * with the home/PLP/PDP patterns (read live from `settings.routes`) or with an
 * existing page. `existingPageIds` is the id set from `useBuiltPageIds`.
 */
export function validateArbitrarySlug(args: {
  slug: string;
  settings: Pick<PreviewSettings, 'routes' | 'homePageId'> | null | undefined;
  existingPageIds: { has(id: string): boolean };
  categoryIds?: Iterable<string>;
}): SlugValidationResult {
  const { slug, settings, existingPageIds, categoryIds } = args;
  if (!slug) return { ok: false, reason: 'empty' };
  if (!isValidSlug(slug)) return { ok: false, reason: 'format' };
  if (reservedSlugs(settings, categoryIds).has(slug))
    return { ok: false, reason: 'reserved' };
  if (existingPageIds.has(slug)) return { ok: false, reason: 'duplicate' };
  return { ok: true };
}
