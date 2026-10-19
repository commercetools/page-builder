/**
 * Page-builder catalog — PURE DATA (no React), the single source of truth for which
 * blocks, groups and sections exist. Keep this file React-free so `build-catalog.ts` can
 * import it without a JSX runtime.
 *
 * Edit the STARTER blocks below to match your real Home / PLP / PDP components, then run
 * `npx tsx lib/page-builder/build-catalog.ts` to regenerate `page-builder.catalog.json`
 * (what `page-builder sync` pushes to commercetools).
 *
 * Scaffolded by `@commercetools-labs/page-builder init`. Safe to edit / delete freely.
 */
import {
  defineBlock,
  type BlockDefinition,
  type ComponentGroup,
  type Section,
} from '@commercetools-labs/page-builder';

/** Palette groups shown in the Merchant Center page builder. */
export const componentGroups: ComponentGroup[] = [
  { key: 'content', name: { en: 'Content' } },
  { key: 'product', name: { en: 'Product' } },
];

/**
 * STARTER blocks — named after typical Home / PLP / PDP pieces so the MC palette is not
 * empty after the first `sync`. Each is wired to <Placeholder/> in `registry.tsx` until you
 * connect the real component. `inlineTextFields` lists settings keys editable inline.
 */
// NOTE: no explicit `: BlockDefinition[]` annotation — the inferred literal `type`s drive
// compile-time registry coverage in `registry.tsx` (`buildRegistry`). `satisfies` validates
// each entry without widening those literals.
export const blocks = [
  defineBlock({
    type: 'content/hero',
    name: { en: 'Hero' },
    icon: 'Image',
    groupKey: 'content',
    pageTypes: ['all'],
    inlineTextFields: ['heading'],
    schema: [
      { key: 'heading', label: { en: 'Heading' }, kind: 'text', localized: true },
      { key: 'subheading', label: { en: 'Subheading' }, kind: 'text', localized: true },
      { key: 'image', label: { en: 'Image' }, kind: 'image' },
    ],
  }),
  defineBlock({
    type: 'content/rich-text',
    name: { en: 'Rich text' },
    icon: 'Notes',
    groupKey: 'content',
    pageTypes: ['all'],
    schema: [{ key: 'body', label: { en: 'Body' }, kind: 'richtext', localized: true }],
  }),
  defineBlock({
    type: 'product/product-grid',
    name: { en: 'Product grid' },
    icon: 'GridView',
    groupKey: 'product',
    pageTypes: ['category', 'static'],
    schema: [{ key: 'columns', label: { en: 'Columns' }, kind: 'number' }],
  }),
  defineBlock({
    type: 'product/pdp-gallery',
    name: { en: 'PDP gallery' },
    icon: 'Image',
    groupKey: 'product',
    pageTypes: ['pdp'],
    schema: [],
  }),
] satisfies readonly BlockDefinition[];

/** No hand-authored sections by default. Add Section entries here if you use them. */
export const sections: Section[] = [];
