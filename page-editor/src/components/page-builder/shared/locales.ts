import { useApplicationContext } from '@commercetools-frontend/application-shell-connectors';
import { formatLocalizedString } from '@commercetools-frontend/l10n';
import type { LocalizedString } from '../types';

const DEFAULT_LOCALE = 'en-US';

export function useProjectLocales(): {
  locales: string[];
  defaultLocale: string;
} {
  const languages = useApplicationContext(
    (ctx) => ctx.project?.languages ?? [DEFAULT_LOCALE]
  );
  return { locales: languages, defaultLocale: languages[0] ?? DEFAULT_LOCALE };
}

export function useLocalizedDisplay(): (
  value: LocalizedString | string | undefined
) => string {
  const { dataLocale, projectLanguages } = useApplicationContext((ctx) => ({
    dataLocale: ctx.dataLocale ?? DEFAULT_LOCALE,
    projectLanguages: ctx.project?.languages ?? [DEFAULT_LOCALE],
  }));
  return (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return (
      formatLocalizedString(
        { _: value },
        { key: '_', locale: dataLocale, fallbackOrder: projectLanguages }
      ) ?? ''
    );
  };
}

/** Ensures every project locale has an entry (adds empty string for missing ones). */
export function ensureAllLocales(
  value: LocalizedString,
  locales: string[]
): LocalizedString {
  const result = { ...value };
  for (const locale of locales) {
    if (!(locale in result)) result[locale] = '';
  }
  return result;
}
