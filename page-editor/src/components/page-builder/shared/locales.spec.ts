import {
  ensureAllLocales,
  useLocalizedDisplay,
  useProjectLocales,
} from './locales';
import { renderHookWithProviders } from '../../../test-utils/render';

describe('ensureAllLocales', () => {
  it('adds an empty entry for every missing locale', () => {
    expect(ensureAllLocales({ 'en-US': 'Hi' }, ['en-US', 'de-DE'])).toEqual({
      'en-US': 'Hi',
      'de-DE': '',
    });
  });

  it('leaves existing values alone, including empty ones', () => {
    expect(
      ensureAllLocales({ 'en-US': 'Hi', 'de-DE': '' }, ['en-US', 'de-DE'])
    ).toEqual({ 'en-US': 'Hi', 'de-DE': '' });
  });

  it('keeps locales that are not in the project list', () => {
    expect(ensureAllLocales({ 'fr-FR': 'Salut' }, ['en-US'])).toEqual({
      'fr-FR': 'Salut',
      'en-US': '',
    });
  });

  it('does not mutate its input', () => {
    const value = { 'en-US': 'Hi' };
    ensureAllLocales(value, ['de-DE']);
    expect(value).toEqual({ 'en-US': 'Hi' });
  });

  it('is a no-op for an empty locale list', () => {
    expect(ensureAllLocales({ 'en-US': 'Hi' }, [])).toEqual({ 'en-US': 'Hi' });
  });
});

describe('useProjectLocales', () => {
  it('reports the project languages, first one as default', () => {
    const { result } = renderHookWithProviders(() => useProjectLocales(), {
      project: { languages: ['de-DE', 'en-US'] },
    });
    expect(result.current.locales).toEqual(['de-DE', 'en-US']);
    expect(result.current.defaultLocale).toBe('de-DE');
  });

  it('falls back to en-US when the project declares no languages', () => {
    const { result } = renderHookWithProviders(() => useProjectLocales(), {
      project: { languages: [] },
    });
    expect(result.current.defaultLocale).toBe('en-US');
  });
});

describe('useLocalizedDisplay', () => {
  const displayFor = (
    value: Parameters<ReturnType<typeof useLocalizedDisplay>>[0],
    languages = ['en-US', 'de-DE']
  ) => {
    const { result } = renderHookWithProviders(() => useLocalizedDisplay(), {
      project: { languages },
      dataLocale: languages[0],
    });
    return result.current(value);
  };

  it('renders an empty string for nothing', () => {
    expect(displayFor(undefined)).toBe('');
    expect(displayFor('')).toBe('');
  });

  it('passes a plain string straight through', () => {
    expect(displayFor('Already a string')).toBe('Already a string');
  });

  it('picks the value for the active data locale', () => {
    expect(displayFor({ 'en-US': 'Hello', 'de-DE': 'Hallo' })).toBe('Hello');
  });

  it('annotates a fallback value with the locale it came from', () => {
    // `formatLocalizedString` marks any value it had to fall back to, so the
    // editor can see at a glance that a field is untranslated for this locale.
    expect(displayFor({ 'de-DE': 'Hallo' })).toBe('Hallo (DE-DE)');
  });

  it('still shows something when no project language matches at all', () => {
    // Last resort rather than an empty cell — an untranslated value beats a
    // blank one in the settings pane.
    expect(displayFor({ 'ja-JP': 'こんにちは' }, ['en-US'])).toBe(
      'こんにちは (JA-JP)'
    );
  });

  it('renders an empty string for an empty localized map', () => {
    expect(displayFor({})).toBe('');
  });
});
