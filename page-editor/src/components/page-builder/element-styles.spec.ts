import { ELEMENT_STYLE_OPTIONS } from './element-styles';

const LOCALES = [
  'en-US',
  'en-GB',
  'de-DE',
  'fr-FR',
  'nl-NL',
  'es-ES',
  'pt-PT',
  'it-IT',
];

describe('ELEMENT_STYLE_OPTIONS', () => {
  it('offers "inherit from page" first, as the empty style', () => {
    expect(ELEMENT_STYLE_OPTIONS[0].id).toBe('');
    expect(ELEMENT_STYLE_OPTIONS[0].label['en-US']).toBe('Inherit from page');
  });

  it('covers every value in the ElementStyle union', () => {
    // Kept in step by hand — types.ts cannot be enumerated at runtime, so this
    // list is the guard against adding a style to one and not the other.
    expect(ELEMENT_STYLE_OPTIONS.map((o) => o.id)).toEqual([
      '',
      'light',
      'dark',
      'accent',
      'charcoal',
      'muted',
      'sage',
    ]);
  });

  it('has no duplicate ids', () => {
    const ids = ELEMENT_STYLE_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(LOCALES)('has a non-empty label in %s for every option', (locale) => {
    for (const option of ELEMENT_STYLE_OPTIONS) {
      expect(option.label[locale]?.trim()).toBeTruthy();
    }
  });

  it('translates every option into exactly the supported locales', () => {
    for (const option of ELEMENT_STYLE_OPTIONS) {
      expect(Object.keys(option.label).sort()).toEqual([...LOCALES].sort());
    }
  });
});
