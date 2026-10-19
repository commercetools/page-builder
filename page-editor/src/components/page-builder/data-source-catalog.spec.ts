import {
  defaultConfigFor,
  findDSEntry,
  summarizeConfig,
} from './data-source-catalog';
import {
  buildDataSourceType,
  buildSchemaField,
} from '../../test-utils/factories';

describe('findDSEntry', () => {
  const catalog = [
    buildDataSourceType({ type: 'commerce/product-list' }),
    buildDataSourceType({ type: 'content/blog' }),
  ];

  it('finds a type in the catalog', () => {
    expect(findDSEntry('content/blog', catalog)?.type).toBe('content/blog');
  });

  it('returns undefined for a type that is not there', () => {
    expect(findDSEntry('nope', catalog)).toBeUndefined();
  });

  it('treats an absent catalog as empty rather than throwing', () => {
    expect(findDSEntry('commerce/product-list')).toBeUndefined();
  });
});

describe('defaultConfigFor', () => {
  const defaultFor = (over: Parameters<typeof buildSchemaField>[0]) =>
    defaultConfigFor([buildSchemaField({ key: 'f', ...over })]).f;

  it('defaults a boolean to false, not empty string', () => {
    expect(defaultFor({ kind: 'boolean' })).toBe(false);
  });

  it('defaults a number to an empty string, so the input renders blank', () => {
    expect(defaultFor({ kind: 'number' })).toBe('');
  });

  it.each([
    'productPins',
    'productPicks',
    'categoryPicks',
    'categoryPins',
  ] as const)('defaults %s to an empty array', (kind) =>
    expect(defaultFor({ kind })).toEqual([])
  );

  it.each(['product', 'category'] as const)(
    'defaults a single %s reference to null',
    (kind) => expect(defaultFor({ kind })).toBeNull()
  );

  it('defaults a localized field to an empty map', () => {
    expect(defaultFor({ kind: 'text', localized: true })).toEqual({});
  });

  it('defaults anything else to an empty string', () => {
    expect(defaultFor({ kind: 'text' })).toBe('');
    expect(defaultFor({ kind: 'select' })).toBe('');
  });

  it('localized only applies to kinds without their own default', () => {
    // A localized boolean is still false — the kind checks run first.
    expect(defaultFor({ kind: 'boolean', localized: true })).toBe(false);
  });

  it('returns an empty object for an empty schema', () => {
    expect(defaultConfigFor([])).toEqual({});
  });

  it('covers every key in the schema', () => {
    const config = defaultConfigFor([
      buildSchemaField({ key: 'a', kind: 'text' }),
      buildSchemaField({ key: 'b', kind: 'boolean' }),
    ]);
    expect(Object.keys(config)).toEqual(['a', 'b']);
  });
});

describe('summarizeConfig', () => {
  const display = (v: unknown) =>
    typeof v === 'string' ? v : (v as Record<string, string>)?.['en-US'] ?? '';

  it('renders an em dash for a missing config', () => {
    expect(summarizeConfig(undefined, display)).toBe('—');
  });

  it('says "Default config" when nothing is set', () => {
    expect(summarizeConfig({}, display)).toBe('Default config');
  });

  it('skips null, empty-string and false values', () => {
    expect(
      summarizeConfig({ a: null, b: '', c: false, d: undefined }, display)
    ).toBe('Default config');
  });

  it('keeps a zero — it is a real value, unlike empty string', () => {
    expect(summarizeConfig({ limit: 0 }, display)).toBe('limit: 0');
  });

  it('joins several entries with a middot', () => {
    expect(summarizeConfig({ limit: 5, sort: 'name' }, display)).toBe(
      'limit: 5 · sort: name'
    );
  });

  it('describes a pinned array by its count', () => {
    expect(
      summarizeConfig({ pins: [{ position: 1, sku: 'a' }] }, display)
    ).toBe('pins: 1 pinned');
  });

  it('describes a product array by its count', () => {
    expect(
      summarizeConfig({ picks: [{ sku: 'a' }, { sku: 'b' }] }, display)
    ).toBe('picks: 2 products');
  });

  it('describes anything else array-shaped as categories', () => {
    expect(summarizeConfig({ cats: [{ id: 'shoes' }] }, display)).toBe(
      'cats: 1 categories'
    );
  });

  it('skips an empty array', () => {
    expect(summarizeConfig({ picks: [] }, display)).toBe('Default config');
  });

  it('renders a localized value through the supplied formatter', () => {
    expect(summarizeConfig({ title: { 'en-US': 'Hello' } }, display)).toBe(
      'title: Hello'
    );
  });

  it('skips a localized value the formatter renders as empty', () => {
    expect(summarizeConfig({ title: { 'de-DE': 'Hallo' } }, display)).toBe(
      'Default config'
    );
  });

  it('renders true, since only false is skipped', () => {
    expect(summarizeConfig({ featured: true }, display)).toBe('featured: true');
  });
});
