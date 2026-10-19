import { describe, expect, it, vi } from 'vitest';
import {
  WIDTH_TO_COLS,
  localizeConfig,
  pickPage,
  pickValid,
  resolveDataSources,
  responsiveSize,
  transformPageEditorToSections,
} from './transform.js';
import type { BaseDataSourceContext, LayoutSection } from './types.js';
import type { SavedDataSource } from './contract.js';
import {
  buildComponent,
  buildLayoutElement,
  buildPage,
  buildPublishedPayload,
  localized,
} from './test-utils/index.js';

const ctx: BaseDataSourceContext = { locale: 'en-US' };

describe('WIDTH_TO_COLS', () => {
  it('maps every authored width onto a 12-column grid', () => {
    for (const [width, cols] of Object.entries(WIDTH_TO_COLS)) {
      const [num, den] = width.split('/').map(Number);
      expect(cols).toBe((12 * num) / den);
    }
  });
});

describe('responsiveSize', () => {
  it('renders a full-width column as a plain 12', () => {
    expect(responsiveSize(12)).toBe(12);
  });

  it('stacks a fractional column full-width on mobile only', () => {
    expect(responsiveSize(6)).toEqual({ mobile: 12, tablet: 6, desktop: 6 });
  });

  it('treats anything wider than the grid as full width', () => {
    expect(responsiveSize(16)).toBe(12);
  });
});

describe('pickValid', () => {
  const valid = (p: string | null) => p === 'good';

  it('returns nothing without an object', () => {
    expect(pickValid(null, false, valid)).toBeNull();
    expect(pickValid(undefined, true, valid)).toBeNull();
  });

  it('serves published outside preview, even when the draft is valid', () => {
    expect(pickValid({ draft: 'good', published: 'good' }, false, valid)).toBe(
      'good'
    );
  });

  it('serves the draft in preview', () => {
    expect(pickValid({ draft: 'good', published: null }, true, valid)).toBe('good');
  });

  it('falls back to published rather than rendering an invalid draft', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(pickValid({ draft: 'bad', published: 'good' }, true, valid)).toBe('good');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('falling back'));
    warn.mockRestore();
  });

  it('says nothing when there was no draft to fall back from', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      pickValid({ draft: null as unknown as string, published: 'good' }, true, valid)
    ).toBe('good');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns nothing when neither side is valid', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(pickValid({ draft: 'bad', published: 'bad' }, true, valid)).toBeNull();
    warn.mockRestore();
  });
});

describe('pickPage', () => {
  const published = buildPublishedPayload({ appVersion: 9 });

  it('returns nothing without an object', () => {
    expect(pickPage(null, false)).toBeNull();
    expect(pickPage(undefined, true)).toBeNull();
  });

  it('serves the published snapshot outside preview', () => {
    expect(pickPage({ draft: null, published } as never, false)).toBe(published);
  });

  it('serves the latest draft version in preview', () => {
    const draft = {
      schemaVersion: 3,
      currentVersion: 2,
      pageId: 'home',
      versions: [
        { appVersion: 1, savedAt: 'x', publishedAt: null, page: buildPage() },
        { appVersion: 2, savedAt: 'y', publishedAt: null, page: buildPage() },
      ],
    };

    const result = pickPage({ draft, published } as never, true);
    expect(result?.appVersion).toBe(2);
    expect(result?.pageId).toBe('home');
  });

  it('normalizes a never-published draft version to an empty publishedAt', () => {
    const draft = {
      schemaVersion: 3,
      currentVersion: 1,
      pageId: 'home',
      versions: [
        { appVersion: 1, savedAt: 'x', publishedAt: null, page: buildPage() },
      ],
    };
    expect(pickPage({ draft, published: null } as never, true)?.publishedAt).toBe('');
  });

  it('accepts a draft that is already a flat payload rather than a history', () => {
    const flat = buildPublishedPayload({ appVersion: 5 });
    expect(pickPage({ draft: flat, published: null } as never, true)).toBe(flat);
  });

  it('falls back to published when the draft history is empty', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const draft = { schemaVersion: 3, currentVersion: 0, pageId: 'home', versions: [] };
    expect(pickPage({ draft, published } as never, true)).toBe(published);
    warn.mockRestore();
  });

  it('falls back when the latest draft version carries no page', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const draft = {
      schemaVersion: 3,
      currentVersion: 1,
      pageId: 'home',
      versions: [{ appVersion: 1, savedAt: 'x', publishedAt: null, page: null }],
    };
    expect(pickPage({ draft, published } as never, true)).toBe(published);
    warn.mockRestore();
  });

  it('returns nothing when the published snapshot has no page either', () => {
    expect(pickPage({ draft: null, published: { page: null } } as never, false)).toBeNull();
  });
});

