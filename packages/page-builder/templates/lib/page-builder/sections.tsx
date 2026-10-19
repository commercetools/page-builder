/**
 * The full request → render pipeline, bound once to this host's registry, CT reader, and
 * theme. Mount `<Sections>` directly in your route components — it owns reading `PB_*`/
 * `DYNAMIC_PAGES` config, the CT store, checking the `dynamicPages` flag, resolving the page
 * (preview/edit gating, `pb_page_id`, the transform, per-block resolution), and the render
 * grid. A route only ever passes what varies per request:
 *
 * ```tsx
 * export default async function HomePage({ params, searchParams }) {
 *   return (
 *     <Sections pageType="home" params={params} searchParams={searchParams}>
 *       <YourFallbackMarkup />
 *     </Sections>
 *   );
 * }
 * ```
 *
 * `children` renders whenever there's nothing to render yet — `DYNAMIC_PAGES` is off, or this
 * `pageType` isn't seeded. That's an expected, common state, not an error.
 *
 * NOTE: the grid emits dynamic Tailwind classes (`col-span-*`, `md:col-span-*`, `block` /
 * `hidden` visibility variants) and whatever `sectionBg` returns. Add this package to your
 * Tailwind `@source` and safelist those classes — see `AGENTS.md` in this folder.
 *
 * Scaffolded by `@commercetools-labs/page-builder init`.
 */
import { createPageBuilderSections } from '@commercetools-labs/page-builder/react';
import type { SectionBackground } from '@commercetools-labs/page-builder';

import { registry } from './registry';
// TODO: point this at your CT custom-object reader — it must return the object's `value`
// (or null when the object doesn't exist). See lib/page-builder/AGENTS.md.
import { getCustomObjectValue } from '@/lib/ct/custom-objects';

/** Map a page-builder section background to your Tailwind theme class. Extend as needed. */
function sectionBg(background?: SectionBackground): string | undefined {
  switch (background) {
    case 'Dark':
    case 'Charcoal':
      return 'bg-neutral-900 text-white';
    default:
      return undefined;
  }
}

export const Sections = createPageBuilderSections(registry, { sectionBg, getCustomObjectValue });
