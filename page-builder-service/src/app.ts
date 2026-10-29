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
import { createGcsStore } from './media/gcs-store.js';
import { createMediaService, type MediaService } from './media/media-service.js';
import type { MediaStore } from './media/store.js';

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
  /** Upload and browse for the editor; null when `PB_MEDIA_*` is not configured. */
  media: MediaService | null;
}

/** The store is built on the first request that needs it and shared after that. */
function createMedia(config: ServiceConfig, store: MediaStore | undefined): MediaService | null {
  const media = config.media;
  if (!media) return null;
  let pending: Promise<MediaStore> | undefined;
  const getStore = (): Promise<MediaStore> => {
    pending ??= store ? Promise.resolve(store) : createGcsStore(media);
    // A failed build is retried by the next request rather than cached.
    pending.catch(() => {
      pending = undefined;
    });
    return pending;
  };
  return createMediaService({ config: media, getStore });
}

/** Build the dependency graph; `null` when the service has no commercetools credentials. */
export function createDeps(config: ServiceConfig, options: { fetch?: typeof fetch; mcKeys?: JWTVerifyGetKey; mediaStore?: MediaStore } = {}): Deps | null {
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
    media: createMedia(config, options.mediaStore),
    commerce: createCommerce(client, cache, { attributes: config.facetAttributes, limit: config.facetLimit }),
  };
}
