/**
 * The grid's CSS, generated from the catalog theme. Self-contained: scoped `pb-*` classes, CSS
 * custom properties and media queries, so the host needs no Tailwind `@source`/safelist step.
 *
 * Breakpoints match the previous Tailwind grid: tablet from 768px, desktop from 1024px.
 * Per-cell column spans arrive as `--pb-cols-m/t/d` custom properties set inline on each cell.
 */

import type { Theme } from './wire.js';

export const TABLET_MIN = 768;
export const DESKTOP_MIN = 1024;

/**
 * Theme values come from the host's catalog, but they end up inside a `<style>` element, so only
 * plain CSS values are let through: no declaration or block terminators, no markup, no escapes,
 * no `url()`/`expression()`/`@import`.
 */
const UNSAFE = /[;{}<>\\@]|url\s*\(|expression\s*\(|\/\*|\*\//i;

export function safeCssValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  return v === '' || UNSAFE.test(v) ? undefined : v;
}

/** A class-name-safe token for a theme key (`Dark Blue` → `dark-blue`). */
export function slug(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** The theme key for a section's `background`, matched case-insensitively. */
export function backgroundKey(theme: Theme | undefined, background: string | undefined): string | undefined {
  if (!background || !theme?.sectionBackgrounds) return undefined;
  const wanted = background.toLowerCase();
  return Object.keys(theme.sectionBackgrounds).find((k) => k.toLowerCase() === wanted);
}

export function buildCss(theme?: Theme): string {
  const vars: string[] = [];
  const set = (name: string, value: unknown): void => {
    const v = safeCssValue(value);
    if (v) vars.push(`${name}:${v}`);
  };
  set('--pb-container-max', theme?.containerMaxWidth);
  set('--pb-container-px', theme?.containerPaddingX);
  set('--pb-gap-row', theme?.gap?.row);
  set('--pb-gap-column', theme?.gap?.column);

  const backgrounds = Object.entries(theme?.sectionBackgrounds ?? {}).flatMap(([key, value]) => {
    const background = safeCssValue(value.background);
    const color = safeCssValue(value.color);
    const s = slug(key);
    if (!background || !s) return [];
    return [`.pb-bg-${s}{background:${background};${color ? `color:${color}` : ''}}`];
  });

  return [
    `.pb-sections{${vars.join(';')}${vars.length ? ';' : ''}display:flex;flex-direction:column;row-gap:2rem;margin-block:2rem}`,
    '.pb-container{box-sizing:border-box;width:100%;max-width:var(--pb-container-max,80rem);margin-inline:auto;padding-inline:var(--pb-container-px,1rem)}',
    '.pb-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:var(--pb-gap-column,1.5rem);row-gap:var(--pb-gap-row,1.5rem)}',
    '.pb-cell{grid-column:span var(--pb-cols-m,12);display:flex;flex-direction:column;gap:.5rem;min-width:0}',
    `@media(min-width:${TABLET_MIN}px){.pb-cell{grid-column:span var(--pb-cols-t,var(--pb-cols-m,12));gap:1rem}}`,
    `@media(min-width:${DESKTOP_MIN}px){.pb-cell{grid-column:span var(--pb-cols-d,var(--pb-cols-t,var(--pb-cols-m,12)))}}`,
    `@media(max-width:${TABLET_MIN - 1}px){[data-pb-hide~="m"]{display:none!important}}`,
    `@media(min-width:${TABLET_MIN}px) and (max-width:${DESKTOP_MIN - 1}px){[data-pb-hide~="t"]{display:none!important}}`,
    `@media(min-width:${DESKTOP_MIN}px){[data-pb-hide~="d"]{display:none!important}}`,
    ...backgrounds,
  ].join('\n');
}
