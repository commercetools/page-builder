import { describe, expect, it } from 'vitest';
import { candidatePageIds, matchRoute, type PageIdDeps } from './route.js';

describe('matchRoute (default templates)', () => {
  it.each([
    ['/en-us', { type: 'home' }],
    ['/en-us/', { type: 'home' }],
    ['/en-us/category/dresses', { type: 'category', slug: 'dresses' }],
    ['/en-us/summer-dress/p/DRESS-1', { type: 'pdp', slug: 'summer-dress', sku: 'DRESS-1' }],
    ['/en-us/about-us', { type: 'content', slug: 'about-us' }],
    ['/EN-US/Category/dresses', { type: 'category', slug: 'dresses' }],
    ['/en-us/about%20us', { type: 'content', slug: 'about us' }],
  ])('matches %s', (path, expected) => {
    expect(matchRoute(path, undefined)).toEqual(expected);
  });

  it('does not match a path that fits no template', () => {
    expect(matchRoute('/en-us/a/b/c/d/e', undefined)).toBeNull();
    expect(matchRoute('/', undefined)).toBeNull();
  });

  it('ignores a query string on the path', () => {
    expect(matchRoute('/en-us/category/dresses?x=1', undefined)).toEqual({ type: 'category', slug: 'dresses' });
  });

  it('keeps an undecodable segment as is', () => {
    expect(matchRoute('/en-us/%E0%A4%A', undefined)).toEqual({ type: 'content', slug: '%E0%A4%A' });
  });
});

describe('matchRoute (configured templates with extra tokens)', () => {
  const settings = {
    routes: {
      home: '/{locale}/{brand}',
      category: '/{locale}/{brand}/category/{slug}',
      pdp: '/{locale}/{brand}/{slug}/p/{sku}',
      content: '/{locale}/{brand}/{slug}',
    },
  };

  it.each([
    ['/en-us/gap', { type: 'home' }],
    ['/en-us/gap/category/women', { type: 'category', slug: 'women' }],
    ['/en-us/gap/shirt/p/S-1', { type: 'pdp', slug: 'shirt', sku: 'S-1' }],
    ['/en-us/gap/about', { type: 'content', slug: 'about' }],
  ])('matches %s', (path, expected) => {
    expect(matchRoute(path, settings)).toEqual(expected);
  });

  it('prefers the more specific template when two could match', () => {
    // `/{locale}/{brand}/{slug}` also fits `/en-us/gap/category`, but that has no category slug.
    expect(matchRoute('/en-us/gap/category', settings)).toEqual({ type: 'content', slug: 'category' });
  });

  it('fills missing templates from the defaults', () => {
    expect(matchRoute('/en-us/category/x', { routes: { home: '/{locale}' } })).toEqual({ type: 'category', slug: 'x' });
  });

  it('supports a locale-less template', () => {
    expect(matchRoute('/p/SKU-9', { routes: { pdp: '/p/{sku}' } })).toEqual({ type: 'pdp', slug: '', sku: 'SKU-9' });
  });
});

describe('candidatePageIds', () => {
  const deps = (overrides: Partial<PageIdDeps> = {}): PageIdDeps => ({
    categoryIdForSlug: async (slug) => (slug === 'dresses' ? 'cat-dresses' : null),
    primaryCategoryIdForSku: async (sku) => (sku === 'DRESS-1' ? 'cat-dresses' : null),
    ...overrides,
  });

  it('uses the configured home page id, defaulting to home', async () => {
    expect(await candidatePageIds({ type: 'home' }, { homePageId: 'start' }, deps())).toEqual(['start']);
    expect(await candidatePageIds({ type: 'home' }, undefined, deps())).toEqual(['home']);
    expect(await candidatePageIds({ type: 'home' }, { homePageId: '' }, deps())).toEqual(['home']);
  });

  it('uses the slug as the page id for content pages', async () => {
    expect(await candidatePageIds({ type: 'content', slug: 'about' }, undefined, deps())).toEqual(['about']);
  });

  it('tries the category page, then the shared all-categories page', async () => {
    expect(await candidatePageIds({ type: 'category', slug: 'dresses' }, undefined, deps())).toEqual(['cat-dresses', 'cat-root']);
  });

  it('has no candidates for an unknown category', async () => {
    expect(await candidatePageIds({ type: 'category', slug: 'nope' }, undefined, deps())).toEqual([]);
  });

  it('tries the category PDP override, then the global PDP templates', async () => {
    expect(await candidatePageIds({ type: 'pdp', slug: 's', sku: 'DRESS-1' }, undefined, deps())).toEqual([
      'pdp-cat-dresses',
      'pdp-cat-root',
      'pdp',
    ]);
  });

  it('falls back to the global PDP templates for an unknown product', async () => {
    expect(await candidatePageIds({ type: 'pdp', slug: 's', sku: 'NOPE' }, undefined, deps())).toEqual(['pdp-cat-root', 'pdp']);
  });
});
