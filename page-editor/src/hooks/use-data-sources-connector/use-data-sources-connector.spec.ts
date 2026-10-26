import { useDataSourcesPublishedFetcher } from './use-data-sources-connector';
import { renderHookWithProviders, waitFor } from '../../test-utils/render';
import { installMockServer, failOperation } from '../../test-utils/msw';
import {
  buildDataSourceGroup,
  buildDataSourceType,
} from '../../test-utils/factories';
import { server } from '../../test-utils/msw/server';

const store = installMockServer();

const seed = (value: unknown) =>
  store.seed({ container: 'page-editor', key: 'data-sources', value });

const published = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  appVersion: 1,
  publishedAt: '2026-01-15T10:00:00.000Z',
  groups: [buildDataSourceGroup()],
  sources: [buildDataSourceType()],
  ...over,
});

const render = () =>
  renderHookWithProviders(() => useDataSourcesPublishedFetcher());

describe('useDataSourcesPublishedFetcher', () => {
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
  });

  it('reports null when the catalog was never published', async () => {
    seed({ schemaVersion: 2, draft: {}, published: null });

    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.payload).toBeNull();
  });

  it('reports an empty catalog as published-but-empty, not as absent', async () => {
    seed({
      schemaVersion: 2,
      draft: {},
      published: published({ groups: [], sources: [] }),
    });

    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.payload).not.toBeNull();
    expect(result.current.payload?.sources).toEqual([]);
  });

  it('surfaces a query error', async () => {
    server.use(failOperation('FetchDataSources', 'nope'));

    const { result } = render();
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.payload).toBeNull();
  });
});
