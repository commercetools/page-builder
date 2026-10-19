import { describe, expect, it, vi } from 'vitest';
import { resolvePageBuilderRoute } from './route.js';
import { readSearchParams } from './preview.js';
import type { PageStore } from './page-store.js';
import type { BaseDataSourceContext } from './types.js';
import {
  buildComponent,
  buildLayoutElement,
  buildPage,
  buildPublishedPayload,
} from './test-utils/factories.js';

const TOKEN = 'secret-token';
const ctx: BaseDataSourceContext = { locale: 'en-US' };

const pageWithContent = () =>
  buildPage({ MAIN: [buildLayoutElement({ children: [buildComponent()] })] });

const storeReturning = (
  payload: ReturnType<typeof buildPublishedPayload> | null
): PageStore & { loadPage: ReturnType<typeof vi.fn> } => ({
  loadPage: vi.fn(async () => payload),
});

const resolve = (
  over: {
    params?: Record<string, string | string[] | undefined>;
    pageId?: string;
    previewToken?: string;
    store?: PageStore;
  } = {}
) =>
  resolvePageBuilderRoute({
    searchParams: readSearchParams(over.params ?? {}),
    pageId: over.pageId ?? 'home',
    previewToken: 'previewToken' in over ? over.previewToken : TOKEN,
    store:
      over.store ??
      storeReturning(buildPublishedPayload({ pageId: 'home', page: pageWithContent() })),
    context: ctx,
    defaultLocale: 'en-US',
    registry: { resolversByType: {} },
  });

describe('resolvePageBuilderRoute', () => {
  it('renders the published page for an ordinary shopper request', async () => {
    const result = await resolve();
    expect(result).toMatchObject({ preview: false, editMode: false });
    expect(result?.sections).toHaveLength(1);
  });

  it('loads the published page, not the draft, without a preview token', async () => {
    const store = storeReturning(
      buildPublishedPayload({ pageId: 'home', page: pageWithContent() })
    );
    await resolve({ store });
    expect(store.loadPage).toHaveBeenCalledWith('home', { preview: false });
  });

  it('loads the draft for a valid preview request', async () => {
    const store = storeReturning(
      buildPublishedPayload({ pageId: 'home', page: pageWithContent() })
    );
    const result = await resolve({ store, params: { pb_preview: TOKEN } });

    expect(store.loadPage).toHaveBeenCalledWith('home', { preview: true });
    expect(result?.preview).toBe(true);
  });

  it('reports edit mode only when preview is valid too', async () => {
    const withBoth = await resolve({
      params: { pb_preview: TOKEN, pb_edit: '1' },
    });
    expect(withBoth?.editMode).toBe(true);

    const editOnly = await resolve({ params: { pb_edit: '1' } });
    expect(editOnly?.editMode).toBe(false);
  });

  it('honours pb_page_id in preview rather than the route slug', async () => {
    const store = storeReturning(
      buildPublishedPayload({ pageId: 'pdp-shoes', page: pageWithContent() })
    );
    await resolve({
      store,
      pageId: 'home',
      params: { pb_preview: TOKEN, pb_page_id: 'pdp-shoes' },
    });
    expect(store.loadPage).toHaveBeenCalledWith('pdp-shoes', { preview: true });
  });

  it('ignores pb_page_id outside preview, so it cannot be used to probe drafts', async () => {
    const store = storeReturning(
      buildPublishedPayload({ pageId: 'home', page: pageWithContent() })
    );
    await resolve({ store, params: { pb_page_id: 'secret-page' } });
    expect(store.loadPage).toHaveBeenCalledWith('home', { preview: false });
  });

  it('warns when the loaded page is not the one the editor asked for', async () => {
    // The silent version of this mismatch is the "clicking does nothing" bug.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = storeReturning(
      buildPublishedPayload({ pageId: 'something-else', page: pageWithContent() })
    );
    await resolve({
      store,
      params: { pb_preview: TOKEN, pb_page_id: 'pdp-shoes' },
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('pb_page_id="pdp-shoes"')
    );
    warn.mockRestore();
  });

  it('stays quiet when the loaded page matches', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await resolve({
      store: storeReturning(
        buildPublishedPayload({ pageId: 'home', page: pageWithContent() })
      ),
      params: { pb_preview: TOKEN, pb_page_id: 'home' },
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns nothing when no page exists, so the host renders its own markup', async () => {
    expect(await resolve({ store: storeReturning(null) })).toBeNull();
  });

  it('returns nothing for a page with an empty MAIN', async () => {
    const empty = buildPublishedPayload({ page: buildPage({ MAIN: [] }) });
    expect(await resolve({ store: storeReturning(empty) })).toBeNull();
  });

  it('runs the registry block resolvers through the transform', async () => {
    const store = storeReturning(
      buildPublishedPayload({
        pageId: 'home',
        page: buildPage({
          MAIN: [
            buildLayoutElement({
              children: [buildComponent({ type: 'commerce/grid' })],
            }),
          ],
        }),
      })
    );

    const result = await resolvePageBuilderRoute({
      searchParams: readSearchParams({}),
      pageId: 'home',
      previewToken: TOKEN,
      store,
      context: ctx,
      defaultLocale: 'en-US',
      registry: {
        resolversByType: {
          'commerce/grid': async () => ({ products: ['a'] }),
        },
      },
    });

    expect(
      result?.sections[0].layoutElements[0].items[0].configuration.products
    ).toEqual(['a']);
  });

  it('resolves saved data-source bindings when the host supplies them', async () => {
    const store = storeReturning(
      buildPublishedPayload({
        pageId: 'home',
        page: buildPage({
          MAIN: [
            buildLayoutElement({
              children: [buildComponent({ settings: { list: 'ds-1' } })],
            }),
          ],
        }),
      })
    );

    const result = await resolvePageBuilderRoute({
      searchParams: readSearchParams({}),
      pageId: 'home',
      previewToken: TOKEN,
      store,
      context: ctx,
      defaultLocale: 'en-US',
      registry: { resolversByType: {} },
      dsMap: new Map([
        [
          'ds-1',
          {
            id: 'ds-1',
            type: 'commerce/product-list',
            name: {},
            config: {},
            savedForReuse: true,
          } as never,
        ],
      ]),
      resolvers: { 'commerce/product-list': async () => [{ sku: 'a' }] },
    });

    expect(
      result?.sections[0].layoutElements[0].items[0].configuration.list
    ).toEqual([{ sku: 'a' }]);
  });

  it('treats an unconfigured preview token as preview being off', async () => {
    const result = await resolve({
      previewToken: undefined,
      params: { pb_preview: 'anything', pb_edit: '1' },
    });
    expect(result).toMatchObject({ preview: false, editMode: false });
  });
});
