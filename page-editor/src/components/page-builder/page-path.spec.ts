import {
  SLUG_PATTERN,
  isValidSlug,
  normalizeSlug,
  pathForSlug,
  reservedSlugs,
  validateArbitrarySlug,
} from './page-path';
import {
  buildPreviewSettings,
  buildPreviewRoutes,
} from '../../test-utils/factories';

describe('normalizeSlug', () => {
  it('lowercases and trims', () => {
    expect(normalizeSlug('  About Us  ')).toBe('about-us');
  });

  it('strips leading and trailing slashes', () => {
    expect(normalizeSlug('/about/')).toBe('about');
    expect(normalizeSlug('///about///')).toBe('about');
  });

  it('turns spaces and underscores into hyphens', () => {
    expect(normalizeSlug('our  big_story')).toBe('our-big-story');
  });

  it('drops characters that are not slug-safe', () => {
    expect(normalizeSlug('Café & Bar!')).toBe('caf-bar');
  });

  it('collapses repeated hyphens and trims them from the ends', () => {
    expect(normalizeSlug('--a---b--')).toBe('a-b');
  });

  it('returns an empty string when nothing survives', () => {
    expect(normalizeSlug('!!!')).toBe('');
    expect(normalizeSlug('   ')).toBe('');
  });

  it('leaves an already-valid slug alone', () => {
    expect(normalizeSlug('spring-sale-2026')).toBe('spring-sale-2026');
  });
});

describe('isValidSlug', () => {
  it.each(['about', 'about-us', 'a1', 'spring-sale-2026'])(
    'accepts %s',
    (slug) => expect(isValidSlug(slug)).toBe(true)
  );

  it.each(['', '-about', 'about-', 'about--us', 'About', 'a/b', 'a_b', 'café'])(
    'rejects %s',
    (slug) => expect(isValidSlug(slug)).toBe(false)
  );

  it('is the exported pattern', () => {
    expect(SLUG_PATTERN.test('about-us')).toBe(true);
  });
});

describe('pathForSlug', () => {
  it('prefixes a single slash — the host adds locale and brand', () => {
    expect(pathForSlug('about')).toBe('/about');
  });
});

describe('reservedSlugs', () => {
  it('reserves the fixed page-editor ids even with no settings', () => {
    const reserved = reservedSlugs(null);
    expect(reserved).toContain('home');
    expect(reserved).toContain('cat-root');
    expect(reserved).toContain('pdp-cat-root');
  });

  it('reserves the host-static route segments', () => {
    const reserved = reservedSlugs(undefined);
    for (const segment of ['account', 'cart', 'checkout', 'search', 'login']) {
      expect(reserved).toContain(segment);
    }
  });

  it('reserves the first literal segment of each configured route template', () => {
    const reserved = reservedSlugs(
      buildPreviewSettings({
        routes: buildPreviewRoutes({
          category: '/{locale}/category/{slug}',
          pdp: '/{locale}/{brand}/product/{sku}',
        }),
      })
    );
    expect(reserved).toContain('category');
    expect(reserved).toContain('product');
  });

  it('ignores a template that is all tokens', () => {
    const reserved = reservedSlugs(
      buildPreviewSettings({
        routes: buildPreviewRoutes({
          home: '/{locale}',
          content: '/{locale}/{slug}',
        }),
      })
    );
    // `home` is reserved as a page id, not because of the template.
    expect(reserved).toContain('home');
    expect(reserved).not.toContain('{locale}');
  });

  it('honours a custom homePageId alongside the default', () => {
    const reserved = reservedSlugs(
      buildPreviewSettings({ homePageId: 'landing' })
    );
    expect(reserved).toContain('landing');
    expect(reserved).toContain('home');
  });

  it('reserves live category ids', () => {
    const reserved = reservedSlugs(null, ['shoes', 'bags']);
    expect(reserved).toContain('shoes');
    expect(reserved).toContain('bags');
  });
});

describe('validateArbitrarySlug', () => {
  const noPages = { has: () => false };
  const base = {
    settings: buildPreviewSettings(),
    existingPageIds: noPages,
  };

  it('accepts a well-formed, unused slug', () => {
    expect(validateArbitrarySlug({ ...base, slug: 'spring-sale' })).toEqual({
      ok: true,
    });
  });

  it('rejects an empty slug as empty, not as a format problem', () => {
    expect(validateArbitrarySlug({ ...base, slug: '' })).toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('rejects a malformed slug', () => {
    expect(validateArbitrarySlug({ ...base, slug: 'Not A Slug' })).toEqual({
      ok: false,
      reason: 'format',
    });
  });

  it('rejects a reserved slug', () => {
    expect(validateArbitrarySlug({ ...base, slug: 'checkout' })).toEqual({
      ok: false,
      reason: 'reserved',
    });
  });

  it('rejects a slug that collides with a live category', () => {
    expect(
      validateArbitrarySlug({ ...base, slug: 'shoes', categoryIds: ['shoes'] })
    ).toEqual({ ok: false, reason: 'reserved' });
  });

  it('rejects a slug already used by another page', () => {
    expect(
      validateArbitrarySlug({
        ...base,
        slug: 'about',
        existingPageIds: { has: (id: string) => id === 'about' },
      })
    ).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('reports reserved before duplicate when a slug is both', () => {
    expect(
      validateArbitrarySlug({
        ...base,
        slug: 'home',
        existingPageIds: { has: () => true },
      })
    ).toEqual({ ok: false, reason: 'reserved' });
  });

  it('works with no settings configured at all', () => {
    expect(
      validateArbitrarySlug({
        slug: 'about',
        settings: null,
        existingPageIds: noPages,
      })
    ).toEqual({ ok: true });
  });
});
