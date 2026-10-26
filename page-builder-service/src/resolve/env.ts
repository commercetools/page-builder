/**
 * Everything a resolver needs for one render, assembled once per request. `memo` shares
 * identical upstream work between the components of a page (one product fetch for ten PDP
 * components), which is why resolvers never call commercetools directly without it.
 */

import type { Commerce } from '../commerce/index.js';
import type { CommerceContext } from '../commerce/shapes.js';
import type { RouteMatch } from '../domain/route.js';
import type { ComponentType, DataSourceType, SavedDataSource } from '../domain/types.js';

export interface RenderLog {
  warn(obj: Record<string, unknown>, msg: string): void;
}

export interface RenderEnv {
  ctx: CommerceContext;
  /** Fallback locale when a localized value has no entry for `ctx.locale`. */
  defaultLocale: string;
  commerce: Commerce;
  route: RouteMatch | null;
  /** The host page's query string (facets, sort, offset). */
  query: URLSearchParams;
  instances: Map<string, SavedDataSource>;
  dataSources: Map<string, DataSourceType>;
  components: Map<string, ComponentType>;
  log: RenderLog;
  memo<T>(key: string, load: () => Promise<T>): Promise<T>;
}

export function createMemo(): RenderEnv['memo'] {
  const cache = new Map<string, Promise<unknown>>();
  return <T>(key: string, load: () => Promise<T>): Promise<T> => {
    let hit = cache.get(key) as Promise<T> | undefined;
    if (!hit) {
      hit = load();
      cache.set(key, hit);
    }
    return hit;
  };
}
