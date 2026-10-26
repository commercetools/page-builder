/**
 * A small shop for tests and local development: categories, products with variants and
 * prices, a store, and a product type with facetable attributes.
 */

import type { JWTVerifyGetKey } from 'jose';
import type { CtConfig } from '../config.js';
import { TtlCache } from '../cache.js';
import { createApiRoot, type ApiRoot } from '../ct/client.js';
import { createCtStore } from '../ct/store.js';
import { createCommerce } from '../commerce/index.js';
import type { CommerceContext } from '../commerce/shapes.js';
import { createFakeCt, type FakeCt } from './fake-ct.js';
import { createDeps } from '../app.js';
import { loadConfig, type ServiceConfig } from '../config.js';
import { buildServer } from '../server.js';
import {
  CATALOG_CONTAINER,
  COMPONENTS_CONTAINER,
  DRAFT_PAGE_CONTAINER,
  PUBLISHED_PAGE_CONTAINER,
  pageKey,
} from '../domain/types.js';
import { createMemo, type RenderEnv } from '../resolve/env.js';
import type { RouteMatch } from '../domain/route.js';
import type { ComponentType, DataSourceType, SavedDataSource } from '../domain/types.js';

export const CT_CONFIG: CtConfig = {
  projectKey: 'us-store',
  clientId: 'id',
  clientSecret: 'secret',
  authUrl: 'https://auth.test',
  apiUrl: 'https://api.test',
  scopes: 'manage_key_value_documents:us-store',
};

export const CTX: CommerceContext = { locale: 'en-US', currency: 'USD', country: 'US', store: 'gap' };

const loc = (en: string, de = en) => ({ 'en-US': en, 'de-DE': de });

export function seedShop(fake: FakeCt): void {
  fake.stores.push({ id: 'store-id-gap', key: 'gap' }, { id: 'store-id-other', key: 'other' });

  fake.categories.push(
    { id: 'cat-women', key: 'women', name: loc('Women', 'Damen'), slug: loc('women', 'damen'), orderHint: '0.1', image: 'https://img.test/women.jpg' },
    { id: 'cat-dresses', key: 'dresses', name: loc('Dresses'), slug: loc('dresses'), parent: 'cat-women', orderHint: '0.2' },
    { id: 'cat-men', key: 'men', name: loc('Men'), slug: loc('men'), orderHint: '0.3' },
    { id: 'cat-unordered', key: 'misc', name: loc('Misc'), slug: loc('misc') }
  );

  fake.productTypes.push({
    id: 'pt-1',
    attributes: [
      {
        name: 'color',
        label: loc('Color', 'Farbe'),
        isSearchable: true,
        type: { name: 'lenum', values: [{ key: 'red', label: loc('Red', 'Rot') }, { key: 'blue', label: loc('Blue', 'Blau') }] },
      },
      { name: 'size', label: loc('Size'), isSearchable: true, type: { name: 'text' } },
      { name: 'weight', label: loc('Weight'), isSearchable: true, type: { name: 'number' } },
      { name: 'secret', label: loc('Secret'), isSearchable: false, type: { name: 'text' } },
    ],
  });

  fake.products.push(
    {
      id: 'p-dress',
      key: 'summer-dress',
      name: loc('Summer Dress', 'Sommerkleid'),
      slug: loc('summer-dress'),
      description: loc('A light summer dress'),
      categories: ['cat-dresses'],
      createdAt: '2026-03-01T00:00:00.000Z',
      stores: ['store-id-gap'],
      reviewRatingStatistics: { averageRating: 4.5, count: 10, ratingsDistribution: { '5': 7, '4': 3 } },
      masterVariant: {
        id: 1,
        sku: 'DRESS-1',
        images: [{ url: 'https://img.test/dress-1.jpg', label: 'Front' }],
        attributes: [
          { name: 'color', value: { key: 'red', label: loc('Red', 'Rot') } },
          { name: 'size', value: 'M' },
        ],
        prices: [
          { value: { centAmount: 5000, currencyCode: 'USD' }, country: 'US', discounted: { value: { centAmount: 4000, currencyCode: 'USD' } }, recurrencePolicy: { id: 'rp-monthly' } },
          { value: { centAmount: 4500, currencyCode: 'EUR' } },
        ],
        availability: { isOnStock: true },
      },
      variants: [
        {
          id: 2,
          sku: 'DRESS-1-B',
          images: [{ url: 'https://img.test/dress-1b.jpg' }],
          attributes: [{ name: 'color', value: { key: 'blue', label: loc('Blue', 'Blau') } }, { name: 'size', value: 'L' }],
          prices: [{ value: { centAmount: 5500, currencyCode: 'USD' } }],
          availability: { isOnStock: false },
        },
      ],
    },
    {
      id: 'p-coat',
      key: 'wool-coat',
      name: loc('Wool Coat', 'Wollmantel'),
      slug: loc('wool-coat'),
      description: loc('A warm coat'),
      categories: ['cat-women'],
      createdAt: '2026-02-01T00:00:00.000Z',
      stores: ['store-id-gap'],
      masterVariant: {
        id: 1,
        sku: 'COAT-1',
        images: [{ url: 'https://img.test/coat.jpg' }],
        attributes: [{ name: 'color', value: { key: 'red', label: loc('Red', 'Rot') } }, { name: 'size', value: 'L' }],
        prices: [{ value: { centAmount: 12000, currencyCode: 'USD' } }],
      },
    },
    {
      id: 'p-chino',
      key: 'chino',
      name: loc('Chino'),
      slug: loc('chino'),
      categories: ['cat-men'],
      createdAt: '2026-01-01T00:00:00.000Z',
      stores: ['store-id-other'],
      masterVariant: {
        id: 1,
        sku: 'CHINO-1',
        images: [],
        attributes: [{ name: 'size', value: 'M' }],
        prices: [{ value: { centAmount: 6000, currencyCode: 'USD' } }],
      },
    }
  );
}

