import { toast } from '@commercetools/nimbus';
import { useWorkflowRuntime } from './use-workflow-runtime';
import { useOrgDirectory } from '../../hooks/use-org-directory';
import type { PageWorkflowState, WorkflowDefinition } from '../workflows/types';
import type { CommentsUpdater } from '../../hooks/use-comments-connector';
import { act, renderHookWithProviders, waitFor } from '../../test-utils/render';
import { failOperation, installMockServer } from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';
import {
  buildOrgDirectory,
  buildOrgTeam,
  buildOrgUser,
  unavailableOrgDirectory,
} from '../../test-utils/factories';

const store = installMockServer();
const CONTAINER = 'page-editor';

// Membership drives hard enforcement; the directory itself has its own spec.
jest.mock('../../hooks/use-org-directory', () => ({
  ...jest.requireActual('../../hooks/use-org-directory'),
  useOrgDirectory: jest.fn(),
}));
const mockedDirectory = useOrgDirectory as jest.MockedFunction<
  typeof useOrgDirectory
>;

const AUTHOR = {
  id: 'user-1',
  email: 'tess@example.test',
  name: 'Tess Tester',
};

const definition = (
  over: Partial<WorkflowDefinition> = {}
): WorkflowDefinition => ({
  schemaVersion: 1,
  id: 'wf-1',
  name: 'Standard review',
  pageType: 'all',
  steps: [
    { id: 's1', title: 'Legal', assignee: { teamId: 't1', teamName: 'Legal' } },
    { id: 's2', title: 'Brand', assignee: { teamId: 't2', teamName: 'Brand' } },
  ],
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  ...over,
});

const seedWorkflow = (def = definition()) =>
  store.seed({ container: CONTAINER, key: `workflow-${def.id}`, value: def });

const seedState = (over: Partial<PageWorkflowState> = {}) =>
  store.seed({
    container: CONTAINER,
    key: 'wfstate-home',
    value: {
      schemaVersion: 1,
      pageId: 'home',
      pageType: 'static',
      workflowId: 'wf-1',
      workflowName: 'Standard review',
      status: 'active',
      position: 1,
      steps: definition().steps,
      history: [],
      startedAt: '2026-01-15T10:00:00.000Z',
      startedBy: AUTHOR,
      ...over,
    },
  });

const storedState = () =>
  store.get(CONTAINER, 'wfstate-home')?.value as PageWorkflowState | undefined;

let toastSuccess: jest.SpyInstance;
let toastError: jest.SpyInstance;

beforeEach(() => {
  toastSuccess = jest.spyOn(toast, 'success').mockImplementation(() => '');
  toastError = jest.spyOn(toast, 'error').mockImplementation(() => '');
  // Default: the acting user is on every team.
  mockedDirectory.mockReturnValue(
    buildOrgDirectory({
      teams: [
        buildOrgTeam({ id: 't1', members: [buildOrgUser({ id: AUTHOR.id })] }),
        buildOrgTeam({ id: 't2', members: [buildOrgUser({ id: AUTHOR.id })] }),
      ],
      currentUserId: AUTHOR.id,
    })
  );
});
afterEach(() => {
  toastSuccess.mockRestore();
  toastError.mockRestore();
});

const fakeCommentsUpdater = () =>
  ({
    loading: false,
    addComment: jest.fn(async () => undefined),
    editComment: jest.fn(),
    deleteComment: jest.fn(),
    resolveThread: jest.fn(),
  } as unknown as CommentsUpdater);

const setup = (
  over: {
    pageType?: PageWorkflowState['pageType'];
    saving?: boolean;
    commentsUpdater?: CommentsUpdater;
  } = {}
) => {
  const onSaveDraftForReview = jest.fn(async () => undefined);
  const onPublish = jest.fn(async () => undefined);
  const commentsUpdater = over.commentsUpdater ?? fakeCommentsUpdater();
  const rendered = renderHookWithProviders(() =>
    useWorkflowRuntime({
      pageId: 'home',
      pageType: over.pageType ?? 'static',
      saving: over.saving ?? false,
      author: AUTHOR,
      commentsUpdater,
      onSaveDraftForReview,
      onPublish,
      publishLabel: 'Publish',
    })
  );
  return { onSaveDraftForReview, onPublish, commentsUpdater, ...rendered };
};

