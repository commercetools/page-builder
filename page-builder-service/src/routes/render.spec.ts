import { describe, expect, it } from 'vitest';
import { draftPage, layout, placed, publishPage, RENDER_HEADERS, renderUrl, testApp } from '../testing/fixtures.js';

const get = (t: ReturnType<typeof testApp>, url: string, headers: Record<string, string> = RENDER_HEADERS) =>
  t.app.inject({ method: 'GET', url, headers });

interface Tree {
  wireVersion: number;
  pageId: string;
  preview: boolean;
  editMode: boolean;
  allowedOrigins?: string[];
  manifest?: Array<{ type: string; inlineTextFields: string[] }>;
  theme?: Record<string, unknown>;
  sections: Array<{
    sectionId: string;
    configuration?: { background?: string };
    layoutElements: Array<{ configuration: Record<string, unknown>; items: Array<{ layoutItemType: string; configuration: Record<string, unknown> }> }>;
  }>;
}

const items = (tree: Tree) => tree.sections.flatMap((s) => s.layoutElements.flatMap((e) => e.items));

describe('GET /v1/render — published', () => {
  it('renders the home page: sections, localized settings, resolved data, theme', async () => {
    const t = testApp();
    const res = await get(t, renderUrl('/en-us'));
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const tree = res.json<Tree>();
    expect(tree).toMatchObject({ wireVersion: 1, pageId: 'home', preview: false, editMode: false });
    expect(tree).not.toHaveProperty('allowedOrigins');
    expect(tree).not.toHaveProperty('manifest');
    expect(tree.theme).toMatchObject({ containerMaxWidth: '70rem' });

    expect(tree.sections.map((s) => s.sectionId)).toEqual(['main-1', 'main-2']);
    expect(tree.sections[0].configuration).toEqual({ background: 'Dark' });
    const [hero, carousel] = items(tree);
    expect(hero).toMatchObject({ layoutItemType: 'content/hero', configuration: { title: 'Welcome', mobile: true } });
    expect((carousel.configuration.products as Array<{ sku: string }>).map((p) => p.sku)).toEqual(['DRESS-1', 'COAT-1']);
  });

  it('localizes for the requested locale', async () => {
    const t = testApp();
    const res = await get(t, renderUrl('/de-de', { locale: 'de-DE' }));
    expect(items(res.json<Tree>())[0].configuration.title).toBe('Willkommen');
  });

  it('renders a content page by slug', async () => {
    const t = testApp();
    const tree = (await get(t, renderUrl('/en-us/about-us'))).json<Tree>();
    expect(tree.pageId).toBe('about-us');
    expect(items(tree)[0].configuration.title).toBe('About');
  });

  describe('category listing', () => {
    it('falls back from a missing category page to the shared all-categories page', async () => {
      const t = testApp();
      const tree = (await get(t, renderUrl('/en-us/category/women'))).json<Tree>();
      expect(tree.pageId).toBe('cat-root');
      const [products, facets] = items(tree);
      expect((products.configuration.products as Array<{ sku: string }>).map((p) => p.sku)).toEqual(['DRESS-1', 'COAT-1']);
      expect((facets.configuration.facets as Array<{ name: string }>).map((f) => f.name)).toEqual(['color', 'size']);
    });

    it('prefers a dedicated category page, and skips an empty one', async () => {
      // No cache: the test republishes through the fake, bypassing the service's own writes.
      const t = testApp({ cacheTtlSeconds: 0 });
      publishPage(t.fake, 'cat-women', [layout('main-1', [placed('p', 'category/products')])]);
      expect((await get(t, renderUrl('/en-us/category/women'))).json<Tree>().pageId).toBe('cat-women');
      publishPage(t.fake, 'cat-women', []);
      expect((await get(t, renderUrl('/en-us/category/women'))).json<Tree>().pageId).toBe('cat-root');
    });

    it('honours sort, offset and facet filters from the host query string', async () => {
      const t = testApp();
      const search = 'sort=price-desc&offset=0&facet.color=blue';
      const tree = (await get(t, renderUrl('/en-us/category/women', { search }))).json<Tree>();
      expect((items(tree)[0].configuration.products as Array<{ sku: string }>).map((p) => p.sku)).toEqual(['DRESS-1']);
    });

    it('is 404 for an unknown category', async () => {
      const t = testApp();
      const res = await get(t, renderUrl('/en-us/category/ghost'));
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: { code: 'page_not_found', message: 'No renderable page for this path' } });
    });
  });

  describe('product page', () => {
    it('uses the category PDP override, with route-driven slices', async () => {
      const t = testApp();
      const tree = (await get(t, renderUrl('/en-us/summer-dress/p/DRESS-1'))).json<Tree>();
      expect(tree.pageId).toBe('pdp-cat-dresses');
      expect(items(tree)[0].configuration).toMatchObject({ name: 'Summer Dress', breadcrumb: [{ name: 'Women' }, { name: 'Dresses' }] });
    });

    it('falls back to the global PDP template and fetches the product once for all its components', async () => {
      const t = testApp();
      const tree = (await get(t, renderUrl('/en-us/wool-coat/p/COAT-1'))).json<Tree>();
      expect(tree.pageId).toBe('pdp-cat-root');
      const [title, price, gallery] = items(tree);
      expect(title.configuration.name).toBe('Wool Coat');
      expect(price.configuration).toMatchObject({ sku: 'COAT-1', price: { centAmount: 12000 } });
      expect((gallery.configuration.images as unknown[]).length).toBe(1);
      expect(t.fake.calls.filter((c) => c.path === '/product-projections')).toHaveLength(1);
    });

    it('is 404-free for an unknown sku when a global template exists (components render empty)', async () => {
      const t = testApp();
      const tree = (await get(t, renderUrl('/en-us/x/p/NOPE'))).json<Tree>();
      expect(tree.pageId).toBe('pdp-cat-root');
      expect(items(tree)[0].configuration).not.toHaveProperty('name');
    });
  });

  it('is 404 when the path matches no route template', async () => {
    const t = testApp();
    const res = await get(t, renderUrl('/a/b/c/d/e/f'));
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'page_not_found', message: 'No page matches this path' } });
  });

  it('is 404 when nothing was published for the page', async () => {
    const t = testApp();
    expect((await get(t, renderUrl('/en-us/never-built'))).statusCode).toBe(404);
  });

  it('renders with default route templates when no settings exist, and falls back to the request locale', async () => {
    const t = testApp({}, { content: false });
    publishPage(t.fake, 'home', [layout('main-1', [placed('h', 'content/hero', { title: { 'en-US': 'EN' } })])]);
    const tree = (await get(t, renderUrl('/fr-fr', { locale: 'fr-FR' }))).json<Tree>();
    expect(items(tree)[0].configuration.title).toBe('EN');
  });

  it('passes unknown component types through with their localized settings', async () => {
    const t = testApp();
    publishPage(t.fake, 'about-us', [layout('main-1', [placed('x', 'brand/new-type', { a: { 'en-US': 'v' } })])]);
    expect(items((await get(t, renderUrl('/en-us/about-us'))).json<Tree>())[0]).toMatchObject({
      layoutItemType: 'brand/new-type',
      configuration: { a: 'v' },
    });
  });

  it('serves published pages from the cache within the TTL', async () => {
    const t = testApp();
    await get(t, renderUrl('/en-us'));
    const before = t.fake.calls.length;
    await get(t, renderUrl('/en-us'));
    expect(t.fake.calls.length).toBe(before);
  });
});

