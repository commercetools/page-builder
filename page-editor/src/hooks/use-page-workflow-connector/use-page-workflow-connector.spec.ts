import {
  usePageWorkflowFetcher,
  usePageWorkflowUpdater,
} from './use-page-workflow-connector';
import type { PageWorkflowState } from '../../components/workflows/types';
import { renderHookWithProviders, act, waitFor } from '../../test-utils/render';
import { installMockServer, failOperation } from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';

const store = installMockServer();
const CONTAINER = 'page-editor';
const keyFor = (pageId: string) => `wfstate-${pageId}`;

const actor = { id: 'u1', name: 'Tess' };

const state = (over: Partial<PageWorkflowState> = {}): PageWorkflowState => ({
  schemaVersion: 1,
  pageId: 'home',
  pageType: 'static',
  workflowId: 'wf-1',
  workflowName: 'Standard review',
  status: 'active',
  position: 0,
  steps: [
    { id: 's1', title: 'Legal', assignee: { teamId: 't1', teamName: 'Legal' } },
  ],
  history: [],
  startedAt: '2026-01-15T10:00:00.000Z',
  startedBy: actor,
  ...over,
});

const stored = (pageId = 'home') =>
  store.get(CONTAINER, keyFor(pageId))?.value as PageWorkflowState | undefined;

describe('usePageWorkflowFetcher', () => {
  it('reports no workflow for a page that has not started one', async () => {
    const { result } = renderHookWithProviders(() =>
      usePageWorkflowFetcher('home')
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.state).toBeNull();
    expect(result.current.ctVersion).toBeNull();
  });

  it('reads the runtime state and CT version', async () => {
    store.seed({
      container: CONTAINER,
      key: keyFor('home'),
      value: state({ position: 1 }),
    });

    const { result } = renderHookWithProviders(() =>
      usePageWorkflowFetcher('home')
    );
    await waitFor(() => expect(result.current.state).not.toBeNull());
    expect(result.current.state?.position).toBe(1);
    expect(result.current.ctVersion).toBe(1);
  });

  it('keys state per page', async () => {
    store.seed({
      container: CONTAINER,
      key: keyFor('about'),
      value: state({ pageId: 'about' }),
    });

    const { result } = renderHookWithProviders(() =>
      usePageWorkflowFetcher('home')
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.state).toBeNull();
  });

  it('surfaces a query error', async () => {
    server.use(failOperation('FetchPageWorkflow', 'nope'));

    const { result } = renderHookWithProviders(() =>
      usePageWorkflowFetcher('home')
    );
    await waitFor(() => expect(result.current.error).toBeDefined());
  });
});

describe('usePageWorkflowUpdater', () => {
  const updater = (pageId = 'home') =>
    renderHookWithProviders(() => usePageWorkflowUpdater(pageId)).result;

  it('creates the state object on first save', async () => {
    const result = updater();
    await act(async () => {
      await result.current.savePageWorkflow(state(), null);
    });
    expect(stored()?.workflowId).toBe('wf-1');
  });

  it('returns the new CT version', async () => {
    const result = updater();
    let out!: { ctVersion: number | null };
    await act(async () => {
      out = await result.current.savePageWorkflow(state(), null);
    });
    expect(out.ctVersion).toBe(1);
  });

  it('advances position and appends to the history', async () => {
    const result = updater();
    let out!: { ctVersion: number | null };
    await act(async () => {
      out = await result.current.savePageWorkflow(state(), null);
    });

    const advanced = state({
      position: 1,
      history: [
        {
          at: '2026-01-15T11:00:00.000Z',
          actor,
          action: 'advance',
          fromPosition: 0,
          toPosition: 1,
          fromLabel: 'Start',
          toLabel: 'Legal',
        },
      ],
    });
    await act(async () => {
      await result.current.savePageWorkflow(advanced, out.ctVersion);
    });

    expect(stored()?.position).toBe(1);
    expect(stored()?.history).toHaveLength(1);
  });

  it('rejects a save that loses a version race', async () => {
    store.seed({ container: CONTAINER, key: keyFor('home'), value: state() });
    const result = updater();
    await act(async () => {
      await expect(
        result.current.savePageWorkflow(state({ position: 1 }), 99)
      ).rejects.toBeDefined();
    });
  });

  it('surfaces a write failure', async () => {
    server.use(failOperation('UpsertPageWorkflow', 'nope', 'mutation'));
    const result = updater();
    await act(async () => {
      await expect(
        result.current.savePageWorkflow(state(), null)
      ).rejects.toBeDefined();
    });
  });
});