describe('localizeConfig', () => {
  it('picks the requested locale from a locale map', () => {
    expect(
      localizeConfig({ 'en-US': 'Hello', 'de-DE': 'Hallo' }, 'de-DE', 'en-US')
    ).toBe('Hallo');
  });

  it('falls back to the default locale', () => {
    expect(localizeConfig({ 'en-US': 'Hello' }, 'de-DE', 'en-US')).toBe('Hello');
  });

  it('falls back to any available value rather than rendering nothing', () => {
    expect(localizeConfig({ 'fr-FR': 'Salut' }, 'de-DE', 'en-US')).toBe('Salut');
  });

  it('accepts bare language codes as locale keys', () => {
    expect(localizeConfig({ en: 'Hello', de: 'Hallo' }, 'de', 'en')).toBe('Hallo');
  });

  it('leaves primitives alone', () => {
    expect(localizeConfig('plain', 'en-US', 'en-US')).toBe('plain');
    expect(localizeConfig(42, 'en-US', 'en-US')).toBe(42);
    expect(localizeConfig(null, 'en-US', 'en-US')).toBeNull();
    expect(localizeConfig(true, 'en-US', 'en-US')).toBe(true);
  });

  it('recurses into arrays', () => {
    expect(
      localizeConfig([{ 'en-US': 'a' }, { 'en-US': 'b' }], 'en-US', 'en-US')
    ).toEqual(['a', 'b']);
  });

  it('recurses into nested objects', () => {
    expect(
      localizeConfig(
        { cta: { label: { 'en-US': 'Buy' }, href: '/x' } },
        'en-US',
        'en-US'
      )
    ).toEqual({ cta: { label: 'Buy', href: '/x' } });
  });

  it('leaves an object whose values are not all strings alone', () => {
    // Not a locale map — a config object that happens to have short keys.
    const value = { en: 'Hello', de: 42 };
    expect(localizeConfig(value, 'en', 'en')).toEqual(value);
  });

  it('leaves an object whose keys are not locale-shaped alone', () => {
    const value = { title: 'Hello', subtitle: 'World' };
    expect(localizeConfig(value, 'en-US', 'en-US')).toEqual(value);
  });

  it('leaves an empty object alone', () => {
    expect(localizeConfig({}, 'en-US', 'en-US')).toEqual({});
  });
});