describe('useWorkflowRuntime binding', () => {
  it('is inactive when no workflow exists', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.active).toBe(false));
    expect(result.current.canAdvance).toBe(false);
    expect(result.current.stageLabel).toBeUndefined();
  });

  it('is inactive for a workflow with no steps', async () => {
    seedWorkflow(definition({ steps: [] }));
    const { result } = setup();
    await waitFor(() => expect(result.current.name).toBeUndefined());
    expect(result.current.active).toBe(false);
  });

  it('binds the workflow matching the page type', async () => {
    seedWorkflow(
      definition({ id: 'wf-all', name: 'Fallback', pageType: 'all' })
    );
    seedWorkflow(
      definition({ id: 'wf-static', name: 'Static review', pageType: 'static' })
    );

    const { result } = setup({ pageType: 'static' });
    await waitFor(() => expect(result.current.active).toBe(true));
    expect(result.current.name).toBe('Static review');
  });

  it('falls back to the wildcard workflow', async () => {
    seedWorkflow(
      definition({ id: 'wf-all', name: 'Fallback', pageType: 'all' })
    );
    const { result } = setup({ pageType: 'pdp' });
    await waitFor(() => expect(result.current.name).toBe('Fallback'));
  });

  it('starts at draft with nothing yet approved', async () => {
    seedWorkflow();
    const { result } = setup();
    await waitFor(() => expect(result.current.active).toBe(true));

    expect(result.current.stageLabel).toBe('Draft');
    expect(result.current.nextLabel).toBe('Legal');
    expect(result.current.canReject).toBe(false);
    expect(result.current.atFinish).toBe(false);
  });

  it('reports the awaiting team once a step is in review', async () => {
    seedWorkflow();
    seedState({ position: 1 });
    const { result } = setup();
    await waitFor(() =>
      expect(result.current.stageLabel).toBe('Awaiting Legal')
    );
    expect(result.current.currentStepLabel).toBe('Legal');
    expect(result.current.nextLabel).toBe('Brand');
  });

  it('reports readiness to publish at the terminal step', async () => {
    seedWorkflow();
    seedState({ position: 2 });
    const { result } = setup();
    await waitFor(() => expect(result.current.atFinish).toBe(true));

    expect(result.current.stageLabel).toBe('Awaiting Brand');
    expect(result.current.nextLabel).toBe('Publish');
    expect(result.current.canPublish).toBe(true);
    expect(result.current.canAdvance).toBe(false);
  });

  it('prefers the snapshotted steps over a later definition edit', async () => {
    // A redefinition must not corrupt an in-flight page.
    seedWorkflow(
      definition({
        steps: [
          {
            id: 'sX',
            title: 'Rewritten',
            assignee: { teamId: 't9', teamName: 'New' },
          },
        ],
      })
    );
    seedState({ position: 1, steps: definition().steps });

    const { result } = setup();
    await waitFor(() => expect(result.current.currentStepLabel).toBe('Legal'));
  });
});

describe('useWorkflowRuntime permissions', () => {
  it('lets a member of the reviewing team act', async () => {
    seedWorkflow();
    seedState({ position: 1 });
    const { result } = setup();
    await waitFor(() => expect(result.current.canReject).toBe(true));
    expect(result.current.canAdvance).toBe(true);
  });

  it('blocks someone outside the reviewing team', async () => {
    mockedDirectory.mockReturnValue(
      buildOrgDirectory({
        teams: [
          buildOrgTeam({ id: 't1', members: [buildOrgUser({ id: 'other' })] }),
        ],
        currentUserId: AUTHOR.id,
      })
    );
    seedWorkflow();
    seedState({ position: 1 });

    const { result } = setup();
    await waitFor(() => expect(result.current.active).toBe(true));
    expect(result.current.canAdvance).toBe(false);
    expect(result.current.canReject).toBe(false);
  });

  it('degrades to attribution-only when the directory is unavailable', async () => {
    // Locking everyone out would be worse than not verifying membership.
    mockedDirectory.mockReturnValue(unavailableOrgDirectory());
    seedWorkflow();
    seedState({ position: 1 });

    const { result } = setup();
    await waitFor(() => expect(result.current.active).toBe(true));
    expect(result.current.canAdvance).toBe(true);
  });

  it('imposes no team check before the first step', async () => {
    mockedDirectory.mockReturnValue(
      buildOrgDirectory({
        teams: [
          buildOrgTeam({ id: 't1', members: [buildOrgUser({ id: 'other' })] }),
        ],
        currentUserId: AUTHOR.id,
      })
    );
    seedWorkflow();

    const { result } = setup();
    await waitFor(() => expect(result.current.active).toBe(true));
    expect(result.current.canAdvance).toBe(true);
  });

  it('blocks every action while a save is in flight', async () => {
    seedWorkflow();
    seedState({ position: 1 });
    const { result } = setup({ saving: true });
    await waitFor(() => expect(result.current.active).toBe(true));

    expect(result.current.canAdvance).toBe(false);
    expect(result.current.canReject).toBe(false);
    expect(result.current.canPublish).toBe(false);
  });
});