describe('GET /v1/render — preview and edit', () => {
  const draftHome = (t: ReturnType<typeof testApp>) =>
    draftPage(t.fake, 'home', [{ id: 'main-1', children: [placed('hero-d', 'content/hero', { title: 'Draft title' })] }]);

  it('ignores a wrong or missing preview token', async () => {
    const t = testApp();
    draftHome(t);
    for (const search of ['pb_preview=wrong', 'pb_edit=1', 'pb_page_id=about-us&pb_edit=1', '']) {
      const tree = (await get(t, renderUrl('/en-us', { search }))).json<Tree>();
      expect(tree).toMatchObject({ pageId: 'home', preview: false, editMode: false });
      expect(items(tree)[0].configuration.title).toBe('Welcome');
    }
  });

  it('serves the draft head, fresh, under a valid token', async () => {
    const t = testApp();
    draftHome(t);
    const tree = (await get(t, renderUrl('/en-us', { search: 'pb_preview=preview-secret' }))).json<Tree>();
    expect(tree).toMatchObject({ pageId: 'home', preview: true, editMode: false });
    expect(tree).not.toHaveProperty('allowedOrigins');
    expect(items(tree)[0].configuration.title).toBe('Draft title');
  });

  it('never caches preview reads', async () => {
    const t = testApp();
    draftHome(t);
    const url = renderUrl('/en-us', { search: 'pb_preview=preview-secret' });
    await get(t, url);
    const before = t.fake.calls.length;
    await get(t, url);
    expect(t.fake.calls.length).toBeGreaterThan(before);
  });

  it('turns on edit mode with allowed origins and the manifest only for a valid preview', async () => {
    const t = testApp();
    draftHome(t);
    const tree = (await get(t, renderUrl('/en-us', { search: 'pb_preview=preview-secret&pb_edit=1' }))).json<Tree>();
    expect(tree).toMatchObject({ preview: true, editMode: true, allowedOrigins: ['https://mc.test'] });
    expect(tree.manifest).toContainEqual({ type: 'content/hero', inlineTextFields: ['title'] });
    expect(tree.manifest).toContainEqual({ type: 'product/title', inlineTextFields: [] });
  });

  it('pins the page the editor asked for, even when the path is for another page', async () => {
    const t = testApp();
    const tree = (await get(t, renderUrl('/en-us', { search: 'pb_preview=preview-secret&pb_page_id=about-us' }))).json<Tree>();
    expect(tree.pageId).toBe('about-us');
  });

  it('renders a pinned page even when the path matches no route', async () => {
    const t = testApp();
    const tree = (await get(t, renderUrl('/anything/at/all/here/x/y', { search: 'pb_preview=preview-secret&pb_page_id=about-us' }))).json<Tree>();
    expect(tree.pageId).toBe('about-us');
  });

  it('is 404 for a pinned page that does not exist', async () => {
    const t = testApp();
    expect((await get(t, renderUrl('/en-us', { search: 'pb_preview=preview-secret&pb_page_id=ghost' }))).statusCode).toBe(404);
  });

  it('closes the feature when no preview token is configured', async () => {
    const t = testApp({ previewToken: undefined });
    draftHome(t);
    const tree = (await get(t, renderUrl('/en-us', { search: 'pb_preview=preview-secret&pb_edit=1' }))).json<Tree>();
    expect(tree).toMatchObject({ preview: false, editMode: false });
  });

  it('reads the draft catalog in preview', async () => {
    const t = testApp();
    const obj = t.fake.get('page-editor', 'theme') as { draft: { versions: Array<Record<string, unknown>> } };
    obj.draft.versions[0].theme = { containerMaxWidth: '99rem' };
    const tree = (await get(t, renderUrl('/en-us', { search: 'pb_preview=preview-secret' }))).json<Tree>();
    expect(tree.theme).toMatchObject({ containerMaxWidth: '99rem' });
    expect((await get(t, renderUrl('/en-us'))).json<Tree>().theme).toMatchObject({ containerMaxWidth: '70rem' });
  });
});