export interface Harness {
  fake: FakeCt;
  cache: TtlCache;
  commerce: ReturnType<typeof createCommerce>;
  store: ReturnType<typeof createCtStore>;
  client: ApiRoot;
}

export function harness(options: { ttl?: number; facetAttributes?: string[]; facetLimit?: number; seed?: boolean } = {}): Harness {
  const fake = createFakeCt('us-store');
  if (options.seed !== false) seedShop(fake);
  const cache = new TtlCache(options.ttl ?? 15);
  const client = createApiRoot(CT_CONFIG, { fetch: fake.fetch });
  const commerce = createCommerce(client, cache, {
    attributes: options.facetAttributes ?? [],
    limit: options.facetLimit ?? 8,
  });
  return { fake, cache, commerce, store: createCtStore(client, cache), client };
}

// ── Render environment ──────────────────────────────────────────────────────────────────


export function renderEnv(
  h: Harness,
  options: {
    route?: RouteMatch | null;
    query?: string;
    instances?: SavedDataSource[];
    dataSources?: DataSourceType[];
    components?: ComponentType[];
    ctx?: Partial<CommerceContext>;
    warnings?: Array<{ obj: Record<string, unknown>; msg: string }>;
  } = {}
): RenderEnv {
  return {
    ctx: { ...CTX, ...options.ctx },
    defaultLocale: 'en-US',
    commerce: h.commerce,
    route: options.route ?? null,
    query: new URLSearchParams(options.query ?? ''),
    instances: new Map((options.instances ?? []).map((i) => [i.id, i])),
    dataSources: new Map((options.dataSources ?? []).map((d) => [d.type, d])),
    components: new Map((options.components ?? []).map((c) => [c.type, c])),
    log: { warn: (obj, msg) => { options.warnings?.push({ obj, msg }); } },
    memo: createMemo(),
  };
}

// ── Content + app ───────────────────────────────────────────────────────────────────────


const VIS = { mobile: true, tablet: true, desktop: true };

export const layout = (id: string, children: unknown[], extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'layout',
  width: '1/1',
  name: { 'en-US': id },
  visibility: VIS,
  children,
  ...extra,
});

export const placed = (id: string, type: string, settings: Record<string, unknown> = {}) => ({
  id,
  type,
  name: { 'en-US': id },
  visibility: VIS,
  settings,
});

