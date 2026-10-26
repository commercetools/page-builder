/**
 * `GET /v1/render` — path + locale + context → render tree.
 *
 * Preview gating lives here, not in the host: a valid `pb_preview` token (compared in constant
 * time) selects the draft head and bypasses the cache; `pb_edit=1` additionally turns on edit
 * mode; `pb_page_id` pins the page the editor asked for. Without a valid token those params are
 * ignored, so a shopper can never reach drafts or edit mode.
 */

import type { FastifyInstance } from 'fastify';
import { renderAuth, safeEqual } from '../auth.js';
import type { Commerce } from '../commerce/index.js';
import type { ServiceConfig } from '../config.js';
import type { CatalogReader, LoadedCatalog } from '../domain/catalog-store.js';
import type { PageStore } from '../domain/page-store.js';
import { candidatePageIds, matchRoute } from '../domain/route.js';
import { buildSections } from '../domain/transform.js';
import type { LayoutSection, PagePayload, PreviewSettings } from '../domain/types.js';
import { createMemo, type RenderEnv } from '../resolve/env.js';
import { createItemResolver } from '../resolve/item.js';
import { routeCategory, routeProduct } from '../resolve/route-data.js';
import { WIRE_VERSION, requireWireVersion } from '../wire-version.js';
import type { components } from '../generated/api.js';

type RenderResult = components['schemas']['RenderResult'];

export interface RenderDeps {
  config: ServiceConfig;
  pages: PageStore;
  catalog: CatalogReader;
  commerce: Commerce;
}

interface RenderQuery {
  path: string;
  locale: string;
  store?: string;
  currency: string;
  country: string;
  search?: string;
}

const querystring = {
  type: 'object',
  required: ['path', 'locale', 'currency', 'country'],
  properties: {
    path: { type: 'string', minLength: 1 },
    locale: { type: 'string', minLength: 2 },
    store: { type: 'string', minLength: 1 },
    currency: { type: 'string', pattern: '^[A-Z]{3}$' },
    country: { type: 'string', pattern: '^[A-Z]{2}$' },
    search: { type: 'string' },
  },
} as const;

const renderable = (p: PagePayload | null): p is PagePayload => !!p && (p.page?.MAIN?.length ?? 0) > 0;

interface PreviewState {
  preview: boolean;
  editMode: boolean;
  pinnedPageId: string | null;
}

function previewState(query: URLSearchParams, previewToken: string | undefined): PreviewState {
  const token = query.get('pb_preview');
  const preview = !!previewToken && !!token && safeEqual(token, previewToken);
  const editMode = preview && query.get('pb_edit') === '1';
  const pinnedPageId = preview ? query.get('pb_page_id') : null;
  return { preview, editMode, pinnedPageId };
}

function candidatesFor(pinnedPageId: string | null, settings: PreviewSettings, env: RenderEnv): Promise<string[]> {
  if (pinnedPageId) return Promise.resolve([pinnedPageId]);
  return candidatePageIds(env.route!, settings, {
    categoryIdForSlug: async () => (await routeCategory(env))?.id ?? null,
    primaryCategoryIdForSku: async () => (await routeProduct(env))?.categoryIds[0] ?? null,
  });
}

async function firstRenderablePage(pages: PageStore, ids: string[], preview: boolean): Promise<PagePayload | null> {
  for (const id of ids) {
    const loadedPage = await pages.loadPage(id, { preview });
    if (renderable(loadedPage)) return loadedPage;
  }
  return null;
}

function editModeFields(config: ServiceConfig, loaded: LoadedCatalog): Partial<RenderResult> {
  return {
    allowedOrigins: config.editorOrigins,
    manifest: [...loaded.components.values()].map((c) => ({
      type: c.type,
      inlineTextFields: c.inlineTextFields ?? [],
    })),
  };
}

function renderResult(
  config: ServiceConfig,
  payload: PagePayload,
  loaded: LoadedCatalog,
  sections: LayoutSection[],
  { preview, editMode }: PreviewState
): RenderResult {
  return {
    wireVersion: WIRE_VERSION,
    pageId: payload.pageId,
    preview,
    editMode,
    ...(loaded.theme ? { theme: loaded.theme } : {}),
    ...(editMode ? editModeFields(config, loaded) : {}),
    sections: sections as RenderResult['sections'],
  };
}

export function registerRender(app: FastifyInstance, deps: RenderDeps): void {
  const { config, pages, catalog, commerce } = deps;

  app.get<{ Querystring: RenderQuery }>(
    '/v1/render',
    {
      // `onRequest` runs before validation, so unauthenticated callers learn nothing, not even
      // which parameters are required.
      onRequest: [renderAuth(config), requireWireVersion],
      schema: { querystring },
    },
    async (req, reply) => {
      const { path, locale, currency, country, store, search } = req.query;
      const query = new URLSearchParams(search ?? '');

      const state = previewState(query, config.previewToken);
      const { preview, pinnedPageId } = state;

      const settings = await catalog.settings(preview);
      const route = matchRoute(path, settings);
      if (!route && !pinnedPageId) {
        return reply.code(404).send({ error: { code: 'page_not_found', message: 'No page matches this path' } });
      }

      const [loaded, instances] = await Promise.all([catalog.catalog(preview), catalog.instances(preview)]);
      const env: RenderEnv = {
        ctx: { locale, currency, country, ...(store ? { store } : {}), bypassCache: preview },
        defaultLocale: settings.defaultLocale ?? locale,
        commerce,
        route,
        query,
        instances,
        dataSources: loaded.dataSources,
        components: loaded.components,
        log: req.log,
        memo: createMemo(),
      };

      const candidates = await candidatesFor(pinnedPageId, settings, env);
      const payload = await firstRenderablePage(pages, candidates, preview);
      if (!payload) {
        return reply.code(404).send({ error: { code: 'page_not_found', message: 'No renderable page for this path' } });
      }

      const sections = await buildSections(payload, createItemResolver(env));

      // The service already caches commercetools reads; HTTP caches must not add a second layer.
      return reply.header('cache-control', 'no-store').send(renderResult(config, payload, loaded, sections, state));
    }
  );
}
