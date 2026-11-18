import type { ElementStyle } from './types';

export type ElementStyleOption = {
  id: ElementStyle;
  label: Record<string, string>;
};

/**
 * Visual theme options available on every layout and component element.
 * Add a new entry here to make it selectable in the General settings panel.
 * The `id` must match the ElementStyle union in types.ts.
 * Labels are localized strings keyed by locale (e.g. "en-US").
 */
export const ELEMENT_STYLE_OPTIONS: ElementStyleOption[] = [
  {
    id: '',
    label: {
      'en-US': 'Inherit from page',
      'en-GB': 'Inherit from page',
      'de-DE': 'Von Seite erben',
      'fr-FR': 'Hériter de la page',
      'nl-NL': 'Overnemen van pagina',
      'es-ES': 'Heredar de la página',
      'pt-PT': 'Herdar da página',
      'it-IT': 'Eredita dalla pagina',
    },
  },
  {
    id: 'light',
    label: {
      'en-US': 'Light',
      'en-GB': 'Light',
      'de-DE': 'Hell',
      'fr-FR': 'Clair',
      'nl-NL': 'Licht',
      'es-ES': 'Claro',
      'pt-PT': 'Claro',
      'it-IT': 'Chiaro',
    },
  },
  {
    id: 'dark',
    label: {
      'en-US': 'Dark',
      'en-GB': 'Dark',
      'de-DE': 'Dunkel',
      'fr-FR': 'Sombre',
      'nl-NL': 'Donker',
      'es-ES': 'Oscuro',
      'pt-PT': 'Escuro',
      'it-IT': 'Scuro',
    },
  },
  {
    id: 'accent',
    label: {
      'en-US': 'Accent',
      'en-GB': 'Accent',
      'de-DE': 'Akzent',
      'fr-FR': 'Accent',
      'nl-NL': 'Accent',
      'es-ES': 'Acento',
      'pt-PT': 'Destaque',
      'it-IT': 'Accento',
    },
  },
  {
    id: 'charcoal',
    label: {
      'en-US': 'Charcoal',
      'en-GB': 'Charcoal',
      'de-DE': 'Anthrazit',
      'fr-FR': 'Anthracite',
      'nl-NL': 'Antraciet',
      'es-ES': 'Carbón',
      'pt-PT': 'Carvão',
      'it-IT': 'Antracite',
    },
  },
  {
    id: 'muted',
    label: {
      'en-US': 'Muted / subtle',
      'en-GB': 'Muted / subtle',
      'de-DE': 'Gedämpft / dezent',
      'fr-FR': 'Atténué / subtil',
      'nl-NL': 'Gedempt / subtiel',
      'es-ES': 'Atenuado / sutil',
      'pt-PT': 'Suave / subtil',
      'it-IT': 'Attenuato / sottile',
    },
  },
  {
    id: 'sage',
    label: {
      'en-US': 'Sage',
      'en-GB': 'Sage',
      'de-DE': 'Salbei',
      'fr-FR': 'Sauge',
      'nl-NL': 'Salie',
      'es-ES': 'Salvia',
      'pt-PT': 'Sálvia',
      'it-IT': 'Salvia',
    },
  },
];