describe('GET /v1/render — protocol', () => {
  it('requires the query parameters', async () => {
    const t = testApp();
    for (const missing of ['path', 'locale', 'currency', 'country']) {
      const q = new URLSearchParams({ path: '/', locale: 'en-US', currency: 'USD', country: 'US' });
      q.delete(missing);
      const res = await get(t, `/v1/render?${q}`);
      expect(res.statusCode, missing).toBe(400);
      expect(res.json().error.code).toBe('bad_request');
    }
  });

  it('rejects malformed currency and country', async () => {
    const t = testApp();
    expect((await get(t, renderUrl('/', { currency: 'usd' }))).statusCode).toBe(400);
    expect((await get(t, renderUrl('/', { country: 'USA' }))).statusCode).toBe(400);
  });

  it('requires a compatible wire version', async () => {
    const t = testApp();
    expect((await get(t, renderUrl('/en-us'), {})).statusCode).toBe(400);
    expect((await get(t, renderUrl('/en-us'), { 'x-pb-wire-version': '9' })).statusCode).toBe(426);
  });

  it('authenticates before validating or reading anything', async () => {
    const t = testApp({ renderKey: 'secret', renderOrigins: ['https://shop.test'] });
    const noKey = await get(t, '/v1/render', RENDER_HEADERS);
    expect(noKey.statusCode).toBe(401);
    expect(t.fake.calls).toHaveLength(0);

    const badOrigin = await get(t, '/v1/render', { ...RENDER_HEADERS, 'x-pb-render-key': 'secret', 'x-pb-origin': 'https://evil.test' });
    expect(badOrigin.statusCode).toBe(403);

    const ok = await get(t, renderUrl('/en-us'), { ...RENDER_HEADERS, 'x-pb-render-key': 'secret', 'x-pb-origin': 'https://shop.test' });
    expect(ok.statusCode).toBe(200);
  });

  it('answers 503 on /v1 routes when commercetools credentials are not configured', async () => {
    const t = testApp({ ct: null });
    // `testApp` still wires deps from CT_CONFIG; build a server without them.
    const { buildServer } = await import('../server.js');
    const app = buildServer({ ...t.config, ct: null }, null);
    const res = await app.inject({ method: 'GET', url: renderUrl('/'), headers: RENDER_HEADERS });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('not_configured');
    await app.close();
  });

  it('degrades a failing upstream to a 500 without leaking details', async () => {
    const t = testApp();
    t.fake.failNext('/custom-objects/page-editor/settings', 500, { message: 'secret upstream detail' });
    const res = await get(t, renderUrl('/en-us'));
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret upstream detail');
  });
});
