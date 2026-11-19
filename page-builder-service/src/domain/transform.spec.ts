import { describe, expect, it } from 'vitest';
import { buildSections, colsFor, localize, localizeFields, packRows, responsiveSize } from './transform.js';
import type { PageComponent, PageLayoutElement } from './types.js';

const vis = { mobile: true, tablet: true, desktop: true };

const comp = (id: string, type = 'content/hero', settings: Record<string, unknown> = {}): PageComponent => ({
  id,
  type,
  name: {},
  visibility: vis,
  settings,
});

const el = (
  id: string,
  width: PageLayoutElement['width'] | string,
  children: PageComponent[] = [],
  extra: Partial<PageLayoutElement> = {}
): PageLayoutElement => ({
  id,
  kind: 'layout',
  width: width as PageLayoutElement['width'],
  name: {},
  visibility: vis,
  children,
  ...extra,
});

describe('colsFor / responsiveSize', () => {
  it.each([
    ['1/1', 12],
    ['1/2', 6],
    ['1/3', 4],
    ['2/3', 8],
    ['1/4', 3],
    ['3/4', 9],
    ['bogus', 12],
  ])('maps width %s to %i columns', (width, cols) => {
    expect(colsFor(width)).toBe(cols);
  });

  it('stacks fractions full-width on mobile', () => {
    expect(responsiveSize(12)).toBe(12);
    expect(responsiveSize(4)).toEqual({ mobile: 12, tablet: 4, desktop: 4 });
  });
});

describe('localize', () => {
  const map = { 'en-US': 'Hello', 'de-DE': 'Hallo' };

  it('collapses a locale map to the requested locale', () => {
    expect(localize(map, 'de-DE', 'en-US')).toBe('Hallo');
  });

  it('falls back to the default locale, then to any value', () => {
    expect(localize(map, 'fr-FR', 'en-US')).toBe('Hello');
    expect(localize(map, 'fr-FR', 'es-ES')).toBe('Hello');
  });

  it('matches locale keys case-insensitively', () => {
    expect(localize(map, 'de-de', 'en-US')).toBe('Hallo');
    expect(localize(map, 'fr-FR', 'EN-us')).toBe('Hello');
  });

  it('recurses through arrays and objects and leaves scalars alone', () => {
    expect(
      localize({ title: map, n: 3, list: [map, 'x'], nested: { b: true, t: map } }, 'de-DE', 'en-US')
    ).toEqual({ title: 'Hallo', n: 3, list: ['Hallo', 'x'], nested: { b: true, t: 'Hallo' } });
  });

  it('does not mistake a normal object with non-string values for a locale map', () => {
    expect(localize({ en: 1, de: 2 }, 'en', 'en')).toEqual({ en: 1, de: 2 });
  });

  it('does not treat an empty object as a locale map', () => {
    expect(localize({}, 'en', 'en')).toEqual({});
  });

  it('passes null through', () => {
    expect(localize(null, 'en', 'en')).toBeNull();
  });

  it('does not collapse objects whose keys are merely three-letter field names', () => {
    const image = { url: 'https://img/x.jpg', alt: 'A coat' };
    expect(localize(image, 'en-US', 'en-US')).toEqual(image);
    expect(localize({ src: 'a' }, 'en-US', 'en-US')).toEqual({ src: 'a' });
  });

  it('still collapses two-letter and language-only maps', () => {
    expect(localize({ en: 'Hi', de: 'Hallo' }, 'de', 'en')).toBe('Hallo');
  });
});

describe('localizeFields', () => {
  it('localizes each field but never collapses the record itself', () => {
    // A lone field whose name reads like a locale must stay a field, not become its value.
    expect(localizeFields({ id: 'abc' }, 'en-US', 'en-US')).toEqual({ id: 'abc' });
    expect(localizeFields({ en: 'x' }, 'en-US', 'en-US')).toEqual({ en: 'x' });
  });

  it('localizes nested locale maps', () => {
    expect(localizeFields({ title: { 'en-US': 'Hi', 'de-DE': 'Hallo' }, n: 1 }, 'de-DE', 'en-US')).toEqual({ title: 'Hallo', n: 1 });
  });
});

describe('packRows', () => {
  it('packs elements greedily without exceeding twelve columns', () => {
    const rows = packRows([el('a', '1/2'), el('b', '1/2'), el('c', '1/3'), el('d', '2/3'), el('e', '1/4')]);
    expect(rows.map((r) => r.map((e) => e.id))).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  it('starts a new row rather than overflowing', () => {
    const rows = packRows([el('a', '3/4'), el('b', '1/2'), el('c', '1/2')]);
    expect(rows.map((r) => r.map((e) => e.id))).toEqual([['a'], ['b', 'c']]);
  });

  it('treats an unrecognised width as full width', () => {
    expect(packRows([el('a', 'weird'), el('b', '1/2')]).map((r) => r.length)).toEqual([1, 1]);
  });

  it('returns no rows for no elements', () => {
    expect(packRows([])).toEqual([]);
  });
});

describe('buildSections', () => {
  it('builds sections with visibility, size and resolved settings', async () => {
    const page = {
      HEAD: [],
      FOOTER: [],
      MAIN: [
        el('main-1', '1/2', [comp('c1', 'content/hero', { title: 'T' })], {
          style: 'charcoal',
          visibility: { mobile: false, tablet: true, desktop: true },
        }),
        el('main-2', '1/2', [comp('c2')]),
      ],
    };
    const sections = await buildSections({ page }, async (c) => ({ resolvedFor: c.id, ...c.settings }));

    expect(sections).toEqual([
      {
        sectionId: 'main-1-main-2',
        configuration: { background: 'charcoal' },
        layoutElements: [
          {
            layoutElementId: 'main-1',
            configuration: {
              mobile: false,
              tablet: true,
              desktop: true,
              size: { mobile: 12, tablet: 6, desktop: 6 },
            },
            items: [
              {
                layoutItemId: 'c1',
                layoutItemType: 'content/hero',
                configuration: { mobile: true, tablet: true, desktop: true, resolvedFor: 'c1', title: 'T' },
              },
            ],
          },
          {
            layoutElementId: 'main-2',
            configuration: { mobile: true, tablet: true, desktop: true, size: { mobile: 12, tablet: 6, desktop: 6 } },
            items: [
              {
                layoutItemId: 'c2',
                layoutItemType: 'content/hero',
                configuration: { mobile: true, tablet: true, desktop: true, resolvedFor: 'c2' },
              },
            ],
          },
        ],
      },
    ]);
  });

  it('omits the section configuration when the row has no style', async () => {
    const sections = await buildSections({ page: { HEAD: [], FOOTER: [], MAIN: [el('a', '1/1', [comp('c')])] } }, async () => ({}));
    expect(sections[0]).not.toHaveProperty('configuration');
    expect(sections[0].layoutElements[0].configuration?.size).toBe(12);
  });

  it('returns no sections for an empty page', async () => {
    expect(await buildSections({ page: { HEAD: [], FOOTER: [], MAIN: [] } }, async () => ({}))).toEqual([]);
  });

  it('settings override visibility flags only when the resolver returns them', async () => {
    const sections = await buildSections(
      { page: { HEAD: [], FOOTER: [], MAIN: [el('a', '1/1', [comp('c')])] } },
      async () => ({ tablet: false })
    );
    expect(sections[0].layoutElements[0].items[0].configuration).toMatchObject({ mobile: true, tablet: false });
  });
});
