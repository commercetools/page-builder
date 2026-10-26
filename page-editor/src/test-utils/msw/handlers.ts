/**
 * MSW handlers for the commercetools GraphQL endpoints the connector hooks call.
 *
 * Custom-object traffic is served generically: every one of those operations selects
 * `customObjects` / `customObject` / `createOrUpdateCustomObject` / `deleteCustomObject`
 * with the same variable shape, so a handler per operation name would be 30 copies of
 * the same resolver. Instead each name is registered against one shared resolver backed
 * by `CustomObjectStore`.
 *
 * Matching happens on operation name, not on the parsed document, because the hooks
 * build `where` predicates at call time (`id in ("a", "b")`) and document-level matching
 * is brittle against that.
 */
import { graphql } from 'msw';
import type { RequestHandler } from 'msw';
import {
  ConflictError,
  CustomObjectStore,
  queryStore,
  type StoredCustomObject,
} from './custom-object-store';

/**
 * Query operations selecting `customObjects` (a list from a container).
 * Classified from the .ctp.graphql documents, not by naming convention — most
 * `Fetch*` operations read a *single* object despite the plural-sounding name.
 */
export const CUSTOM_OBJECT_LIST_QUERIES = [
  'FetchPageKeys',
  'FetchComponentInstances',
  'FetchContainerObjects',
  'FetchWorkflows',
] as const;

/** Query operations selecting `customObject` (one object by container + key). */
export const CUSTOM_OBJECT_SINGLE_QUERIES = [
  'FetchPage',
  'FetchComponents',
  'FetchSections',
  'FetchDataSources',
  'FetchDataSourceInstances',
  'FetchComments',
  'FetchPageWorkflow',
  'FetchPreviewSettings',
  'FetchImagePickerToken',
] as const;

/** Mutations that write one object. */
export const CUSTOM_OBJECT_UPSERT_MUTATIONS = [
  'UpsertPage',
  'UpsertComponentInstance',
  'UpsertDataSources',
  'UpsertComments',
  'UpsertWorkflow',
  'UpsertPageWorkflow',
  'UpsertPreviewSettings',
  'UpsertImagePickerToken',
] as const;

/** Mutations that remove one object. */
export const CUSTOM_OBJECT_DELETE_MUTATIONS = [
  'DeletePage',
  'DeleteComponentInstance',
  'DeleteWorkflow',
  'DeleteCustomObject',
] as const;

/** CT returns `value` as JSON; Apollo hands it back parsed. */
const serialize = (o: StoredCustomObject) => ({
  __typename: 'CustomObject',
  id: o.id,
  key: o.key,
  container: o.container,
  version: o.version,
  value: o.value,
  lastModifiedAt: o.lastModifiedAt,
});

const conflictResponse = (err: ConflictError) => ({
  message: err.message,
  extensions: { code: 'ConcurrentModification', currentVersion: err.actual },
});

/**
 * Build the full custom-object handler set against a store.
 *
 * @param store the backing store; seed it before rendering, assert on it afterwards
 */
