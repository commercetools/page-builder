import {
  useComponentInstancesByIds,
  usePageComponentsUpdater,
} from './use-page-components-connector';
import type { ComponentToSync } from './use-page-components-connector';
import {
  COMPONENTS_CONTAINER,
  componentKey,
} from '../../components/page-builder/types';
import { renderHookWithProviders, act, waitFor } from '../../test-utils/render';
import { installMockServer, failOperation } from '../../test-utils/msw';
import {
  buildCombinedComponent,
  buildComponentAuthored,
  buildComponentDraftVersion,
} from '../../test-utils/factories';
import { server } from '../../test-utils/msw/server';

const store = installMockServer();

const seedComponent = (componentId: string, over = {}) =>
  store.seed({
    container: COMPONENTS_CONTAINER,
    key: componentKey(componentId),
    value: buildCombinedComponent({
      draft: {
        schemaVersion: 3,
        currentVersion: 1,
        componentId,
        versions: [buildComponentDraftVersion()],
      },
      ...over,
    }),
  })[0];

describe('useComponentInstancesByIds', () => {
  it('skips the query entirely for an empty id list', async () => {
    const { result } = renderHookWithProviders(() =>
      useComponentInstancesByIds([])
    );
    // `skip` means never loading — the page connector renders this on every page.
    expect(result.current.loading).toBe(false);
    expect(result.current.byId.size).toBe(0);
  });

  it('keys the results by CT id, which is what a ComponentRef stores', async () => {
    const stored = seedComponent('c1');

    const { result } = renderHookWithProviders(() =>
      useComponentInstancesByIds([stored.id])
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect([...result.current.byId.keys()]).toEqual([stored.id]);
    expect(result.current.byId.get(stored.id)?.value.draft.componentId).toBe(
      'c1'
    );
  });

  it('fetches several ids in one request', async () => {
    const a = seedComponent('c1');
    const b = seedComponent('c2');

    const { result } = renderHookWithProviders(() =>
      useComponentInstancesByIds([a.id, b.id])
    );

    await waitFor(() => expect(result.current.byId.size).toBe(2));
  });

  it('omits ids that no longer exist rather than failing', async () => {
    const a = seedComponent('c1');

    const { result } = renderHookWithProviders(() =>
      useComponentInstancesByIds([a.id, 'co-deleted'])
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.byId.size).toBe(1);
    expect(result.current.error).toBeUndefined();
  });

  it('surfaces a query error', async () => {
    server.use(failOperation('FetchComponentInstances', 'nope'));

    const { result } = renderHookWithProviders(() =>
      useComponentInstancesByIds(['co-1'])
    );

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.byId.size).toBe(0);
  });
});

