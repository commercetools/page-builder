import {
  useWorkflowsFetcher,
  useWorkflowUpdater,
} from './use-workflows-connector';
import type { WorkflowDefinition } from '../../components/workflows/types';
import { renderHookWithProviders, act, waitFor } from '../../test-utils/render';
import { installMockServer, failOperation } from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';

const store = installMockServer();
const CONTAINER = 'page-editor';

const workflow = (
  over: Partial<WorkflowDefinition> = {}
): WorkflowDefinition => ({
  schemaVersion: 1,
  id: 'wf-1',
  name: 'Standard review',
  pageType: 'all',
  steps: [
    { id: 's1', title: 'Legal', assignee: { teamId: 't1', teamName: 'Legal' } },
  ],
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  ...over,
});

const seedWorkflow = (def: WorkflowDefinition) =>
  store.seed({ container: CONTAINER, key: `workflow-${def.id}`, value: def });

describe('useWorkflowsFetcher', () => {
  it('reports none when there are no workflows', async () => {
    const { result } = renderHookWithProviders(() => useWorkflowsFetcher());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workflows).toEqual([]);
  });

  it('returns a stable empty array so consumers do not re-render forever', async () => {
    const { result, rerender } = renderHookWithProviders(() =>
      useWorkflowsFetcher()
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const first = result.current.workflows;
    rerender();
    expect(result.current.workflows).toBe(first);
  });

  it('lists the workflow definitions', async () => {
    seedWorkflow(workflow());

    const { result } = renderHookWithProviders(() => useWorkflowsFetcher());
    await waitFor(() => expect(result.current.workflows).toHaveLength(1));
    expect(result.current.workflows[0].name).toBe('Standard review');
  });

  it('sorts them by name', async () => {
    seedWorkflow(workflow({ id: 'b', name: 'Zebra' }));
    seedWorkflow(workflow({ id: 'a', name: 'Alpha' }));

    const { result } = renderHookWithProviders(() => useWorkflowsFetcher());
    await waitFor(() => expect(result.current.workflows).toHaveLength(2));
    expect(result.current.workflows.map((w) => w.name)).toEqual([
      'Alpha',
      'Zebra',
    ]);
  });

  it('ignores other objects sharing the container', async () => {
    seedWorkflow(workflow());
    store.seed({
      container: CONTAINER,
      key: 'sections',
      value: { schemaVersion: 2 },
    });
    store.seed({ container: CONTAINER, key: 'wfstate-home', value: {} });

    const { result } = renderHookWithProviders(() => useWorkflowsFetcher());
    await waitFor(() => expect(result.current.workflows).toHaveLength(1));
  });

  it('skips a workflow key whose value is null', async () => {
    store.seed({ container: CONTAINER, key: 'workflow-broken', value: null });

    const { result } = renderHookWithProviders(() => useWorkflowsFetcher());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workflows).toEqual([]);
  });

  it('surfaces a query error', async () => {
    server.use(failOperation('FetchWorkflows', 'nope'));

    const { result } = renderHookWithProviders(() => useWorkflowsFetcher());
    await waitFor(() => expect(result.current.error).toBeDefined());
  });
});

describe('useWorkflowUpdater', () => {
  const updater = () =>
    renderHookWithProviders(() => useWorkflowUpdater()).result;

  it('writes a definition under its workflow- key', async () => {
    const result = updater();
    await act(async () => {
      await result.current.saveWorkflow(workflow({ id: 'wf-9' }));
    });
    expect(store.get(CONTAINER, 'workflow-wf-9')).toBeDefined();
  });

  it('overwrites an existing definition without a version check', async () => {
    seedWorkflow(workflow({ name: 'Old' }));
    const result = updater();
    await act(async () => {
      await result.current.saveWorkflow(workflow({ name: 'New' }));
    });

    const value = store.get(CONTAINER, 'workflow-wf-1')!
      .value as WorkflowDefinition;
    expect(value.name).toBe('New');
  });

  it('deletes a definition by id', async () => {
    seedWorkflow(workflow());
    const result = updater();
    await act(async () => {
      await result.current.deleteWorkflow('wf-1');
    });
    expect(store.get(CONTAINER, 'workflow-wf-1')).toBeUndefined();
  });

  it('surfaces a save failure', async () => {
    server.use(failOperation('UpsertWorkflow', 'nope', 'mutation'));
    const result = updater();
    await act(async () => {
      await expect(
        result.current.saveWorkflow(workflow())
      ).rejects.toBeDefined();
    });
  });

  it('surfaces a delete failure', async () => {
    seedWorkflow(workflow());
    server.use(failOperation('DeleteWorkflow', 'nope', 'mutation'));
    const result = updater();
    await act(async () => {
      await expect(result.current.deleteWorkflow('wf-1')).rejects.toBeDefined();
    });
  });
});
