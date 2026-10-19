/**
 * Request → render pipeline: the single helper a host route calls to turn an incoming
 * request into render-ready sections. Owns preview/edit gating, `pb_page_id` handling, the
 * store read, the transform, and data-source + per-block resolution — the glue hosts used to
 * hand-assemble (and get wrong).
 *
 * Framework-agnostic: takes a `SearchParams` (see `readSearchParams`) and an injected
 * `PageStore`; the host binds Next's `await searchParams` / `router.refresh`.
 */

import { isEditRequest, isPreviewRequest, previewPageId, type SearchParams } from './preview.js';
import { transformPageEditorToSections } from './transform.js';
import type { SavedDataSource } from './contract.js';
import type { RenderableRegistry } from './registry.js';
import type { BaseDataSourceContext, LayoutSection, ResolverMap } from './types.js';
import type { PageStore } from './page-store.js';

export interface PageBuilderRoute {
  sections: LayoutSection[];
  editMode: boolean;
  preview: boolean;
}

export interface ResolvePageBuilderRouteArgs<Ctx extends BaseDataSourceContext> {
  /** The route's incoming query params — wrap them with `readSearchParams(await searchParams)`. */
  searchParams: SearchParams;
  /** This route's own page id (e.g. `home`, `pdp`, `category-<id>`). */
  pageId: string;
  /** `PB_PREVIEW_TOKEN`; preview + edit are both gated on a match. */
  previewToken: string | undefined;
  store: PageStore;
  /** Render context passed to resolvers (extends `{ locale }`). */
  context: Ctx;
  defaultLocale: string;
  /** The combined registry — supplies the per-block resolvers to run in the transform. */
  registry: Pick<RenderableRegistry<Ctx>, 'resolversByType'>;
  /** Saved-data-source resolvers (keyed by data-source type). Defaults to none. */
  resolvers?: ResolverMap<Ctx>;
  /** Saved-data-source instances (id → source). Defaults to empty. */
  dsMap?: Map<string, SavedDataSource>;
}

/**
 * Resolve the current request to render-ready sections, or `null` when no renderable page
 * exists for this route (the host then falls back to its own markup).
 */
export async function resolvePageBuilderRoute<Ctx extends BaseDataSourceContext>(
  args: ResolvePageBuilderRouteArgs<Ctx>
): Promise<PageBuilderRoute | null> {
  const { searchParams, pageId, previewToken, store, context, defaultLocale, registry } = args;

  const preview = isPreviewRequest(searchParams, previewToken);
  const editMode = isEditRequest(searchParams, previewToken);

  // In preview, honor the exact page the editor asked for (`pb_page_id`) rather than
  // re-deriving it from the route slug.
  const pbPageId = previewPageId(searchParams);
  const requestedId = preview && pbPageId ? pbPageId : pageId;

  const payload = await store.loadPage(requestedId, { preview });
  if (!payload || payload.page.MAIN.length === 0) return null;

  // Fail loud in dev when the loaded object isn't the one the editor is editing — the
  // silent version of this mismatch is exactly the "clicking does nothing" bug.
  if (process.env.NODE_ENV !== 'production' && pbPageId && payload.pageId !== pbPageId) {
    // eslint-disable-next-line no-console
    console.warn(
      `[page-builder] loaded page "${payload.pageId}" but the editor requested pb_page_id="${pbPageId}". ` +
        `The preview may render a different object than you're editing — check the page container/key.`
    );
  }

  const sections = await transformPageEditorToSections(payload, args.dsMap ?? new Map(), context, {
    resolvers: args.resolvers ?? {},
    defaultLocale,
    blockResolvers: registry.resolversByType,
  });

  return { sections, editMode, preview };
}