describe('resolveDataSources', () => {
  const ds = (over: Partial<SavedDataSource> = {}): SavedDataSource =>
    ({
      id: 'ds-1',
      type: 'commerce/product-list',
      name: localized('Products'),
      config: { limit: 3 },
      savedForReuse: true,
      ...over,
    }) as SavedDataSource;

  const mapOf = (...sources: SavedDataSource[]) =>
    new Map(sources.map((s) => [s.id, s]));

  it('leaves settings that are not data-source ids untouched', async () => {
    expect(
      await resolveDataSources({ title: 'Hi', n: 3 }, mapOf(), ctx, {}, 'en-US')
    ).toEqual({ title: 'Hi', n: 3 });
  });

  it('swaps a data-source id for its resolved data', async () => {
    const resolver = vi.fn(async () => [{ sku: 'a' }]);
    const result = await resolveDataSources(
      { products: 'ds-1' },
      mapOf(ds()),
      ctx,
      { 'commerce/product-list': resolver },
      'en-US'
    );
    expect(result).toEqual({ products: [{ sku: 'a' }] });
  });

  it('hands the resolver the localized config and the context', async () => {
    const resolver = vi.fn(async () => null);
    await resolveDataSources(
      { products: 'ds-1' },
      mapOf(ds({ config: { title: { 'en-US': 'Featured' }, limit: 3 } })),
      ctx,
      { 'commerce/product-list': resolver },
      'en-US'
    );
    expect(resolver).toHaveBeenCalledWith({ title: 'Featured', limit: 3 }, ctx);
  });

  it('passes the raw config through when the host registered no resolver', async () => {
    // The host can still render something rather than losing the binding entirely.
    expect(
      await resolveDataSources({ products: 'ds-1' }, mapOf(ds()), ctx, {}, 'en-US')
    ).toEqual({ products: { type: 'commerce/product-list', limit: 3 } });
  });

  it('resolves several bindings concurrently', async () => {
    const order: string[] = [];
    const slow = async (cfg: Record<string, unknown>) => {
      await new Promise((r) => setTimeout(r, cfg.delay as number));
      order.push(String(cfg.name));
      return cfg.name;
    };
    await resolveDataSources(
      { a: 'ds-a', b: 'ds-b' },
      mapOf(
        ds({ id: 'ds-a', type: 't', config: { name: 'a', delay: 20 } }),
        ds({ id: 'ds-b', type: 't', config: { name: 'b', delay: 0 } })
      ),
      ctx,
      { t: slow },
      'en-US'
    );
    // b finished first, so they really did overlap.
    expect(order).toEqual(['b', 'a']);
  });
});