describe('usePageComponentsUpdater — syncComponents', () => {
  const toSync = (componentId: string, over = {}): ComponentToSync => ({
    componentId,
    type: 'content/hero',
    authored: buildComponentAuthored(over),
  });

  const updater = (pageId = 'home') =>
    renderHookWithProviders(() => usePageComponentsUpdater(pageId)).result;

  it('writes nothing and returns no refs for an empty list', async () => {
    const result = updater();
    let refs!: Map<string, unknown>;
    await act(async () => {
      refs = await result.current.syncComponents([]);
    });
    expect(refs.size).toBe(0);
    expect(store.all()).toHaveLength(0);
  });

  it('creates an object per component and returns a ref for each', async () => {
    const result = updater();
    let refs!: Map<string, { typeId: string; id: string }>;
    await act(async () => {
      refs = await result.current.syncComponents([toSync('c1'), toSync('c2')]);
    });

    expect([...refs.keys()]).toEqual(['c1', 'c2']);
    for (const ref of refs.values()) {
      expect(ref.typeId).toBe('key-value-document');
      expect(store.getById(ref.id)).toBeDefined();
    }
    expect(store.list(COMPONENTS_CONTAINER)).toHaveLength(2);
  });

  it('stores the component under its component- key', async () => {
    const result = updater();
    await act(async () => {
      await result.current.syncComponents([toSync('c1')]);
    });
    expect(store.get(COMPONENTS_CONTAINER, 'component-c1')).toBeDefined();
  });

  it('records the owning page id, for orphan collection', async () => {
    const result = updater('about');
    await act(async () => {
      await result.current.syncComponents([toSync('c1')]);
    });
    const stored = store.get(COMPONENTS_CONTAINER, 'component-c1');
    expect((stored?.value as { pageId: string }).pageId).toBe('about');
  });

  it('appends a version when the content changed', async () => {
    const result = updater();
    await act(async () => {
      await result.current.syncComponents([
        toSync('c1', { settings: { title: 'first' } }),
      ]);
    });
    await act(async () => {
      await result.current.syncComponents([
        toSync('c1', { settings: { title: 'second' } }),
      ]);
    });

    const stored = store.get(COMPONENTS_CONTAINER, 'component-c1');
    const versions = (stored?.value as { draft: { versions: unknown[] } }).draft
      .versions;
    expect(versions).toHaveLength(2);
  });

  it('does not rewrite a component whose content is unchanged', async () => {
    const result = updater();
    await act(async () => {
      await result.current.syncComponents([
        toSync('c1', { settings: { title: 'same' } }),
      ]);
    });
    const afterFirst = store.get(COMPONENTS_CONTAINER, 'component-c1')!.version;

    await act(async () => {
      await result.current.syncComponents([
        toSync('c1', { settings: { title: 'same' } }),
      ]);
    });

    // No new CT version means no write happened at all.
    expect(store.get(COMPONENTS_CONTAINER, 'component-c1')!.version).toBe(
      afterFirst
    );
  });

  it('returns the existing ref for an unchanged component', async () => {
    const result = updater();
    let first!: Map<string, { id: string }>;
    let second!: Map<string, { id: string }>;
    await act(async () => {
      first = await result.current.syncComponents([
        toSync('c1', { settings: { title: 'same' } }),
      ]);
    });
    await act(async () => {
      second = await result.current.syncComponents([
        toSync('c1', { settings: { title: 'same' } }),
      ]);
    });
    expect(second.get('c1')!.id).toBe(first.get('c1')!.id);
  });

  it('recovers from a version conflict by re-reading and retrying', async () => {
    const stored = seedComponent('c1');
    // Someone else writes between our read and our write.
    store.upsert(
      COMPONENTS_CONTAINER,
      componentKey('c1'),
      stored.value,
      stored.version
    );

    const result = updater();
    let refs!: Map<string, { id: string }>;
    await act(async () => {
      refs = await result.current.syncComponents([
        toSync('c1', { settings: { title: 'mine' } }),
      ]);
    });

    expect(refs.get('c1')).toBeDefined();
    const versions = (
      store.get(COMPONENTS_CONTAINER, 'component-c1')!.value as {
        draft: { versions: unknown[] };
      }
    ).draft.versions;
    expect(versions.length).toBeGreaterThan(1);
  });
});

describe('usePageComponentsUpdater — deleteComponentsByRefIds', () => {
  const updater = () =>
    renderHookWithProviders(() => usePageComponentsUpdater('home')).result;

  it('does nothing for an empty list', async () => {
    seedComponent('c1');
    const result = updater();
    await act(async () => {
      await result.current.deleteComponentsByRefIds([]);
    });
    expect(store.list(COMPONENTS_CONTAINER)).toHaveLength(1);
  });

  it('deletes the objects the given refs point at', async () => {
    const a = seedComponent('c1');
    const b = seedComponent('c2');

    const result = updater();
    await act(async () => {
      await result.current.deleteComponentsByRefIds([a.id]);
    });

    expect(store.getById(a.id)).toBeUndefined();
    expect(store.getById(b.id)).toBeDefined();
  });

  it('ignores refs that point at nothing', async () => {
    const result = updater();
    await act(async () => {
      await expect(
        result.current.deleteComponentsByRefIds(['co-gone'])
      ).resolves.toBeUndefined();
    });
  });

  it('swallows a failed delete — a leftover object is a harmless orphan', async () => {
    const a = seedComponent('c1');
    server.use(failOperation('DeleteComponentInstance', 'boom', 'mutation'));

    const result = updater();
    await act(async () => {
      await expect(
        result.current.deleteComponentsByRefIds([a.id])
      ).resolves.toBeUndefined();
    });
    // Still there, but no exception reached the caller.
    expect(store.getById(a.id)).toBeDefined();
  });
});
