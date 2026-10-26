/**
 * Layout transform: page payload → 12-column render sections.
 *
 * Pure and CT-free. Per-item data resolution is injected as `resolveItem` so this module owns
 * only packing, visibility and localization (the behavior pinned by the `page-builder-service`
 * spec).
 */

import type {
  LayoutElement,
  LayoutItem,
  LayoutSection,
  PageComponent,
  PageLayoutElement,
  PagePayload,
  ResponsiveNumber,
} from './types.js';

export const WIDTH_TO_COLS: Record<string, number> = {
  '1/1': 12,
  '1/2': 6,
  '1/3': 4,
  '2/3': 8,
  '1/4': 3,
  '3/4': 9,
};

/** Unrecognised widths are treated as full width. */
export const colsFor = (width: string): number => WIDTH_TO_COLS[width] ?? 12;

/** Columns stack full-width on mobile, then take their fraction on tablet/desktop. */
export function responsiveSize(cols: number): ResponsiveNumber {
  return cols >= 12 ? 12 : { mobile: 12, tablet: cols, desktop: cols };
}

/**
 * A locale key: a two-letter language and an optional region/script (`en`, `en-US`, `zh-Hant`).
 * Three-letter keys are deliberately not locales: they are far more often field names (`url`,
 * `alt`, `src`, `tag`), and an `{ url, alt }` object must never be mistaken for a locale map.
 */
const LOCALE_KEY = /^[a-z]{2}(-[a-z0-9]{2,8})?$/i;

/** A locale's value, matching the key case-insensitively (`en-us` ↔ `en-US`). */
function pick(map: Record<string, string>, locale: string): string | undefined {
  if (map[locale] !== undefined) return map[locale];
  const wanted = locale.toLowerCase();
  const key = Object.keys(map).find((k) => k.toLowerCase() === wanted);
  return key === undefined ? undefined : map[key];
}

/** Recursively collapse locale maps (`{ 'en-US': '…' }`) to plain strings for `locale`. */
export function localize<T>(value: T, locale: string, defaultLocale: string): T {
  if (Array.isArray(value)) {
    return value.map((item) => localize(item, locale, defaultLocale)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const isLocaleMap =
      entries.length > 0 &&
      entries.every(([k, v]) => LOCALE_KEY.test(k) && typeof v === 'string');
    if (isLocaleMap) {
      const map = value as Record<string, string>;
      return (pick(map, locale) ?? pick(map, defaultLocale) ?? Object.values(map)[0]) as unknown as T;
    }
    return Object.fromEntries(
      entries.map(([k, v]) => [k, localize(v, locale, defaultLocale)])
    ) as unknown as T;
  }
  return value;
}

/**
 * Localize the values of a settings/config record. The record itself is a container of named
 * fields, never a locale map, however its keys happen to read (`{ id: '…' }` is one field named
 * `id`, not the Indonesian translation of a string).
 */
export function localizeFields(record: Record<string, unknown>, locale: string, defaultLocale: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, localize(v, locale, defaultLocale)]));
}

/** Group consecutive elements into rows that never exceed twelve columns. */
export function packRows(elements: PageLayoutElement[]): PageLayoutElement[][] {
  const rows: PageLayoutElement[][] = [];
  let row: PageLayoutElement[] = [];
  let sum = 0;
  for (const element of elements) {
    const cols = colsFor(element.width);
    if (sum + cols > 12 && row.length > 0) {
      rows.push(row);
      row = [];
      sum = 0;
    }
    row.push(element);
    sum += cols;
    if (sum >= 12) {
      rows.push(row);
      row = [];
      sum = 0;
    }
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

export type ResolveItem = (child: PageComponent) => Promise<Record<string, unknown>>;

/** Transform a page payload's MAIN into render sections; `resolveItem` supplies each item's settings. */
export async function buildSections(
  payload: Pick<PagePayload, 'page'>,
  resolveItem: ResolveItem
): Promise<LayoutSection[]> {
  const rows = packRows(payload.page?.MAIN ?? []);

  return Promise.all(
    rows.map(async (row): Promise<LayoutSection> => {
      const layoutElements = await Promise.all(
        row.map(async (element): Promise<LayoutElement> => {
          const items = await Promise.all(
            element.children.map(async (child): Promise<LayoutItem> => {
              const settings = await resolveItem(child);
              return {
                layoutItemId: child.id,
                layoutItemType: child.type,
                configuration: {
                  mobile: child.visibility.mobile,
                  tablet: child.visibility.tablet,
                  desktop: child.visibility.desktop,
                  ...settings,
                },
              };
            })
          );
          return {
            layoutElementId: element.id,
            configuration: {
              mobile: element.visibility.mobile,
              tablet: element.visibility.tablet,
              desktop: element.visibility.desktop,
              size: responsiveSize(colsFor(element.width)),
            },
            items,
          };
        })
      );

      const style = row[0].style;
      return {
        sectionId: row.map((e) => e.id).join('-'),
        ...(style ? { configuration: { background: style } } : {}),
        layoutElements,
      };
    })
  );
}
