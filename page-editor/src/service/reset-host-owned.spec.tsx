import { useResetConnector } from '../hooks/use-reset-connector';
import { LEGACY_PAGE_CONTAINER } from '../components/page-builder/types';
import { act, renderHookWithProviders, waitFor } from '../test-utils/render';
import { installMockServer } from '../test-utils/msw';
import { createStoreGateway } from '../test-utils/msw/store-gateway';
import { setServiceRequestForTests } from './transport';

const store = installMockServer();

const seed = () =>
  store.seed(
    ...[
      'components',
      'data-sources',
      'sections',
      'theme',
      'wfstate-home',
      'comments-home',
    ].map((key) => ({
      container: LEGACY_PAGE_CONTAINER,
      key,
      value: {},
    }))
  );

const viaService = {
  environment: {
    pageBuilderServiceUrl: 'https://service.test/service',
    pageBuilderServiceHooks: 'reset',
  },
};

describe('reset through the service', () => {
  beforeEach(() => setServiceRequestForTests(createStoreGateway(store)));

  it('leaves the host-owned catalog alone and does not count it', async () => {
    seed();
    const { result } = renderHookWithProviders(
      () => useResetConnector(),
      viaService
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.counts[LEGACY_PAGE_CONTAINER]).toBe(2);

    let deleted: Record<string, number> = {};
    await act(async () => {
      deleted = await result.current.resetContainers([LEGACY_PAGE_CONTAINER]);
    });

    expect(deleted[LEGACY_PAGE_CONTAINER]).toBe(2);
    expect(
      store
        .list(LEGACY_PAGE_CONTAINER)
        .map((o) => o.key)
        .sort()
    ).toEqual(['components', 'data-sources', 'sections', 'theme']);
    expect(result.current.error).toBeNull();
  });

  it('pages past the first 500 objects when some of them are host-owned', async () => {
    store.seed(
      ...['components', 'sections'].map((key) => ({
        container: LEGACY_PAGE_CONTAINER,
        key,
        value: {},
      })),
      ...Array.from({ length: 510 }, (_, i) => ({
        container: LEGACY_PAGE_CONTAINER,
        key: `comments-${i}`,
        value: {},
      }))
    );
    const { result } = renderHookWithProviders(
      () => useResetConnector(),
      viaService
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.counts[LEGACY_PAGE_CONTAINER]).toBe(510);
  });
});

describe('reset through the Merchant Center gateway', () => {
  it('keeps its existing behaviour: everything in the container counts and goes', async () => {
    seed();
    const { result } = renderHookWithProviders(() => useResetConnector(), {
      environment: {},
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.counts[LEGACY_PAGE_CONTAINER]).toBe(6);
  });
});