export const createCustomObjectHandlers = (
  store: CustomObjectStore
): RequestHandler[] => [
  ...CUSTOM_OBJECT_LIST_QUERIES.map((name) =>
    graphql.query(name, (req, res, ctx) => {
      const { container, where, limit, offset } = req.variables as {
        container: string;
        where?: string;
        limit?: number;
        offset?: number;
      };
      const { total, results } = queryStore(
        store,
        container,
        where,
        limit,
        offset
      );
      return res(
        ctx.data({
          customObjects: {
            __typename: 'CustomObjectQueryResult',
            total,
            count: results.length,
            offset: offset ?? 0,
            results: results.map(serialize),
          },
        })
      );
    })
  ),

  ...CUSTOM_OBJECT_SINGLE_QUERIES.map((name) =>
    graphql.query(name, (req, res, ctx) => {
      const { container, key } = req.variables as {
        container: string;
        key: string;
      };
      const found = store.get(container, key);
      return res(ctx.data({ customObject: found ? serialize(found) : null }));
    })
  ),

  ...CUSTOM_OBJECT_UPSERT_MUTATIONS.map((name) =>
    graphql.mutation(name, (req, res, ctx) => {
      const { draft } = req.variables as {
        draft: {
          container: string;
          key: string;
          value: string | unknown;
          version?: number | null;
        };
      };
      // The hooks stringify `value` before sending; CT parses it back.
      const value =
        typeof draft.value === 'string' ? JSON.parse(draft.value) : draft.value;
      try {
        const saved = store.upsert(
          draft.container,
          draft.key,
          value,
          draft.version
        );
        return res(ctx.data({ createOrUpdateCustomObject: serialize(saved) }));
      } catch (err) {
        if (err instanceof ConflictError) {
          return res(ctx.errors([conflictResponse(err)]));
        }
        throw err;
      }
    })
  ),

  ...CUSTOM_OBJECT_DELETE_MUTATIONS.map((name) =>
    graphql.mutation(name, (req, res, ctx) => {
      const { container, key, version } = req.variables as {
        container: string;
        key: string;
        version?: number | null;
      };
      try {
        const removed = store.delete(container, key, version);
        return res(
          ctx.data({
            deleteCustomObject: removed
              ? { __typename: 'CustomObject', id: removed.id }
              : null,
          })
        );
      } catch (err) {
        if (err instanceof ConflictError) {
          return res(ctx.errors([conflictResponse(err)]));
        }
        throw err;
      }
    })
  ),
];

/**
 * Answer an operation with a fixed payload. For the product and category queries,
 * which are not custom-object traffic and have no shared shape worth generalising.
 */
export const respondWith = (
  operationName: string,
  data: Record<string, unknown>,
  kind: 'query' | 'mutation' = 'query'
): RequestHandler =>
  graphql[kind](operationName, (_req, res, ctx) => res(ctx.data(data)));

/** Same, but the payload is derived from the request variables. */
export const respondUsing = (
  operationName: string,
  build: (variables: Record<string, unknown>) => Record<string, unknown>,
  kind: 'query' | 'mutation' = 'query'
): RequestHandler =>
  graphql[kind](operationName, (req, res, ctx) =>
    res(ctx.data(build(req.variables as Record<string, unknown>)))
  );

/**
 * Failure injection also has to reach the service transport, which never sends a GraphQL
 * request. The handler carries the failure; `server.use` (see `./server`) registers it with the
 * in-process gateway when the suite runs with `PB_TEST_TRANSPORT=service`.
 */
export type InjectedFailure = {
  operationName: string;
  kind: 'graphql' | 'network';
  message: string;
};

const withFailure = (
  handler: RequestHandler,
  failure: InjectedFailure
): RequestHandler =>
  Object.defineProperty(handler, 'pbFailure', {
    value: failure,
    enumerable: false,
  });

export const failureOf = (
  handler: RequestHandler
): InjectedFailure | undefined =>
  (handler as RequestHandler & { pbFailure?: InjectedFailure }).pbFailure;

/** Make any operation fail with a GraphQL error — for exercising error paths. */
export const failOperation = (
  operationName: string,
  message = 'Something went wrong',
  kind: 'query' | 'mutation' = 'query'
): RequestHandler =>
  withFailure(
    graphql[kind](operationName, (_req, res, ctx) =>
      res(ctx.errors([{ message }]))
    ),
    { operationName, kind: 'graphql', message }
  );

/** Make any operation fail at the transport layer, not with a GraphQL error. */
export const networkErrorOn = (
  operationName: string,
  kind: 'query' | 'mutation' = 'query'
): RequestHandler =>
  withFailure(
    graphql[kind](operationName, (_req, res) =>
      res.networkError('Failed to connect')
    ),
    { operationName, kind: 'network', message: 'Failed to connect' }
  );
