import { usePreviewTarget } from './use-preview-target';
import { act, renderHookWithProviders, waitFor } from '../../test-utils/render';
import { installMockServer, respondWith } from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';
import {
  buildPageNode,
  buildPreviewRoutes,
  buildPreviewSettings,
} from '../../test-utils/factories';
import type { PageTypeId, PreviewSettings } from './types';

const store = installMockServer();

const seedSettings = (over: Partial<PreviewSettings> = {}) =>
  store.seed({
    container: 'page-editor',
    key: 'settings',
    value: {
      schemaVersion: 2,
      preview: buildPreviewSettings({
        enabled: true,
        baseUrl: 'https://shop.test',
        token: undefined,
        environments: {
          production: { baseUrl: 'https://shop.test' },
          staging: { baseUrl: 'https://staging.test' },
        },
        ...over,
      }),
    },
  });

/** The PDP sample-product lookup runs whenever the page is a PDP. */
const noSampleProduct = () =>
  server.use(
    respondWith('FirstCategoryProduct', {
      productsSearch: { __typename: 'ProductSearchQueryResult', results: [] },
    })
  );

const setup = (
  over: {
    pageId?: string;
    pageType?: PageTypeId;
    pageNode?: ReturnType<typeof buildPageNode>;
    dirty?: boolean;
  } = {}
) => {
  const save = jest.fn(async () => undefined);
  const rendered = renderHookWithProviders(() =>
    usePreviewTarget({
      pageId: over.pageId ?? 'home',
      pageNode: over.pageNode ?? buildPageNode({ id: 'home' }),
      pageType: over.pageType ?? 'static',
      defaultLocale: 'en-US',
      dirty: over.dirty ?? false,
      save,
    })
  );
  return { save, ...rendered };
};

beforeEach(() => window.localStorage.clear());

describe('usePreviewTarget settings', () => {
  it('is disabled with no settings configured', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.settings).toBeNull());
    expect(result.current.enabled).toBe(false);
    expect(result.current.url).toBeNull();
  });

  it('is disabled when preview is switched off for the project', async () => {
    seedSettings({ enabled: false });
    const { result } = setup();
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    expect(result.current.enabled).toBe(false);
  });

  it('is disabled when the active environment has no base URL', async () => {
    seedSettings({
      baseUrl: '',
      environments: {
        production: { baseUrl: '' },
        staging: { baseUrl: '' },
      },
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    expect(result.current.enabled).toBe(false);
  });

  it('is enabled once a host is configured', async () => {
    seedSettings();
    const { result } = setup();
    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(result.current.hostOrigin).toBe('https://shop.test');
  });

  it('adopts the configured default locale', async () => {
    seedSettings({ defaultLocale: 'de-de' });
    const { result } = setup();
    await waitFor(() => expect(result.current.locale).toBe('de-de'));
  });

  it('lets the operator change the preview locale', async () => {
    seedSettings();
    const { result } = setup();
    await waitFor(() => expect(result.current.locale).toBe('en-us'));

    act(() => result.current.setLocale('de-de'));
    expect(result.current.locale).toBe('de-de');
    await waitFor(() => expect(result.current.url).toContain('/de-de'));
  });
});

describe('usePreviewTarget URL', () => {
  it('builds the host URL for the page being edited', async () => {
    seedSettings();
    const { result } = setup();
    await waitFor(() => expect(result.current.url).not.toBeNull());

    const url = new URL(result.current.url!);
    expect(url.origin).toBe('https://shop.test');
    expect(url.searchParams.get('pb_page_id')).toBe('home');
    expect(url.searchParams.get('pb_edit')).toBe('1');
  });

  it('sends the builder origin so the host can post back', async () => {
    seedSettings();
    const { result } = setup();
    await waitFor(() => expect(result.current.url).not.toBeNull());
    expect(new URL(result.current.url!).searchParams.get('pb_origin')).toBe(
      window.location.origin
    );
  });

  it('uses the category slug for a category page', async () => {
    seedSettings();
    const { result } = setup({
      pageId: 'shoes',
      pageType: 'category',
      pageNode: buildPageNode({ id: 'shoes', slug: 'footwear' }),
    });
    await waitFor(() => expect(result.current.url).not.toBeNull());
    expect(result.current.url).toContain('/category/footwear');
  });

  it('falls back to the page id when a category has no slug', async () => {
    seedSettings();
    const { result } = setup({
      pageId: 'shoes',
      pageType: 'category',
      pageNode: buildPageNode({ id: 'shoes', slug: undefined }),
    });
    await waitFor(() => expect(result.current.url).not.toBeNull());
    expect(result.current.url).toContain('/category/shoes');
  });

  it('uses the configured sample product for a PDP with no live one', async () => {
    noSampleProduct();
    seedSettings({ samples: { pdp: { sku: 'SKU-1', slug: 'boots' } } });
    const { result } = setup({ pageId: 'pdp', pageType: 'pdp' });

    await waitFor(() => expect(result.current.url).not.toBeNull());
    expect(result.current.url).toContain('/boots/p/SKU-1');
  });

  it('prefers a live sample product over the configured one', async () => {
    server.use(
      respondWith('FirstCategoryProduct', {
        productsSearch: {
          __typename: 'ProductSearchQueryResult',
          results: [
            {
              __typename: 'ProductSearchResult',
              product: {
                __typename: 'Product',
                id: 'p1',
                masterData: {
                  __typename: 'ProductCatalogData',
                  current: {
                    __typename: 'ProductData',
                    slug: 'live-boots',
                    masterVariant: {
                      __typename: 'ProductVariant',
                      sku: 'LIVE-1',
                    },
                  },
                },
              },
            },
          ],
        },
      })
    );
    seedSettings({ samples: { pdp: { sku: 'SKU-1', slug: 'boots' } } });
    const { result } = setup({ pageId: 'pdp-shoes', pageType: 'pdp' });

    await waitFor(() => expect(result.current.url).toContain('live-boots'));
    expect(result.current.url).toContain('LIVE-1');
  });

  it('uses the arbitrary page id as the content slug', async () => {
    seedSettings();
    const { result } = setup({ pageId: 'about-us', pageType: 'static' });
    await waitFor(() => expect(result.current.url).not.toBeNull());
    expect(result.current.url).toContain('/about-us');
  });

  it('returns no URL when the page type has no route template', async () => {
    seedSettings({ routes: { ...buildPreviewRoutes(), home: '' } });
    const { result } = setup({ pageId: 'home' });
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    expect(result.current.url).toBeNull();
  });
});

