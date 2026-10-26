import { ApolloClient, InMemoryCache, gql } from '@apollo/client';
import { createServiceLink, type ServiceRequest } from './service-link';

const stored = (key: string, value: unknown = {}, version = 1) => ({
  id: `id-${key}`,
  key,
  container: 'page-editor',
  version,
  value,
  lastModifiedAt: '2026-01-01T00:00:00.000Z',
});

const FETCH = gql`
  query FetchComments($container: String!, $key: String!) {
    customObject(container: $container, key: $key) {
      id
      key
      container
      version
      value
      lastModifiedAt
    }
  }
`;
const FETCH_ALIASED = gql`
  query Aliased($container: String!, $key: String!) {
    found: customObject(container: $container, key: $key) {
      id
      key
      container
      version
      value
      lastModifiedAt
    }
  }
`;
const LIST = gql`
  query FetchWorkflows(
    $container: String!
    $where: String
    $limit: Int
    $offset: Int
  ) {
    customObjects(
      container: $container
      where: $where
      limit: $limit
      offset: $offset
    ) {
      total
      count
      offset
      results {
        id
        key
        container
        version
        value
        lastModifiedAt
      }
    }
  }
`;
const UPSERT = gql`
  mutation UpsertComments($draft: CustomObjectDraft!) {
    createOrUpdateCustomObject(draft: $draft) {
      id
      key
      container
      version
      value
      lastModifiedAt
    }
  }
`;
const DELETE = gql`
  mutation DeleteWorkflow($container: String!, $key: String!, $version: Long) {
    deleteCustomObject(container: $container, key: $key, version: $version) {
      id
    }
  }
`;
const UNSUPPORTED = gql`
  query Categories {
    categories {
      results {
        id
      }
    }
  }
`;

type Call = Parameters<ServiceRequest>[0];

function setup(respond: (call: Call) => { status: number; json?: unknown }) {
  const calls: Call[] = [];
  const request: ServiceRequest = async (call) => {
    calls.push(call);
    return respond(call) as { status: number; json: unknown };
  };
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: createServiceLink(request),
  });
  return { client, calls };
}

