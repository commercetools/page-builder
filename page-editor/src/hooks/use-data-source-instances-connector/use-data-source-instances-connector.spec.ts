import {
  useDataSourceInstancesFetcher,
  useDataSourceInstancesUpdater,
} from './use-data-source-instances-connector';
import { renderHookWithProviders, act, waitFor } from '../../test-utils/render';
import { installMockServer, failOperation } from '../../test-utils/msw';
import { buildSavedDataSource } from '../../test-utils/factories';
import { server } from '../../test-utils/msw/server';

const store = installMockServer();
const CONTAINER = 'page-editor';
const KEY = 'data-source-instances';

const seed = (value: unknown) =>
  store.seed({ container: CONTAINER, key: KEY, value })[0];
const stored = () =>
  store.get(CONTAINER, KEY)?.value as
    | { draft: { instances: unknown[] }; published: unknown }
    | undefined;

const combined = (
  draftInstances: unknown[],
  publishedInstances?: unknown[]
) => ({
  schemaVersion: 2,
  draft: { schemaVersion: 1, instances: draftInstances },
  published: publishedInstances
    ? { schemaVersion: 1, instances: publishedInstances }
    : null,
});

describe('useDataSourceInstancesFetcher', () => {
  it('reads the draft slice', async () => {
    const instance = buildSavedDataSource({ id: 'ds-1' });
    seed(combined([instance]));

    const { result } = renderHookWithProviders(() =>
      useDataSourceInstancesFetcher('draft')
    );
    await waitFor(() => expect(result.current.payload).not.toBeNull());
    expect(result.current.payload?.instances).toEqual([instance]);
    expect(result.current.ctVersion).toBe(1);
  });

  it('reads the published slice separately', async () => {
    const draft = buildSavedDataSource({ id: 'ds-draft' });
    const published = buildSavedDataSource({ id: 'ds-published' });
    seed(combined([draft], [published]));

    const { result } = renderHookWithProviders(() =>
      useDataSourceInstancesFetcher('published')
    );
    await waitFor(() => expect(result.current.payload).not.toBeNull());
    expect(result.current.payload?.instances).toEqual([published]);
  });

  it('reports null for a slice that has never been written', async () => {
    seed(combined([]));

    const { result } = renderHookWithProviders(() =>
      useDataSourceInstancesFetcher('published')
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.payload).toBeNull();
  });

  it('reports null when the object does not exist', async () => {
    const { result } = renderHookWithProviders(() =>
      useDataSourceInstancesFetcher('draft')
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.payload).toBeNull();
    expect(result.current.ctVersion).toBeNull();
  });

  it('surfaces a query error', async () => {
    server.use(failOperation('FetchDataSourceInstances', 'nope'));

    const { result } = renderHookWithProviders(() =>
      useDataSourceInstancesFetcher('draft')
    );
    await waitFor(() => expect(result.current.error).toBeDefined());
  });
});

describe('useDataSourceInstancesUpdater', () => {
  const updater = () =>
    renderHookWithProviders(() => useDataSourceInstancesUpdater()).result;

  it('saves instances to the draft slice only', async () => {
    const instance = buildSavedDataSource({ id: 'ds-1' });
    const result = updater();
    await act(async () => {
      await result.current.saveInstances([instance], null);
    });

    expect(stored()!.draft.instances).toEqual([instance]);
    expect(stored()!.published).toBeNull();
  });

  it('preserves the published slice across a draft save', async () => {
    const published = buildSavedDataSource({ id: 'ds-published' });
    const draft = buildSavedDataSource({ id: 'ds-draft' });
    const result = updater();

    await act(async () => {
      await result.current.saveInstances([draft], null, {
        schemaVersion: 1,
        instances: [published],
      });
    });

    expect(stored()!.published).toEqual({
      schemaVersion: 1,
      instances: [published],
    });
  });

  it('publishing copies the instances into both slices', async () => {
    const instance = buildSavedDataSource({ id: 'ds-1' });
    const result = updater();
    await act(async () => {
      await result.current.publishInstances([instance], null);
    });

    expect(stored()!.draft.instances).toEqual([instance]);
    expect(stored()!.published).toEqual({
      schemaVersion: 1,
      instances: [instance],
    });
  });

  it('returns the new CT version so the caller can write again', async () => {
    const result = updater();
    let out!: { ctVersion: number | null };
    await act(async () => {
      out = await result.current.saveInstances([], null);
    });
    expect(out.ctVersion).toBe(1);

    await act(async () => {
      out = await result.current.saveInstances([], out.ctVersion);
    });
    expect(out.ctVersion).toBe(2);
  });

  it('rejects a save that loses a version race', async () => {
    seed(combined([]));
    const result = updater();
    await act(async () => {
      // Deliberately stale version.
      await expect(result.current.saveInstances([], 99)).rejects.toBeDefined();
    });
  });

  it('surfaces a publish failure', async () => {
    server.use(failOperation('UpsertDataSources', 'nope', 'mutation'));
    const result = updater();
    await act(async () => {
      await expect(
        result.current.publishInstances([], null)
      ).rejects.toBeDefined();
    });
  });
});