describe('usePreviewTarget view mode', () => {
  it('starts in edit mode', () => {
    const { result } = setup();
    expect(result.current.viewMode).toBe('edit');
  });

  it('switches itself to preview once a usable host resolves', async () => {
    seedSettings();
    const { result } = setup();
    await waitFor(() => expect(result.current.viewMode).toBe('preview'));
  });

  it('stays in edit mode when preview is disabled', async () => {
    seedSettings({ enabled: false });
    const { result } = setup();
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    expect(result.current.viewMode).toBe('edit');
  });

  it('respects a manual switch back to edit', async () => {
    seedSettings();
    const { result } = setup();
    await waitFor(() => expect(result.current.viewMode).toBe('preview'));

    await act(async () => {
      await result.current.changeViewMode('edit');
    });
    expect(result.current.viewMode).toBe('edit');
  });

  it('saves before switching into preview when there are unsaved edits', async () => {
    seedSettings();
    const { result, save } = setup({ dirty: true });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    await act(async () => {
      await result.current.changeViewMode('preview');
    });
    expect(save).toHaveBeenCalled();
  });

  it('does not save when switching into preview with nothing pending', async () => {
    seedSettings();
    const { result, save } = setup({ dirty: false });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    await act(async () => {
      await result.current.changeViewMode('preview');
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('does not save when switching back to edit', async () => {
    seedSettings();
    const { result, save } = setup({ dirty: true });
    await waitFor(() => expect(result.current.enabled).toBe(true));

    await act(async () => {
      await result.current.changeViewMode('edit');
    });
    expect(save).not.toHaveBeenCalled();
  });
});

describe('usePreviewTarget refresh', () => {
  it('busts the cache so the host re-pulls', async () => {
    seedSettings();
    const { result } = setup();
    await waitFor(() => expect(result.current.url).not.toBeNull());
    const before = result.current.url;

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.url).not.toBe(before);
    expect(new URL(result.current.url!).searchParams.get('pb_ts')).toBeTruthy();
  });

  it('saves first when there are unsaved edits', async () => {
    seedSettings();
    const { result, save } = setup({ dirty: true });
    await waitFor(() => expect(result.current.url).not.toBeNull());

    await act(async () => {
      await result.current.refresh();
    });
    expect(save).toHaveBeenCalled();
  });
});

describe('usePreviewTarget environments', () => {
  it('offers a labelled option per environment', async () => {
    seedSettings();
    const { result } = setup();
    await waitFor(() => expect(result.current.enabled).toBe(true));

    expect(result.current.envOptions.map((o) => o.id)).toEqual([
      'production',
      'staging',
      'local',
    ]);
    for (const option of result.current.envOptions) {
      expect(option.label.trim()).toBeTruthy();
    }
  });

  it('starts on production', async () => {
    seedSettings();
    const { result } = setup();
    await waitFor(() => expect(result.current.enabled).toBe(true));
    expect(result.current.activeEnv).toBe('production');
  });

  it('switches the host origin when the environment changes', async () => {
    seedSettings();
    const { result } = setup();
    await waitFor(() =>
      expect(result.current.hostOrigin).toBe('https://shop.test')
    );

    act(() => result.current.changeEnv('staging'));

    await waitFor(() =>
      expect(result.current.hostOrigin).toBe('https://staging.test')
    );
    expect(result.current.url).toContain('https://staging.test');
  });

  it('busts the cache when the environment changes', async () => {
    seedSettings();
    const { result } = setup();
    await waitFor(() => expect(result.current.url).not.toBeNull());

    act(() => result.current.changeEnv('staging'));
    await waitFor(() =>
      expect(
        new URL(result.current.url!).searchParams.get('pb_ts')
      ).toBeTruthy()
    );
  });
});
