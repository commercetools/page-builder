import { useComponentsPublishedFetcher } from './use-components-connector';
import { renderHookWithProviders, waitFor } from '../../test-utils/render';
import { installMockServer, failOperation } from '../../test-utils/msw';
import {
  buildComponentGroup,
  buildComponentType,
} from '../../test-utils/factories';
import { server } from '../../test-utils/msw/server';

const store = installMockServer();

const seed = (value: unknown) =>
  store.seed({ container: 'page-editor', key: 'components', value });

const published = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  appVersion: 1,
  publishedAt: '2026-01-15T10:00:00.000Z',
  groups: [buildComponentGroup()],
  components: [buildComponentType()],
  ...over,
});

const render = () =>
  renderHookWithProviders(() => useComponentsPublishedFetcher());

describe('useComponentsPublishedFetcher', () => {
  it('returns the published catalog and the CT version', async () => {
    const value = published();
    seed({ schemaVersion: 2, draft: {}, published: value });

    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.payload).toEqual(value);
    expect(result.current.ctVersion).toBe(1);
  });

  it('reports null when the catalog object does not exist', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.payload).toBeNull();
    expect(result.current.ctVersion).toBeNull();
  });

  it('reports null when the catalog exists but was never published', async () => {
    seed({ schemaVersion: 2, draft: {}, published: null });

    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.payload).toBeNull();
    expect(result.current.ctVersion).toBe(1);
  });

  it('reports an empty catalog as published-but-empty, not as absent', async () => {
    // A sync that writes empty arrays is a real state, and it is NOT the same as
    // "never published" — a consumer that only checks for null would silently
    // fall back to a stale or default catalog here.
    seed({
      schemaVersion: 2,
      draft: {},
      published: published({ groups: [], components: [] }),
    });

    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.payload).not.toBeNull();
    expect(result.current.payload?.components).toEqual([]);
    expect(result.current.payload?.groups).toEqual([]);
  });

  it('surfaces a query error', async () => {
    server.use(failOperation('FetchComponents', 'catalog unavailable'));

    const { result } = render();
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.payload).toBeNull();
  });
});