describe('useWorkflowRuntime advance', () => {
  it('saves the draft first, so reviewers see what they approve', async () => {
    seedWorkflow();
    const { result, onSaveDraftForReview } = setup();
    await waitFor(() => expect(result.current.active).toBe(true));

    await act(async () => {
      await result.current.advance();
    });
    expect(onSaveDraftForReview).toHaveBeenCalled();
  });

  it('creates the runtime object on the first advance', async () => {
    seedWorkflow();
    const { result } = setup();
    await waitFor(() => expect(result.current.active).toBe(true));

    await act(async () => {
      await result.current.advance();
    });

    expect(storedState()?.position).toBe(1);
    expect(storedState()?.workflowId).toBe('wf-1');
    expect(toastSuccess).toHaveBeenCalledWith({ title: 'Moved to Legal' });
  });

  it('records the transition as a start, then as advances', async () => {
    seedWorkflow();
    const { result } = setup();
    await waitFor(() => expect(result.current.active).toBe(true));

    await act(async () => {
      await result.current.advance();
    });
    expect(storedState()!.history[0]).toMatchObject({
      action: 'start',
      fromPosition: 0,
      toPosition: 1,
      fromLabel: 'Start',
      toLabel: 'Legal',
      actor: AUTHOR,
    });

    await act(async () => {
      await result.current.advance();
    });
    expect(storedState()!.history[1]).toMatchObject({
      action: 'advance',
      fromLabel: 'Legal',
      toLabel: 'Brand',
    });
  });

  it('refuses to advance past the last step', async () => {
    seedWorkflow();
    seedState({ position: 2 });
    const { result, onSaveDraftForReview } = setup();
    await waitFor(() => expect(result.current.atFinish).toBe(true));

    await act(async () => {
      await result.current.advance();
    });
    expect(onSaveDraftForReview).not.toHaveBeenCalled();
  });

  it('reports a failure to advance rather than leaving the state ambiguous', async () => {
    seedWorkflow();
    const { result } = setup();
    await waitFor(() => expect(result.current.active).toBe(true));
    server.use(failOperation('UpsertPageWorkflow', 'nope', 'mutation'));

    await act(async () => {
      await result.current.advance();
    });
    expect(toastError).toHaveBeenCalledWith({
      title: 'Could not advance the workflow. Please retry.',
    });
  });

  it('reports a draft-save failure as a failure to advance', async () => {
    seedWorkflow();
    const onSaveDraftForReview = jest.fn(async () => {
      throw new Error('save failed');
    });
    const rendered = renderHookWithProviders(() =>
      useWorkflowRuntime({
        pageId: 'home',
        pageType: 'static',
        saving: false,
        author: AUTHOR,
        commentsUpdater: fakeCommentsUpdater(),
        onSaveDraftForReview,
        onPublish: jest.fn(async () => undefined),
        publishLabel: 'Publish',
      })
    );
    await waitFor(() => expect(rendered.result.current.active).toBe(true));

    await act(async () => {
      await rendered.result.current.advance();
    });
    expect(toastError).toHaveBeenCalledWith({
      title: 'Could not advance the workflow. Please retry.',
    });
  });
});

