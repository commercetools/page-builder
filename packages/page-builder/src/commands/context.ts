import type { CatalogBundle, CatalogKey } from '../contract.js';
import type { CtEnv } from '../core/env.js';

/** CT connection shared by the CT-touching commands. */
export type SyncContext = { env: CtEnv; token: string };

/** The three catalog keys in a stable order. */
export const ALL_KEYS: CatalogKey[] = ['components', 'data-sources', 'sections'];

/** Extract the payload for a given catalog key from a bundle. */
export function payloadForKey(bundle: CatalogBundle, key: CatalogKey) {
  return bundle[key];
}
