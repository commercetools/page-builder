/**
 * Node-only CT client helpers, exposed as the `@commercetools-labs/page-builder/core`
 * subpath. Kept out of the main entry so browser/edge bundles never pull in `node:https`.
 * A host can wire `getComponentsByIds` for draft-preview hydration from here, e.g.:
 *
 *   import { getCustomObjectsByIds } from '@commercetools-labs/page-builder/core';
 *   import { COMPONENTS_CONTAINER } from '@commercetools-labs/page-builder/contract';
 *   getComponentsByIds: (ids) => getCustomObjectsByIds(env, token, ids, COMPONENTS_CONTAINER)
 */
export * from './ct-client.js';
export * from './env.js';
