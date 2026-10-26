/**
 * An Apollo link that answers the four commercetools custom-object GraphQL operations
 * (`customObject`, `customObjects`, `createOrUpdateCustomObject`, `deleteCustomObject`) from the
 * page-builder service's object gateway.
 *
 * Every page-builder hook speaks exactly those four operations, so a hook migrates by pointing at
 * an Apollo client with this link: its query documents, cache updates, refetch behaviour and
 * optimistic-concurrency retries are untouched. A stale-version write comes back as a GraphQL
 * `ConcurrentModification` error, the same shape the GraphQL gateway produces, so the hooks'
 * read-modify-write retries work unchanged.
 */

import {
  ApolloLink,
  Observable,
  type FetchResult,
  type Operation,
} from '@apollo/client';
import type { FieldNode } from 'graphql';

export type ServiceRequest = (call: {
  /** The GraphQL operation being answered; informational (tests key failure injection on it). */
  operationName?: string;
  method: 'GET' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}) => Promise<{ status: number; json: unknown }>;

type StoredObject = {
  id: string;
  key: string;
  container: string;
  version: number;
  value: unknown;
  lastModifiedAt?: string;
};

type ObjectPage = {
  results: StoredObject[];
  total: number;
  offset: number;
  count: number;
};

const OPERATIONS = [
  'customObject',
  'customObjects',
  'createOrUpdateCustomObject',
  'deleteCustomObject',
] as const;
type OperationName = (typeof OPERATIONS)[number];

const enc = encodeURIComponent;
const objectPath = (container: string, key: string): string =>
  `/v1/admin/objects/${enc(container)}/${enc(key)}`;

const withType = (o: StoredObject) => ({ __typename: 'CustomObject', ...o });

const conflict = (message: string): FetchResult => ({
  errors: [
    { message, extensions: { code: 'ConcurrentModification' } } as never,
  ],
});

/** The root field of the operation: its name and the key it is answered under. */
function rootField(operation: Operation): {
  name: OperationName;
  responseKey: string;
} {
  const definition = operation.query.definitions.find(
    (d) => d.kind === 'OperationDefinition'
  );
  const field =
    definition && 'selectionSet' in definition
      ? (definition.selectionSet.selections[0] as FieldNode | undefined)
      : undefined;
  const name = field?.name.value;
  if (!field || !OPERATIONS.includes(name as OperationName)) {
    throw new Error(
      `The page-builder service cannot answer operation "${
        operation.operationName
      }" (${name ?? 'no field'})`
    );
  }
  return {
    name: name as OperationName,
    responseKey: field.alias?.value ?? (name as string),
  };
}

class ServiceError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ServiceError';
  }
}

const messageOf = (json: unknown, fallback: string): string => {
  const error = (json as { error?: { message?: unknown } } | undefined)?.error;
  return typeof error?.message === 'string' ? error.message : fallback;
};

/** The union of variables the four supported operations take. */
type Variables = {
  container: string;
  key: string;
  where?: string;
  limit?: number;
  offset?: number;
  version?: number;
  draft: {
    container: string;
    key: string;
    value: unknown;
    version?: number | null;
  };
};

async function execute(
  operation: Operation,
  request: ServiceRequest
): Promise<FetchResult> {
  const { name, responseKey } = rootField(operation);
  const operationName = operation.operationName;
  const vars = operation.variables as Variables;
  const data = (value: unknown): FetchResult => ({
    data: { [responseKey]: value },
  });

  switch (name) {
    case 'customObject': {
      const res = await request({
        operationName,
        method: 'GET',
        path: objectPath(vars.container, vars.key),
      });
      if (res.status === 404) return data(null);
      if (res.status !== 200)
        throw new ServiceError(
          res.status,
          messageOf(res.json, 'Request failed')
        );
      return data(withType(res.json as StoredObject));
    }

    case 'customObjects': {
      const res = await request({
        operationName,
        method: 'GET',
        path: `/v1/admin/objects/${enc(vars.container)}`,
        query: {
          where: vars.where ?? undefined,
          limit: vars.limit ?? undefined,
          offset: vars.offset ?? undefined,
        },
      });
      if (res.status !== 200)
        throw new ServiceError(
          res.status,
          messageOf(res.json, 'Request failed')
        );
      const page = res.json as ObjectPage;
      return data({
        __typename: 'CustomObjectQueryResult',
        total: page.total,
        count: page.count,
        offset: page.offset,
        results: page.results.map(withType),
      });
    }

    case 'createOrUpdateCustomObject': {
      const { draft } = vars;
      // The GraphQL gateway takes `value` as a JSON string; the service takes the JSON itself.
      const value =
        typeof draft.value === 'string' ? JSON.parse(draft.value) : draft.value;
      const res = await request({
        operationName,
        method: 'PUT',
        path: objectPath(draft.container, draft.key),
        body: {
          value,
          ...(typeof draft.version === 'number'
            ? { version: draft.version }
            : {}),
        },
      });
      if (res.status === 409)
        return conflict(messageOf(res.json, 'Concurrent modification'));
      if (res.status !== 200)
        throw new ServiceError(
          res.status,
          messageOf(res.json, 'Request failed')
        );
      return data(withType(res.json as StoredObject));
    }

    case 'deleteCustomObject': {
      const res = await request({
        operationName,
        method: 'DELETE',
        path: objectPath(vars.container, vars.key),
        query: {
          version: typeof vars.version === 'number' ? vars.version : undefined,
        },
      });
      if (res.status === 404) return data(null);
      if (res.status === 409)
        return conflict(messageOf(res.json, 'Concurrent modification'));
      if (res.status !== 200)
        throw new ServiceError(
          res.status,
          messageOf(res.json, 'Request failed')
        );
      return data(withType(res.json as StoredObject));
    }
  }
}

export const createServiceLink = (request: ServiceRequest): ApolloLink =>
  new ApolloLink(
    (operation) =>
      new Observable<FetchResult>((observer) => {
        execute(operation, request).then(
          (result) => {
            observer.next(result);
            observer.complete();
          },
          (error) => observer.error(error)
        );
      })
  );