describe('useWorkflowRuntime reject', () => {
  it('sends the page back one step', async () => {
    seedWorkflow();
    seedState({ position: 2 });
    const { result } = setup();
    await waitFor(() => expect(result.current.canReject).toBe(true));

    await act(async () => {
      await result.current.reject('needs work');
    });

    expect(storedState()?.position).toBe(1);
    expect(toastSuccess).toHaveBeenCalledWith({ title: 'Sent back one step.' });
  });

  it('records the rejection with its comment', async () => {
    seedWorkflow();
    seedState({ position: 1 });
    const { result } = setup();
    await waitFor(() => expect(result.current.canReject).toBe(true));

    await act(async () => {
      await result.current.reject('fix the headline');
    });

    expect(storedState()!.history[0]).toMatchObject({
      action: 'reject',
      fromPosition: 1,
      toPosition: 0,
      comment: 'fix the headline',
    });
  });

  it('mirrors the rejection into the shared comment store', async () => {
    seedWorkflow();
    seedState({ position: 1 });
    const commentsUpdater = fakeCommentsUpdater();
    const { result } = setup({ commentsUpdater });
    await waitFor(() => expect(result.current.canReject).toBe(true));

    await act(async () => {
      await result.current.reject('fix the headline');
    });

    expect(commentsUpdater.addComment).toHaveBeenCalledWith(
      { kind: 'workflow', stepId: 's1', event: 'reject' },
      'fix the headline',
      AUTHOR
    );
  });

  it('closes the reject dialog on success', async () => {
    seedWorkflow();
    seedState({ position: 1 });
    const { result } = setup();
    await waitFor(() => expect(result.current.canReject).toBe(true));

    act(() => result.current.setRejectOpen(true));
    await act(async () => {
      await result.current.reject('nope');
    });
    expect(result.current.rejectOpen).toBe(false);
  });

  it('refuses to reject from draft', async () => {
    seedWorkflow();
    const { result } = setup();
    await waitFor(() => expect(result.current.active).toBe(true));

    await act(async () => {
      await result.current.reject('nope');
    });
    expect(storedState()).toBeUndefined();
  });

  it('reports a rejection failure', async () => {
    seedWorkflow();
    seedState({ position: 1 });
    const { result } = setup();
    await waitFor(() => expect(result.current.canReject).toBe(true));
    server.use(failOperation('UpsertPageWorkflow', 'nope', 'mutation'));

    await act(async () => {
      await result.current.reject('nope');
    });
    expect(toastError).toHaveBeenCalledWith({
      title: 'Could not reject. Please retry.',
    });
  });
});

describe('useWorkflowRuntime publish', () => {
  it('publishes and resets the workflow to draft', async () => {
    seedWorkflow();
    seedState({ position: 2 });
    const { result, onPublish } = setup();
    await waitFor(() => expect(result.current.canPublish).toBe(true));

    await act(async () => {
      await result.current.publishAndReset();
    });

    expect(onPublish).toHaveBeenCalled();
    expect(storedState()?.position).toBe(0);
    expect(storedState()!.history.at(-1)).toMatchObject({
      action: 'publish',
      toLabel: 'Published',
    });
  });

  it('still publishes when no workflow governs the page', async () => {
    const { result, onPublish } = setup();
    await waitFor(() => expect(result.current.active).toBe(false));

    await act(async () => {
      await result.current.publishAndReset();
    });
    expect(onPublish).toHaveBeenCalled();
  });

  it('stays quiet about a state write that fails after a successful publish', async () => {
    // `onPublish` already reported anything that went wrong with the publish.
    seedWorkflow();
    seedState({ position: 2 });
    const { result } = setup();
    await waitFor(() => expect(result.current.canPublish).toBe(true));
    server.use(failOperation('UpsertPageWorkflow', 'nope', 'mutation'));

    await act(async () => {
      await result.current.publishAndReset();
    });
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('useWorkflowRuntime history drawer', () => {
  it('exposes the transition history', async () => {
    seedWorkflow();
    seedState({
      position: 1,
      history: [
        {
          at: '2026-02-01T10:00:00.000Z',
          actor: AUTHOR,
          action: 'start',
          fromPosition: 0,
          toPosition: 1,
          fromLabel: 'Start',
          toLabel: 'Legal',
        },
      ],
    });

    const { result } = setup();
    await waitFor(() => expect(result.current.history).toHaveLength(1));
  });

  it('reports an empty history before anything happens', async () => {
    seedWorkflow();
    const { result } = setup();
    await waitFor(() => expect(result.current.active).toBe(true));
    expect(result.current.history).toEqual([]);
  });

  it('opens and closes the drawer', async () => {
    const { result } = setup();
    expect(result.current.historyOpen).toBe(false);
    act(() => result.current.setHistoryOpen(true));
    expect(result.current.historyOpen).toBe(true);
  });
});