export function publishPage(fake: FakeCt, pageId: string, main: unknown[], extra: Record<string, unknown> = {}): void {
  fake.put(PUBLISHED_PAGE_CONTAINER, pageKey(pageId), {
    schemaVersion: 3,
    pageId,
    appVersion: 1,
    publishedAt: '2026-01-01T00:00:00.000Z',
    page: { HEAD: [], MAIN: main, FOOTER: [] },
    ...extra,
  });
}

/** Store a draft page whose children are references to component objects (the v3 draft shape). */
export function draftPage(fake: FakeCt, pageId: string, rows: Array<{ id: string; children: Array<ReturnType<typeof placed>> }>): void {
  const refRows = rows.map((row) => {
    const refs = row.children.map((c) => {
      const obj = fake.put(COMPONENTS_CONTAINER, `component-${pageId}-${c.id}`, {
        schemaVersion: 3,
        type: c.type,
        pageId,
        draft: {
          schemaVersion: 3,
          currentVersion: 1,
          componentId: c.id,
          versions: [{ appVersion: 1, savedAt: 'now', publishedAt: null, name: c.name, visibility: VIS, settings: c.settings }],
        },
      });
      return { typeId: 'key-value-document', id: obj.id };
    });
    return layout(row.id, refs);
  });
  fake.put(DRAFT_PAGE_CONTAINER, pageKey(pageId), {
    schemaVersion: 3,
    pageId,
    publishedAt: null,
    draft: {
      currentVersion: 1,
      versions: [{ appVersion: 1, savedAt: 'now', publishedAt: null, page: { HEAD: [], MAIN: refRows, FOOTER: [] } }],
    },
  });
}

const catalogObject = (head: unknown) => ({
  schemaVersion: 2,
  draft: { schemaVersion: 2, currentVersion: 1, versions: [{ appVersion: 1, savedAt: 'now', publishedAt: 'now', ...(head as object) }] },
  published: { schemaVersion: 2, appVersion: 1, publishedAt: 'now', ...(head as object) },
});

/** A catalog, instances, settings and a handful of pages over the seeded shop. */
export function seedContent(fake: FakeCt): void {
  const component = (type: string, extra: Record<string, unknown> = {}) => ({
    type,
    name: { 'en-US': type },
    icon: 'Star',
    groupKey: 'content',
    schema: [],
    ...extra,
  });

  fake.put(
    CATALOG_CONTAINER,
    'components',
    catalogObject({
      groups: [{ key: 'content', name: 'Content' }],
      components: [
        component('content/hero', { inlineTextFields: ['title'], schema: [{ key: 'title', label: 'Title', kind: 'text', localized: true }] }),
        component('product/product-carousel', {
          schema: [{ key: 'products', label: 'Products', kind: 'dataSource', dataSourceType: 'commercetools/product-list' }],
        }),
        component('product/title', { pageTypes: ['pdp'], fill: { kind: 'product-detail', slice: 'breadcrumb' } }),
        component('product/price', { pageTypes: ['pdp'], fill: { kind: 'product-detail', slice: 'price' } }),
        component('product/gallery', { pageTypes: ['pdp'], fill: { kind: 'product-detail', slice: 'gallery' } }),
        component('category/products', { pageTypes: ['category'], fill: { kind: 'category-listing', slice: 'products' } }),
        component('category/facets', { pageTypes: ['category'], fill: { kind: 'category-listing', slice: 'facets' } }),
      ],
    })
  );
  const source = (type: string, kind: string) => ({ type, name: { 'en-US': type }, icon: 'Box', groupKey: 'g', schema: [], resolver: { kind } });
  fake.put(
    CATALOG_CONTAINER,
    'data-sources',
    catalogObject({
      groups: [{ key: 'g', name: 'G' }],
      sources: [source('commercetools/product-list', 'product-list'), source('commercetools/category', 'category')],
    })
  );
  fake.put(CATALOG_CONTAINER, 'sections', catalogObject({ sections: [] }));
  fake.put(CATALOG_CONTAINER, 'theme', catalogObject({ theme: { containerMaxWidth: '70rem', sectionBackgrounds: { Dark: { background: '#111' } } } }));
  // The MC app saves the draft as the full list and publishes a snapshot of it.
  const instances = [
    {
      id: 'ds-new',
      type: 'commercetools/product-list',
      name: { 'en-US': 'New' },
      config: { categoryId: { id: 'cat-women' }, limit: 4, sort: 'newest' },
      savedForReuse: true,
    },
  ];
  fake.put(CATALOG_CONTAINER, 'data-source-instances', {
    schemaVersion: 2,
    draft: { schemaVersion: 2, instances },
    published: { schemaVersion: 2, instances },
  });
  fake.put(CATALOG_CONTAINER, 'settings', {
    schemaVersion: 2,
    preview: {
      homePageId: 'home',
      defaultLocale: 'en-US',
      routes: { home: '/{locale}', category: '/{locale}/category/{slug}', pdp: '/{locale}/{slug}/p/{sku}', content: '/{locale}/{slug}' },
    },
  });

  publishPage(fake, 'home', [
    layout('main-1', [placed('hero-1', 'content/hero', { title: { 'en-US': 'Welcome', 'de-DE': 'Willkommen' } })], { style: 'Dark' }),
    layout('main-2', [placed('carousel-1', 'product/product-carousel', { products: 'ds-new' })]),
  ]);
  publishPage(fake, 'about-us', [layout('main-1', [placed('hero-1', 'content/hero', { title: 'About' })])]);
  publishPage(fake, 'cat-root', [
    layout('main-1', [placed('products-1', 'category/products'), placed('facets-1', 'category/facets')]),
  ]);
  publishPage(fake, 'pdp-cat-root', [
    layout('main-1', [placed('title-1', 'product/title'), placed('price-1', 'product/price'), placed('gallery-1', 'product/gallery')]),
  ]);
  publishPage(fake, 'pdp-cat-dresses', [layout('main-1', [placed('title-1', 'product/title')])]);
  publishPage(fake, 'cat-cat-dresses-unused', []); // an empty page must never win
}

