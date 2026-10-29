import { RESET_CONTAINERS, useResetConnector } from './use-reset-connector';
import {
  COMPONENTS_CONTAINER,
  DRAFT_PAGE_CONTAINER,
  LEGACY_PAGE_CONTAINER,
  PUBLISHED_PAGE_CONTAINER,
} from '../../components/page-builder/types';
import { renderHookWithProviders, act, waitFor } from '../../test-utils/render';
import { installMockServer, failOperation } from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';

const store = installMockServer();

const fill = (container: string, count: number) =>
  store.seed(
    ...Array.from({ length: count }, (_, i) => ({
      container,
      key: `object-${i}`,
      value: { i },
    }))
  );

const connector = () => renderHookWithProviders(() => useResetConnector());

describe('RESET_CONTAINERS', () => {
  it('covers every container this app owns', () => {
    expect(RESET_CONTAINERS.map((c) => c.container).sort()).toEqual(
      [
        COMPONENTS_CONTAINER,
        DRAFT_PAGE_CONTAINER,
        LEGACY_PAGE_CONTAINER,
        PUBLISHED_PAGE_CONTAINER,
      ].sort()
    );
  });

  it('excludes the contentools container, which belongs to another app', () => {
    // The page builder no longer reads it, but a project may still run contentools beside it,
    // and a reset must never wipe an app we do not own.
    expect(RESET_CONTAINERS.map((c) => c.container)).not.toContain(
      'contentools-configuration'
    );
  });

  it('describes every container, so the operator knows what they are wiping', () => {
    for (const { description } of RESET_CONTAINERS) {
      expect(description.trim()).toBeTruthy();
    }
  });
});

describe('useResetConnector — counts', () => {
  it('reports zero for empty containers', async () => {
    const { result } = connector();
    await waitFor(() => expect(result.current.loading).toBe(false));

    for (const { container } of RESET_CONTAINERS) {
      expect(result.current.counts[container]).toBe(0);
    }
    expect(result.current.error).toBeNull();
  });

  it('counts the objects in each container', async () => {
    fill(DRAFT_PAGE_CONTAINER, 3);
    fill(COMPONENTS_CONTAINER, 5);

    const { result } = connector();
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.counts[DRAFT_PAGE_CONTAINER]).toBe(3);
    expect(result.current.counts[COMPONENTS_CONTAINER]).toBe(5);
    expect(result.current.counts[PUBLISHED_PAGE_CONTAINER]).toBe(0);
  });

  it('reports an error message rather than throwing', async () => {
    server.use(failOperation('FetchContainerObjects', 'gateway down'));

    const { result } = connector();
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toContain('gateway down');
    expect(result.current.loading).toBe(false);
  });

  it('re-reads on refresh', async () => {
    const { result } = connector();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.counts[DRAFT_PAGE_CONTAINER]).toBe(0);

    fill(DRAFT_PAGE_CONTAINER, 2);
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.counts[DRAFT_PAGE_CONTAINER]).toBe(2);
  });
});

describe('useResetConnector — resetContainers', () => {
  it('deletes every object in the named container', async () => {
    fill(DRAFT_PAGE_CONTAINER, 4);

    const { result } = connector();
    await waitFor(() => expect(result.current.loading).toBe(false));

    let deleted!: Record<string, number>;
    await act(async () => {
      deleted = await result.current.resetContainers([DRAFT_PAGE_CONTAINER]);
    });

    expect(deleted).toEqual({ [DRAFT_PAGE_CONTAINER]: 4 });
    expect(store.list(DRAFT_PAGE_CONTAINER)).toHaveLength(0);
  });

  it('leaves containers that were not selected alone', async () => {
    fill(DRAFT_PAGE_CONTAINER, 2);
    fill(PUBLISHED_PAGE_CONTAINER, 2);

    const { result } = connector();
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.resetContainers([DRAFT_PAGE_CONTAINER]);
    });

    expect(store.list(PUBLISHED_PAGE_CONTAINER)).toHaveLength(2);
  });

  it('wipes several containers in one go', async () => {
    fill(DRAFT_PAGE_CONTAINER, 2);
    fill(COMPONENTS_CONTAINER, 3);

    const { result } = connector();
    await waitFor(() => expect(result.current.loading).toBe(false));

    let deleted!: Record<string, number>;
    await act(async () => {
      deleted = await result.current.resetContainers([
        DRAFT_PAGE_CONTAINER,
        COMPONENTS_CONTAINER,
      ]);
    });

    expect(deleted).toEqual({
      [DRAFT_PAGE_CONTAINER]: 2,
      [COMPONENTS_CONTAINER]: 3,
    });
  });

  it('pages past the 500-per-request cap', async () => {
    // 501 forces a second page; a single-page implementation would miss one.
    fill(DRAFT_PAGE_CONTAINER, 501);

    const { result } = connector();
    await waitFor(() => expect(result.current.loading).toBe(false));

    let deleted!: Record<string, number>;
    await act(async () => {
      deleted = await result.current.resetContainers([DRAFT_PAGE_CONTAINER]);
    });

    expect(deleted[DRAFT_PAGE_CONTAINER]).toBe(501);
    expect(store.list(DRAFT_PAGE_CONTAINER)).toHaveLength(0);
  }, 30_000);

  it('refreshes the counts afterwards', async () => {
    fill(DRAFT_PAGE_CONTAINER, 2);

    const { result } = connector();
    await waitFor(() =>
      expect(result.current.counts[DRAFT_PAGE_CONTAINER]).toBe(2)
    );
    await act(async () => {
      await result.current.resetContainers([DRAFT_PAGE_CONTAINER]);
    });

    expect(result.current.counts[DRAFT_PAGE_CONTAINER]).toBe(0);
  });

  it('still refreshes the counts when a delete fails part-way', async () => {
    fill(DRAFT_PAGE_CONTAINER, 2);
    const { result } = connector();
    await waitFor(() => expect(result.current.loading).toBe(false));

    server.use(failOperation('DeleteCustomObject', 'denied', 'mutation'));

    await act(async () => {
      await expect(
        result.current.resetContainers([DRAFT_PAGE_CONTAINER])
      ).rejects.toBeDefined();
    });

    // The finally block ran: counts reflect that nothing was actually removed.
    await waitFor(() =>
      expect(result.current.counts[DRAFT_PAGE_CONTAINER]).toBe(2)
    );
  });

  it('does nothing for an empty selection', async () => {
    fill(DRAFT_PAGE_CONTAINER, 2);
    const { result } = connector();
    await waitFor(() => expect(result.current.loading).toBe(false));

    let deleted!: Record<string, number>;
    await act(async () => {
      deleted = await result.current.resetContainers([]);
    });

    expect(deleted).toEqual({});
    expect(store.list(DRAFT_PAGE_CONTAINER)).toHaveLength(2);
  });
});
