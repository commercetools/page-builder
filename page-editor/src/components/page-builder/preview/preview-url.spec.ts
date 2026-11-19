import { buildPreviewUrl, resolvePreviewPageType } from './preview-url';
import {
  buildPreviewRoutes,
  buildPreviewSettings,
} from '../../../test-utils/factories';

describe('resolvePreviewPageType', () => {
  it('follows the builder page type for pdp and category', () => {
    expect(resolvePreviewPageType({}, 'anything', 'pdp')).toBe('pdp');
    expect(resolvePreviewPageType({}, 'anything', 'category')).toBe('category');
  });

  it('maps the default home id to the home route', () => {
    expect(resolvePreviewPageType({}, 'home', 'static')).toBe('home');
  });

  it('honours a configured home page id instead of the default', () => {
    expect(
      resolvePreviewPageType({ homePageId: 'landing' }, 'landing', 'static')
    ).toBe('home');
    // With `landing` configured, the literal `home` page is just content.
    expect(
      resolvePreviewPageType({ homePageId: 'landing' }, 'home', 'static')
    ).toBe('content');
  });

  it('treats everything else as an arbitrary content page', () => {
    expect(resolvePreviewPageType({}, 'about-us', 'static')).toBe('content');
  });

  it('lets the builder page type win over the home id', () => {
    expect(resolvePreviewPageType({}, 'home', 'category')).toBe('category');
  });
});

describe('buildPreviewUrl', () => {
  const params = { previewPageType: 'home' as const, locale: 'en-us' };

  it('returns null with no settings at all', () => {
    expect(buildPreviewUrl(null, params)).toBeNull();
    expect(buildPreviewUrl(undefined, params)).toBeNull();
  });

  it('returns null without a base URL', () => {
    expect(
      buildPreviewUrl(buildPreviewSettings({ baseUrl: '' }), params)
    ).toBeNull();
  });

  it('returns null when the page type has no route template', () => {
    const settings = buildPreviewSettings({
      routes: { ...buildPreviewRoutes(), pdp: '' },
    });
    expect(
      buildPreviewUrl(settings, { previewPageType: 'pdp', locale: 'en-us' })
    ).toBeNull();
  });

  it('returns null when the base URL is not a URL', () => {
    expect(
      buildPreviewUrl(buildPreviewSettings({ baseUrl: 'not a url' }), params)
    ).toBeNull();
  });

  it('substitutes the locale token', () => {
    const url = buildPreviewUrl(
      buildPreviewSettings({ baseUrl: 'https://shop.test', token: undefined }),
      params
    );
    expect(url).toBe('https://shop.test/en-us');
  });

  it('falls back to the configured default locale when none is passed', () => {
    const url = buildPreviewUrl(
      buildPreviewSettings({
        baseUrl: 'https://shop.test',
        defaultLocale: 'de-de',
        token: undefined,
      }),
      { previewPageType: 'home', locale: '' }
    );
    expect(url).toBe('https://shop.test/de-de');
  });

  it('substitutes slug and sku', () => {
    const url = buildPreviewUrl(
      buildPreviewSettings({ baseUrl: 'https://shop.test', token: undefined }),
      { previewPageType: 'pdp', locale: 'en-us', slug: 'boots', sku: 'SKU-1' }
    );
    expect(url).toBe('https://shop.test/en-us/boots/p/SKU-1');
  });

  it('substitutes extra configured vars such as {brand}', () => {
    const url = buildPreviewUrl(
      buildPreviewSettings({
        baseUrl: 'https://shop.test',
        token: undefined,
        vars: { brand: 'gap' },
        routes: buildPreviewRoutes({ home: '/{locale}/{brand}' }),
      }),
      params
    );
    expect(url).toBe('https://shop.test/en-us/gap');
  });

  it('percent-encodes token values', () => {
    const url = buildPreviewUrl(
      buildPreviewSettings({ baseUrl: 'https://shop.test', token: undefined }),
      { previewPageType: 'content', locale: 'en-us', slug: 'a b/c' }
    );
    expect(url).toContain('a%20b%2Fc');
  });

  it('collapses the empty segment an unresolved token leaves behind', () => {
    const url = buildPreviewUrl(
      buildPreviewSettings({ baseUrl: 'https://shop.test', token: undefined }),
      { previewPageType: 'content', locale: 'en-us' }
    );
    expect(url).toBe('https://shop.test/en-us/');
  });

  it('strips trailing slashes from the base URL rather than doubling them', () => {
    const url = buildPreviewUrl(
      buildPreviewSettings({
        baseUrl: 'https://shop.test///',
        token: undefined,
      }),
      params
    );
    expect(url).toBe('https://shop.test/en-us');
  });

  it('appends the draft token as pb_preview when one is configured', () => {
    const url = buildPreviewUrl(
      buildPreviewSettings({ baseUrl: 'https://shop.test', token: 'secret' }),
      params
    );
    expect(new URL(url!).searchParams.get('pb_preview')).toBe('secret');
  });

  it('sends the editor page id so the host does not re-derive it from the slug', () => {
    const url = buildPreviewUrl(
      buildPreviewSettings({ baseUrl: 'https://shop.test', token: undefined }),
      { ...params, pageEditorId: 'pdp-shoes' }
    );
    expect(new URL(url!).searchParams.get('pb_page_id')).toBe('pdp-shoes');
  });

  it('requests edit mode with the origin to post back to', () => {
    const url = buildPreviewUrl(
      buildPreviewSettings({ baseUrl: 'https://shop.test', token: undefined }),
      { ...params, edit: true, origin: 'https://mc.test' }
    );
    const search = new URL(url!).searchParams;
    expect(search.get('pb_edit')).toBe('1');
    expect(search.get('pb_origin')).toBe('https://mc.test');
  });

  it('omits the origin when edit mode is not requested', () => {
    const url = buildPreviewUrl(
      buildPreviewSettings({ baseUrl: 'https://shop.test', token: undefined }),
      { ...params, origin: 'https://mc.test' }
    );
    const search = new URL(url!).searchParams;
    expect(search.has('pb_edit')).toBe(false);
    expect(search.has('pb_origin')).toBe(false);
  });

  it('appends a cache-busting value, including zero', () => {
    const at = (cacheBust: number | string) =>
      new URL(
        buildPreviewUrl(
          buildPreviewSettings({
            baseUrl: 'https://shop.test',
            token: undefined,
          }),
          { ...params, cacheBust }
        )!
      ).searchParams.get('pb_ts');
    expect(at(1234)).toBe('1234');
    expect(at(0)).toBe('0');
  });
});
