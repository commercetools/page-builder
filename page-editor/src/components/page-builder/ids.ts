import type { Page } from './types';

/**
 * Globally-unique id for a component instance. Its commercetools object key is
 * `component-<id>`, so the id must be unique across ALL pages (not just within one),
 * which the old timestamp-based ids were not. `crypto.randomUUID()` is available in
 * every Merchant Center (secure-context) browser; the fallback only guards exotic envs.
 */
export const newComponentId = (): string => {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};

/** A fresh layout-row id (page-local; not used as a CT object key). */
export const newLayoutId = (sectionId: string): string =>
  `${sectionId}-${newComponentId()}`;

/**
 * Deep-copy a page, minting a fresh globally-unique id for every component. Used when
 * copying a page's content to a new page id (e.g. "create dedicated page as a copy of the
 * fallback"), so the copy's components become their own objects instead of aliasing the
 * source page's component objects.
 */
export const remapPageComponentIds = (page: Page): Page => {
  const out: Page = {};
  for (const [sectionId, layouts] of Object.entries(page)) {
    out[sectionId] = layouts.map((layout) => ({
      ...layout,
      children: layout.children.map((child) => ({
        ...child,
        id: newComponentId(),
      })),
    }));
  }
  return out;
};