export interface TestApp {
  app: ReturnType<typeof buildServer>;
  fake: FakeCt;
  config: ServiceConfig;
}

export function testApp(
  overrides: Partial<ServiceConfig> = {},
  options: { seed?: boolean; content?: boolean; mcKeys?: JWTVerifyGetKey; logStream?: { write(line: string): void } } = {}
): TestApp {
  const fake = createFakeCt('us-store');
  if (options.seed !== false) seedShop(fake);
  if (options.content !== false) seedContent(fake);
  const config: ServiceConfig = {
    ...loadConfig({}),
    logLevel: 'silent',
    ct: CT_CONFIG,
    previewToken: 'preview-secret',
    editorOrigins: ['https://mc.test'],
    ...overrides,
  };
  return { app: buildServer(config, createDeps(config, { fetch: fake.fetch, mcKeys: options.mcKeys }), { logStream: options.logStream }), fake, config };
}

export const RENDER_HEADERS = { 'x-pb-wire-version': '1' };
export const renderUrl = (path: string, extra: Record<string, string> = {}): string => {
  const q = new URLSearchParams({ path, locale: 'en-US', currency: 'USD', country: 'US', store: 'gap', ...extra });
  return `/v1/render?${q.toString()}`;
};

/** A small valid host catalog: one component, one data source, one section, a theme. */
export function sampleCatalog(): import('../domain/types.js').Catalog {
  return {
    components: {
      groups: [{ key: 'content', name: 'Content' }],
      components: [
        {
          type: 'hero',
          name: { 'en-US': 'Hero' },
          icon: 'Image',
          groupKey: 'content',
          schema: [
            { key: 'title', label: 'Title', kind: 'text', localized: true },
            { key: 'feed', label: 'Feed', kind: 'dataSource', dataSourceType: 'products-by-category' },
          ],
          inlineTextFields: ['title'],
        },
      ],
    },
    'data-sources': {
      groups: [{ key: 'commerce', name: 'Commerce' }],
      sources: [
        {
          type: 'products-by-category',
          name: { 'en-US': 'Products by category' },
          icon: 'Package',
          groupKey: 'commerce',
          schema: [{ key: 'category', label: 'Category', kind: 'category' }],
          resolver: { kind: 'products-by-category' },
        },
      ],
    },
    sections: {
      sections: [{ id: 'hero-section', name: { 'en-US': 'Hero' }, description: { 'en-US': 'A hero' }, icon: 'Image', pageTypes: ['all'] }],
    },
    theme: { containerMaxWidth: '70rem' },
  };
}
