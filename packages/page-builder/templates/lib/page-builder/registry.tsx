/**
 * Page-builder registry — pairs each block `type` with its React component (and optional
 * per-block data resolver) in ONE place. `buildRegistry` checks component coverage at COMPILE
 * TIME against `blocks` in `catalog.ts`: a missing or stray key is a type error, so the
 * palette, the render map, and the stored block `type`s can't drift apart.
 *
 * This is the one file you edit in setup: swap each `Placeholder` for your real Home / PLP /
 * PDP component.
 *
 * Scaffolded by `@commercetools-labs/page-builder init`.
 */
import { buildRegistry } from '@commercetools-labs/page-builder/react';

import { blocks } from './catalog';
import { Placeholder } from '../../components/page-builder/blocks/Placeholder';

export const registry = buildRegistry(
  blocks,
  {
    // Palette blocks — one entry per `type` in catalog.ts (coverage checked at compile time).
    'content/hero': Placeholder,
    'content/rich-text': Placeholder,
    'product/product-grid': Placeholder,
    'product/pdp-gallery': Placeholder,
  },
  {
    // Optional: per-block dynamic fills that need host context (e.g. fetch products). Runs
    // inside the transform and is merged into the block's settings before render.
    // resolvers: {
    //   'product/product-grid': async (cfg, ctx) => ({ products: await fetchProducts(cfg, ctx) }),
    // },
    //
    // Optional: route-driven, non-palette blocks (e.g. system `pdp/*` / `category/*` types)
    // that render on the same grid but are NOT shown in the MC palette.
    // systemComponents: { 'pdp/gallery': PdpGallery },
  }
);

/** Advertised to the Merchant Center in the bridge `ready` handshake. */
export const manifest = registry.manifest;