describe('createServiceLink', () => {
  describe('customObject', () => {
    it('reads one object through the gateway and types it for the cache', async () => {
      const { client, calls } = setup(() => ({
        status: 200,
        json: stored('comments-p1', { a: 1 }),
      }));
      const { data } = await client.query({
        query: FETCH,
        variables: { container: 'page-editor', key: 'comments-p1' },
      });
      expect(calls).toEqual([
        {
          operationName: 'FetchComments',
          method: 'GET',
          path: '/v1/admin/objects/page-editor/comments-p1',
        },
      ]);
      expect(data.customObject).toMatchObject({
        __typename: 'CustomObject',
        key: 'comments-p1',
        value: { a: 1 },
        version: 1,
      });
    });

    it('answers null for a missing object', async () => {
      const { client } = setup(() => ({
        status: 404,
        json: { error: { code: 'not_found' } },
      }));
      const { data } = await client.query({
        query: FETCH,
        variables: { container: 'page-editor', key: 'nope' },
      });
      expect(data.customObject).toBeNull();
    });

    it('escapes path segments', async () => {
      const { client, calls } = setup(() => ({ status: 404 }));
      await client.query({
        query: FETCH,
        variables: { container: 'page-editor', key: 'a b/c' },
      });
      expect(calls[0]!.path).toBe('/v1/admin/objects/page-editor/a%20b%2Fc');
    });

    it('answers under the field alias', async () => {
      const { client } = setup(() => ({ status: 200, json: stored('k') }));
      const { data } = await client.query({
        query: FETCH_ALIASED,
        variables: { container: 'page-editor', key: 'k' },
      });
      expect(data.found.key).toBe('k');
    });

    it('fails on a service error, carrying the service message', async () => {
      const { client } = setup(() => ({
        status: 403,
        json: { error: { message: 'Container not allowed' } },
      }));
      await expect(
        client.query({ query: FETCH, variables: { container: 'x', key: 'k' } })
      ).rejects.toThrow('Container not allowed');
    });

    it('falls back to a generic message when the service sends none', async () => {
      const { client } = setup(() => ({ status: 500 }));
      await expect(
        client.query({ query: FETCH, variables: { container: 'x', key: 'k' } })
      ).rejects.toThrow('Request failed');
    });
  });

  describe('customObjects', () => {
    it('lists with where, limit and offset and returns a typed page', async () => {
      const { client, calls } = setup(() => ({
        status: 200,
        json: {
          results: [stored('a'), stored('b')],
          total: 5,
          offset: 2,
          limit: 2,
          count: 2,
        },
      }));
      const { data } = await client.query({
        query: LIST,
        variables: {
          container: 'page-editor-components',
          where: 'id in ("a")',
          limit: 2,
          offset: 2,
        },
      });
      expect(calls[0]).toEqual({
        operationName: 'FetchWorkflows',
        method: 'GET',
        path: '/v1/admin/objects/page-editor-components',
        query: { where: 'id in ("a")', limit: 2, offset: 2 },
      });
      expect(data.customObjects).toMatchObject({
        __typename: 'CustomObjectQueryResult',
        total: 5,
        count: 2,
        offset: 2,
      });
      expect(
        data.customObjects.results.map((r: { key: string }) => r.key)
      ).toEqual(['a', 'b']);
    });

    it('omits unset paging variables', async () => {
      const { client, calls } = setup(() => ({
        status: 200,
        json: { results: [], total: 0, offset: 0, limit: 20, count: 0 },
      }));
      await client.query({
        query: LIST,
        variables: { container: 'page-editor' },
      });
      expect(calls[0]!.query).toEqual({
        where: undefined,
        limit: undefined,
        offset: undefined,
      });
    });

    it('fails on a service error', async () => {
      const { client } = setup(() => ({
        status: 502,
        json: { error: { message: 'upstream down' } },
      }));
      await expect(
        client.query({ query: LIST, variables: { container: 'page-editor' } })
      ).rejects.toThrow('upstream down');
    });
  });

  describe('createOrUpdateCustomObject', () => {
    const draft = (extra: Record<string, unknown> = {}) => ({
      container: 'page-editor',
      key: 'comments-p1',
      value: JSON.stringify({ n: 1 }),
      ...extra,
    });

    it('sends the parsed value, with the version when given', async () => {
      const { client, calls } = setup(() => ({
        status: 200,
        json: stored('comments-p1', { n: 1 }, 4),
      }));
      const { data } = await client.mutate({
        mutation: UPSERT,
        variables: { draft: draft({ version: 3 }) },
      });
      expect(calls[0]).toEqual({
        operationName: 'UpsertComments',
        method: 'PUT',
        path: '/v1/admin/objects/page-editor/comments-p1',
        body: { value: { n: 1 }, version: 3 },
      });
      expect(data!.createOrUpdateCustomObject).toMatchObject({
        version: 4,
        value: { n: 1 },
      });
    });

    it('omits the version for a create (null or absent)', async () => {
      const { client, calls } = setup(() => ({
        status: 200,
        json: stored('comments-p1'),
      }));
      await client.mutate({
        mutation: UPSERT,
        variables: { draft: draft({ version: null }) },
      });
      expect(calls[0]!.body).toEqual({ value: { n: 1 } });
    });

    it('accepts an already-parsed value', async () => {
      const { client, calls } = setup(() => ({
        status: 200,
        json: stored('comments-p1'),
      }));
      await client.mutate({
        mutation: UPSERT,
        variables: { draft: draft({ value: { raw: true } }) },
      });
      expect(calls[0]!.body).toEqual({ value: { raw: true } });
    });

    it('reports a stale version as a ConcurrentModification GraphQL error', async () => {
      const { client } = setup(() => ({
        status: 409,
        json: { error: { code: 'conflict', message: 'modified' } },
      }));
      const error = await client
        .mutate({
          mutation: UPSERT,
          variables: { draft: draft({ version: 1 }) },
        })
        .then(
          () => null,
          (e) => e
        );
      expect(error.graphQLErrors[0]).toMatchObject({
        message: 'modified',
        extensions: { code: 'ConcurrentModification' },
      });
    });

    it('fails on other service errors', async () => {
      const { client } = setup(() => ({
        status: 403,
        json: { error: { message: 'host owned' } },
      }));
      await expect(
        client.mutate({ mutation: UPSERT, variables: { draft: draft() } })
      ).rejects.toThrow('host owned');
    });
  });

  describe('deleteCustomObject', () => {
    it('deletes with the version', async () => {
      const { client, calls } = setup(() => ({
        status: 200,
        json: stored('wf-1'),
      }));
      const { data } = await client.mutate({
        mutation: DELETE,
        variables: { container: 'page-editor', key: 'wf-1', version: 2 },
      });
      expect(calls[0]).toEqual({
        operationName: 'DeleteWorkflow',
        method: 'DELETE',
        path: '/v1/admin/objects/page-editor/wf-1',
        query: { version: 2 },
      });
      expect(data!.deleteCustomObject.id).toBe('id-wf-1');
    });

    it('omits the version when none is given', async () => {
      const { client, calls } = setup(() => ({
        status: 200,
        json: stored('wf-1'),
      }));
      await client.mutate({
        mutation: DELETE,
        variables: { container: 'page-editor', key: 'wf-1' },
      });
      expect(calls[0]!.query).toEqual({ version: undefined });
    });

    it('answers null when the object is already gone', async () => {
      const { client } = setup(() => ({
        status: 404,
        json: { error: { code: 'not_found' } },
      }));
      const { data } = await client.mutate({
        mutation: DELETE,
        variables: { container: 'page-editor', key: 'gone' },
      });
      expect(data!.deleteCustomObject).toBeNull();
    });

    it('reports a stale version as a ConcurrentModification error, and fails on other errors', async () => {
      const stale = setup(() => ({ status: 409, json: {} }));
      const error = await stale.client
        .mutate({
          mutation: DELETE,
          variables: { container: 'page-editor', key: 'wf-1', version: 1 },
        })
        .then(
          () => null,
          (e) => e
        );
      expect(error.graphQLErrors[0].extensions.code).toBe(
        'ConcurrentModification'
      );
      expect(error.graphQLErrors[0].message).toBe('Concurrent modification');

      const broken = setup(() => ({ status: 500, json: {} }));
      await expect(
        broken.client.mutate({
          mutation: DELETE,
          variables: { container: 'page-editor', key: 'wf-1' },
        })
      ).rejects.toThrow('Request failed');
    });
  });

  it('refuses operations it cannot answer instead of sending them anywhere', async () => {
    const { client, calls } = setup(() => ({ status: 200 }));
    await expect(client.query({ query: UNSUPPORTED })).rejects.toThrow(
      'cannot answer operation "Categories"'
    );
    expect(calls).toEqual([]);
  });

  it('surfaces transport failures', async () => {
    const link = createServiceLink(async () => {
      throw new Error('socket hang up');
    });
    const client = new ApolloClient({ cache: new InMemoryCache(), link });
    await expect(
      client.query({ query: FETCH, variables: { container: 'x', key: 'k' } })
    ).rejects.toThrow('socket hang up');
  });
});
