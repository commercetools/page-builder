/** Wires the service's dependencies from configuration. */

import { TtlCache } from './cache.js';
import { createCommerce, type Commerce } from './commerce/index.js';
import type { ServiceConfig } from './config.js';
import { createCatalogReader, type CatalogReader } from './domain/catalog-store.js';
import { createCatalogWriter, type CatalogWriter } from './domain/catalog-write.js';
import { createPageStore, type PageStore } from './domain/page-store.js';
import type { JWTVerifyGetKey } from 'jose';
import { createRemoteKeys } from './mc-auth.js';
import { createApiRoot, type ApiRoot } from './ct/client.js';
import { createCtStore, type CtStore } from './ct/store.js';

export interface Deps {
  client: ApiRoot;
  cache: TtlCache;
  store: CtStore;
  pages: PageStore;
  catalog: CatalogReader;
  catalogWriter: CatalogWriter;
  commerce: Commerce;
  /** Verification keys for Merchant Center JWTs; null when the admin API is not configured. */
  mcKeys: JWTVerifyGetKey | null;
}

/** Build the dependency graph; `null` when the service has no commercetools credentials. */
export function createDeps(config: ServiceConfig, options: { fetch?: typeof fetch; mcKeys?: JWTVerifyGetKey } = {}): Deps | null {
  if (!config.ct) return null;
  const cache = new TtlCache(config.cacheTtlSeconds);
  const client = createApiRoot(config.ct, { fetch: options.fetch });
  const store = createCtStore(client, cache);
  return {
    client,
    cache,
    store,
    pages: createPageStore(store),
    catalog: createCatalogReader(store),
    catalogWriter: createCatalogWriter(store),
    mcKeys: config.mc ? (options.mcKeys ?? createRemoteKeys(config.mc.issuer)) : null,
    commerce: createCommerce(client, cache, { attributes: config.facetAttributes, limit: config.facetLimit }),
  };
}
