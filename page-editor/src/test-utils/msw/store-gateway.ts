/**
 * An in-process stand-in for the page-builder service's object gateway, backed by the same
 * `CustomObjectStore` the GraphQL handlers use. It mirrors the real service's contract
 * (`page-builder-service/src/routes/admin.ts`): allowlisted containers, a read-only host catalog,
 * 409 on a stale version, 404 on a missing object.
 */
import { HOST_OWNED_KEYS } from '../../service/host-owned';
import type { ServiceRequest } from '../../service/service-link';
import {
  ConflictError,
  queryStore,
  type CustomObjectStore,
} from './custom-object-store';
import type { InjectedFailure } from './handlers';

/** Roughly what the GraphQL path costs under MSW. */
const LATENCY_MS = 15;

let failures: InjectedFailure[] = [];
export const injectGatewayFailure = (failure: InjectedFailure): void =>
  void failures.push(failure);
export const clearGatewayFailures = (): void => void (failures = []);

const CONTAINERS = [
  'page-editor',
  'page-editor-draft',
  'page-editor-published',
  'page-editor-components',
];

const res = (status: number, json?: unknown) => ({ status, json });
const error = (status: number, code: string, message: string) =>
  res(status, { error: { code, message } });

export const createStoreGateway =
  (store: CustomObjectStore): ServiceRequest =>
  async ({ operationName, method, path, query, body }) => {
    // A real call takes network time. Answering instantly would let state updates land outside
    // the render's act() window and make loading states vanish before a test can observe them.
    await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
    const injected = failures.find((f) => f.operationName === operationName);
    if (injected?.kind === 'network') throw new Error(injected.message);
    // A GraphQL error has no HTTP analogue; the closest is the service failing the call.
    if (injected) return error(502, 'upstream_error', injected.message);
    const [, , , , container, key] = path.split('/').map(decodeURIComponent);
    if (!CONTAINERS.includes(container)) {
      return error(
        403,
        'container_not_allowed',
        `Container "${container}" is not managed by the page-builder`
      );
    }

    if (key === undefined) {
      const limit = typeof query?.limit === 'number' ? query.limit : 20;
      const offset = typeof query?.offset === 'number' ? query.offset : 0;
      const { total, results } = queryStore(
        store,
        container,
        query?.where as string | undefined,
        limit,
        offset
      );
      return res(200, { results, total, offset, limit, count: results.length });
    }

    if (method === 'GET') {
      const found = store.get(container, key);
      return found
        ? res(200, found)
        : error(404, 'not_found', 'No such object');
    }

    if (container === 'page-editor' && HOST_OWNED_KEYS.includes(key)) {
      return error(403, 'host_owned', 'The catalog is owned by the host');
    }

    try {
      if (method === 'PUT') {
        const { value, version } = body as { value: unknown; version?: number };
        return res(200, store.upsert(container, key, value, version));
      }
      const removed = store.delete(
        container,
        key,
        typeof query?.version === 'number' ? query.version : undefined
      );
      return removed
        ? res(200, removed)
        : error(404, 'not_found', 'No such object');
    } catch (err) {
      if (err instanceof ConflictError)
        return error(409, 'conflict', err.message);
      throw err;
    }
  };