describe('transformPageEditorToSections', () => {
  const transform = (
    payload: Parameters<typeof transformPageEditorToSections>[0],
    deps: Partial<Parameters<typeof transformPageEditorToSections>[3]> = {}
  ) =>
    transformPageEditorToSections(payload, new Map(), ctx, {
      resolvers: {},
      defaultLocale: 'en-US',
      ...deps,
    });

  const el = (width: string, id: string, children = [buildComponent()]) =>
    buildLayoutElement({ id, width: width as never, children });

  it('returns nothing for a page with no MAIN section', async () => {
    expect(await transform(buildPublishedPayload({ page: {} as never }))).toEqual([]);
  });

  it('puts a full-width element in a row of its own', async () => {
    const sections = await transform(
      buildPublishedPayload({ page: buildPage({ MAIN: [el('1/1', 'a'), el('1/1', 'b')] }) })
    );
    expect(sections).toHaveLength(2);
    expect(sections.map((s: LayoutSection) => s.sectionId)).toEqual(['a', 'b']);
  });

  it('packs elements that add up to 12 into one row', async () => {
    const sections = await transform(
      buildPublishedPayload({
        page: buildPage({ MAIN: [el('1/2', 'a'), el('1/2', 'b')] }),
      })
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].sectionId).toBe('a-b');
    expect(sections[0].layoutElements).toHaveLength(2);
  });

  it('starts a new row when the next element would overflow', async () => {
    const sections = await transform(
      buildPublishedPayload({
        page: buildPage({ MAIN: [el('2/3', 'a'), el('2/3', 'b')] }),
      })
    );
    expect(sections.map((s: LayoutSection) => s.sectionId)).toEqual(['a', 'b']);
  });

  it('leaves a trailing partial row as its own section', async () => {
    const sections = await transform(
      buildPublishedPayload({
        page: buildPage({ MAIN: [el('1/2', 'a'), el('1/2', 'b'), el('1/3', 'c')] }),
      })
    );
    expect(sections.map((s: LayoutSection) => s.sectionId)).toEqual(['a-b', 'c']);
  });

  it('treats an unknown width as full width', async () => {
    const sections = await transform(
      buildPublishedPayload({
        page: buildPage({ MAIN: [el('7/8' as never, 'a'), el('1/1', 'b')] }),
      })
    );
    expect(sections.map((s: LayoutSection) => s.sectionId)).toEqual(['a', 'b']);
  });

  it('carries element visibility and computed size into the render config', async () => {
    const sections = await transform(
      buildPublishedPayload({
        page: buildPage({
          MAIN: [
            buildLayoutElement({
              id: 'a',
              width: '1/2',
              visibility: { mobile: false, tablet: true, desktop: true },
              children: [],
            }),
          ],
        }),
      })
    );
    expect(sections[0].layoutElements[0].configuration).toEqual({
      mobile: false,
      tablet: true,
      desktop: true,
      size: { mobile: 12, tablet: 6, desktop: 6 },
    });
  });

  it('takes the row background from the first element style', async () => {
    const sections = await transform(
      buildPublishedPayload({
        page: buildPage({
          MAIN: [
            buildLayoutElement({ id: 'a', width: '1/2', style: 'dark', children: [] }),
            buildLayoutElement({ id: 'b', width: '1/2', style: 'light', children: [] }),
          ],
        }),
      })
    );
    expect(sections[0].configuration).toEqual({ background: 'dark' });
  });

  it('omits the configuration entirely when the row has no style', async () => {
    const sections = await transform(
      buildPublishedPayload({
        page: buildPage({ MAIN: [buildLayoutElement({ id: 'a', children: [] })] }),
      })
    );
    expect(sections[0].configuration).toBeUndefined();
  });

  it('maps a child to a render item with its visibility merged into settings', async () => {
    const child = buildComponent({
      id: 'c1',
      type: 'content/hero',
      visibility: { mobile: true, tablet: false, desktop: true },
      settings: { title: 'Welcome' },
    });
    const sections = await transform(
      buildPublishedPayload({
        page: buildPage({ MAIN: [el('1/1', 'a', [child])] }),
      })
    );

    expect(sections[0].layoutElements[0].items[0]).toEqual({
      layoutItemId: 'c1',
      layoutItemType: 'content/hero',
      configuration: {
        mobile: true,
        tablet: false,
        desktop: true,
        title: 'Welcome',
      },
    });
  });

  it('localizes child settings', async () => {
    const child = buildComponent({
      settings: { title: { 'en-US': 'Welcome', 'de-DE': 'Willkommen' } },
    });
    const sections = await transform(
      buildPublishedPayload({ page: buildPage({ MAIN: [el('1/1', 'a', [child])] }) })
    );
    expect(sections[0].layoutElements[0].items[0].configuration.title).toBe('Welcome');
  });

  it('lets a block resolver add dynamic data on top of the settings', async () => {
    const child = buildComponent({ type: 'commerce/grid', settings: { limit: 2 } });
    const sections = await transform(
      buildPublishedPayload({ page: buildPage({ MAIN: [el('1/1', 'a', [child])] }) }),
      { blockResolvers: { 'commerce/grid': async () => ({ products: ['a', 'b'] }) } }
    );

    const config = sections[0].layoutElements[0].items[0].configuration;
    expect(config.limit).toBe(2);
    expect(config.products).toEqual(['a', 'b']);
  });

  it('lets a block resolver override a setting', async () => {
    const child = buildComponent({ type: 'commerce/grid', settings: { limit: 2 } });
    const sections = await transform(
      buildPublishedPayload({ page: buildPage({ MAIN: [el('1/1', 'a', [child])] }) }),
      { blockResolvers: { 'commerce/grid': async () => ({ limit: 99 }) } }
    );
    expect(sections[0].layoutElements[0].items[0].configuration.limit).toBe(99);
  });

  it('leaves a block alone when no resolver is registered for its type', async () => {
    const child = buildComponent({ type: 'content/hero', settings: { title: 'x' } });
    const sections = await transform(
      buildPublishedPayload({ page: buildPage({ MAIN: [el('1/1', 'a', [child])] }) }),
      { blockResolvers: { 'commerce/grid': async () => ({ products: [] }) } }
    );
    expect(
      sections[0].layoutElements[0].items[0].configuration.products
    ).toBeUndefined();
  });

  it('renders an element with no children as an empty column', async () => {
    const sections = await transform(
      buildPublishedPayload({
        page: buildPage({ MAIN: [buildLayoutElement({ id: 'a', children: [] })] }),
      })
    );
    expect(sections[0].layoutElements[0].items).toEqual([]);
  });
});
