import { gql } from '@apollo/client';
import { act, renderHookWithProviders, waitFor } from '../test-utils/render';
import { installMockServer } from '../test-utils/msw';
import { createStoreGateway } from '../test-utils/msw/store-gateway';
import {
  setServiceRequestForTests,
  useCtClient,
  useCtMutation,
  useCtQuery,
} from './transport';
import type { ServiceFeature } from './config';

const store = installMockServer();

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

const VARIABLES = { container: 'page-editor', key: 'comments-p1' };
const CTX = { target: 'ctp' } as never;

const service = (hooks: string) => ({
  environment: {
    pageBuilderServiceUrl: 'https://service.test/service',
    pageBuilderServiceHooks: hooks,
  },
});

/** A gateway spy backed by the shared store, so MC-gateway and service reads see the same data. */
function spyGateway() {
  const gateway = createStoreGateway(store);
  const calls: string[] = [];
  setServiceRequestForTests(async (call) => {
    calls.push(`${call.method} ${call.path}`);
    return gateway(call);
  });
  return calls;
}

const useRead = (feature: ServiceFeature) =>
  useCtQuery(feature, FETCH, { variables: VARIABLES, context: CTX });

describe('useCtQuery', () => {
  beforeEach(() =>
    store.seed({
      container: 'page-editor',
      key: 'comments-p1',
      value: { hello: 'world' },
    })
  );

  it('reads through the Merchant Center GraphQL gateway when the service is not configured', async () => {
    const calls = spyGateway();
    const { result } = renderHookWithProviders(() => useRead('comments'), {
      environment: {},
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(
      (result.current.data as { customObject: { value: unknown } | null })
        .customObject?.value
    ).toEqual({
      hello: 'world',
    });
    expect(calls).toEqual([]);
  });

  it('reads through the service for a family it is enabled for', async () => {
    const calls = spyGateway();
    const { result } = renderHookWithProviders(
      () => useRead('comments'),
      service('comments')
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(
      (result.current.data as { customObject: { value: unknown } | null })
        .customObject?.value
    ).toEqual({
      hello: 'world',
    });
    expect(calls).toEqual(['GET /v1/admin/objects/page-editor/comments-p1']);
  });

  it('keeps other families on the Merchant Center gateway', async () => {
    const calls = spyGateway();
    const { result } = renderHookWithProviders(
      () => useRead('workflows'),
      service('comments')
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(calls).toEqual([]);
  });

  it('honours skip on either path', async () => {
    const calls = spyGateway();
    const mc = renderHookWithProviders(
      () =>
        useCtQuery('comments', FETCH, {
          variables: VARIABLES,
          context: CTX,
          skip: true,
        }),
      { environment: {} }
    );
    const svc = renderHookWithProviders(
      () =>
        useCtQuery('comments', FETCH, {
          variables: VARIABLES,
          context: CTX,
          skip: true,
        }),
      service('all')
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(mc.result.current.data).toBeUndefined();
    expect(svc.result.current.data).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('keeps separate caches per project so one project never shows another its data', async () => {
    spyGateway();
    const a = renderHookWithProviders(() => useRead('comments'), {
      ...service('all'),
      project: { key: 'proj-a' } as never,
    });
    await waitFor(() => expect(a.result.current.data).toBeDefined());
    store.reset();
    const b = renderHookWithProviders(() => useRead('comments'), {
      ...service('all'),
      project: { key: 'proj-b' } as never,
    });
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(
      (b.result.current.data as { customObject: unknown }).customObject
    ).toBeNull();
  });
});

describe('useCtMutation', () => {
  const draft = {
    container: 'page-editor',
    key: 'comments-p1',
    value: JSON.stringify({ n: 1 }),
  };

  it('writes through the service when enabled, and through the MC gateway otherwise', async () => {
    const calls = spyGateway();

    const svc = renderHookWithProviders(
      () => useCtMutation('comments', UPSERT, { context: CTX } as never),
      service('comments')
    );
    await act(async () => {
      await svc.result.current[0]({ variables: { draft } } as never);
    });
    expect(calls).toEqual(['PUT /v1/admin/objects/page-editor/comments-p1']);
    expect(store.get('page-editor', 'comments-p1')?.value).toEqual({ n: 1 });

    const mc = renderHookWithProviders(
      () => useCtMutation('comments', UPSERT, { context: CTX } as never),
      { environment: {} }
    );
    await act(async () => {
      await mc.result.current[0]({
        variables: { draft: { ...draft, value: JSON.stringify({ n: 2 }) } },
      } as never);
    });
    expect(calls).toHaveLength(1);
    expect(store.get('page-editor', 'comments-p1')?.value).toEqual({ n: 2 });
  });
});

describe('useCtClient', () => {
  it('is the service client for an enabled family and the MC client otherwise', () => {
    spyGateway();
    const svc = renderHookWithProviders(
      () => useCtClient('comments'),
      service('comments')
    );
    const mc = renderHookWithProviders(() => useCtClient('comments'), {
      environment: {},
    });
    expect(svc.result.current).not.toBe(mc.result.current);
    // A second render finds the same client rather than building a fresh cache.
    const again = renderHookWithProviders(
      () => useCtClient('comments'),
      service('comments')
    );
    expect(again.result.current).toBe(svc.result.current);
  });
});
