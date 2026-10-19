import type { PreviewPageType, PreviewSettings } from '../types';

export type PreviewUrlParams = {
  previewPageType: PreviewPageType;
  locale: string;
  slug?: string;
  sku?: string;
  /**
   * The page-editor page id being edited (the custom-object key suffix — e.g. a
   * category id, `pdp`, or `pdp-<categoryId>`). Sent as `pb_page_id` so the host
   * loads exactly this page-editor object in preview instead of re-deriving it
   * from the URL slug (which is a display slug, not the editor's id).
   */
  pageEditorId?: string;
  /** Phase 2+: request edit mode (enables the host visual-editing bridge). */
  edit?: boolean;
  /** Phase 2+: MC-app origin the host bridge should post back to. */
  origin?: string;
  /** Cache-busting value appended as `pb_ts` (e.g. on refresh). */
  cacheBust?: number | string;
};

const HOME_PAGE_ID_FALLBACK = 'home';

/**
 * Decide which host route to preview for the page being edited.
 * - `pdp`/`category` follow the builder page type.
 * - the configured home page id (default `home`) → `home`.
 * - everything else is an arbitrary single-segment page: its pageId IS the URL
 *   slug, rendered by the host at `/{locale}/{brand}/<slug>` (no `/content/`
 *   prefix) via the prefix-less `content` route template.
 */
export function resolvePreviewPageType(
  settings: Pick<PreviewSettings, 'homePageId'>,
  pageId: string,
  builderPageType: string
): PreviewPageType {
  if (builderPageType === 'pdp') return 'pdp';
  if (builderPageType === 'category') return 'category';
  const homeId = settings.homePageId || HOME_PAGE_ID_FALLBACK;
  if (pageId === homeId) return 'home';
  return 'content';
}

/**
 * Build the host preview URL for the current page, substituting
 * `{locale}`/`{slug}`/`{sku}` and any configured `vars` (e.g. `{brand}`) into
 * the page-type route template, then appending the draft flag `?pb_preview=`.
 * Returns `null` when the URL cannot be built (missing baseUrl/template).
 */
export function buildPreviewUrl(
  settings: PreviewSettings | null | undefined,
  params: PreviewUrlParams
): string | null {
  if (!settings?.baseUrl) return null;
  const template = settings.routes?.[params.previewPageType];
  if (!template) return null;

  const tokens: Record<string, string> = {
    locale: params.locale || settings.defaultLocale || '',
    slug: params.slug ?? '',
    sku: params.sku ?? '',
    ...(settings.vars ?? {}),
  };

  let path = template.replace(/\{(\w+)\}/g, (_match, key: string) =>
    encodeURIComponent(tokens[key] ?? '')
  );
  // Collapse any empty segments left by unresolved tokens.
  path = path.replace(/\/{2,}/g, '/');
  if (!path.startsWith('/')) path = `/${path}`;

  let url: URL;
  try {
    url = new URL(settings.baseUrl.replace(/\/+$/, '') + path);
  } catch {
    return null;
  }

  if (settings.token) url.searchParams.set('pb_preview', settings.token);
  if (params.pageEditorId)
    url.searchParams.set('pb_page_id', params.pageEditorId);
  if (params.edit) {
    url.searchParams.set('pb_edit', '1');
    if (params.origin) url.searchParams.set('pb_origin', params.origin);
  }
  if (params.cacheBust != null) {
    url.searchParams.set('pb_ts', String(params.cacheBust));
  }
  return url.toString();
}
