/**
 * @commercetools-labs/page-builder — the storefront shim.
 *
 * ```tsx
 * import { PageBuilder } from '@commercetools-labs/page-builder';
 *
 * <PageBuilder
 *   components={{ 'content/hero': Hero }}
 *   path="/en-us/category/women"
 *   context={{ locale: 'en-US', currency: 'USD', country: 'US' }}
 *   searchParams={await searchParams}
 *   fallback={<MyOwnPage />}
 * />
 * ```
 */

export { PageBuilder, toSearch } from './page-builder.js';
export type { PageBuilderContext, PageBuilderProps, SearchParamsInput } from './page-builder.js';
export type { ComponentMap, PageBuilderComponent } from './grid.js';
export { Editable, PBEditProvider, PBText, usePBEditMode } from './edit-context.js';
export type { PBTextProps } from './edit-context.js';
export { VisualEditingBridge } from './bridge.js';
export type { VisualEditingBridgeProps } from './bridge.js';
export { WIRE_VERSION } from './wire.js';
export type * from './wire.js';
