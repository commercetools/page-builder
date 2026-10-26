import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@commercetools/nimbus';
import { useWorkflowsFetcher } from '../../hooks/use-workflows-connector';
import {
  usePageWorkflowFetcher,
  usePageWorkflowUpdater,
} from '../../hooks/use-page-workflow-connector';
import { useOrgDirectory } from '../../hooks/use-org-directory';
import type { CommentsUpdater } from '../../hooks/use-comments-connector';
import type {
  PageWorkflowState,
  WorkflowActor,
  WorkflowTransition,
} from '../workflows/types';
import { workflowNodeLabel } from '../workflows/types';
import type { CommentAuthor } from './comments/types';
import type { PageTypeId } from './types';

type UseWorkflowRuntimeArgs = {
  pageId: string;
  pageType: PageTypeId;
  /** True while any save/publish is in flight; gates every workflow action. */
  saving: boolean;
  author: CommentAuthor;
  commentsUpdater: CommentsUpdater;
  /**
   * Persist the current content as a draft before advancing, so reviewers see
   * what they are approving. Owned by the page-document layer, not by this hook.
   */
  onSaveDraftForReview: () => Promise<void>;
  /** The normal publish flow, run by the terminal workflow step. */
  onPublish: () => Promise<void>;
  /** Label shown on the action button at the terminal step. */
  publishLabel: string;
};

/**
 * The per-page workflow state machine (features 1.1 / 1.2).
 *
 * A page follows the workflow bound to its page type, or the `all` wildcard.
 * Runtime state lives in a sibling `wfstate-{pageId}` custom object, and `steps`
 * is snapshotted on first entry so later edits to the definition cannot corrupt
 * an in-flight page.
 *
 * The hook owns the workflow's own state — the runtime object, its CT version,
 * and the two dialogs — and takes only what it cannot derive: page identity, the
 * in-flight save flag, the acting user, and callbacks into the page-document
 * layer for saving and publishing.
 */
export const useWorkflowRuntime = ({
  pageId,
  pageType,
  saving,
  author,
  commentsUpdater,
  onSaveDraftForReview,
  onPublish,
  publishLabel,
}: UseWorkflowRuntimeArgs) => {
  const orgDirectory = useOrgDirectory();
  const { workflows } = useWorkflowsFetcher();
  const fetcher = usePageWorkflowFetcher(pageId);
  const { savePageWorkflow, loading: committing } =
    usePageWorkflowUpdater(pageId);

  const [workflowState, setWorkflowState] = useState<PageWorkflowState | null>(
    null
  );
  const ctVersionRef = useRef<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  useEffect(() => {
    if (fetcher.loading) return;
    setWorkflowState(fetcher.state);
    ctVersionRef.current = fetcher.ctVersion;
  }, [fetcher.loading, fetcher.state, fetcher.ctVersion]);

  const definition = useMemo(
    () =>
      workflows.find((w) => w.pageType === pageType) ??
      workflows.find((w) => w.pageType === 'all') ??
      null,
    [workflows, pageType]
  );

  const hasWorkflow = !!definition && definition.steps.length > 0;
  const steps = workflowState?.steps ?? definition?.steps ?? [];
  const stepCount = steps.length;
  const position = workflowState?.position ?? 0;
  const active = hasWorkflow;
  const atFinish = active && position >= stepCount;
  const nextLabel =
    active && position < stepCount ? steps[position].title : publishLabel;
  const currentTeam =
    active && position >= 1 ? steps[position - 1]?.assignee : null;
  // Hard enforcement: only the current step's assigned team may advance or
  // reject. When the org directory is unavailable we cannot verify membership,
  // so we degrade to attribution-only rather than lock everyone out.
  const myTeamOk =
    !currentTeam ||
    !orgDirectory.available ||
    orgDirectory.isMemberOfTeam(currentTeam.teamId);
  const canAdvance = active && !atFinish && myTeamOk && !saving;
  const canPublish = active && atFinish && myTeamOk && !saving;
  const canReject = active && position >= 1 && myTeamOk && !saving;
  const stageLabel = !active
    ? undefined
    : position === 0
    ? 'Draft'
    : position <= stepCount
    ? `Awaiting ${currentTeam?.teamName || 'review'}`
    : 'Ready to publish';

  const actorInfo = (): WorkflowActor => ({
    id: author.id,
    name: author.name,
    email: author.email,
  });

  const ensureWorkflowState = (): PageWorkflowState | null => {
    if (!definition) return null;
    if (workflowState) return workflowState;
    return {
      schemaVersion: 1,
      pageId,
      pageType,
      workflowId: definition.id,
      workflowName: definition.name,
      status: 'active',
      position: 0,
      steps: definition.steps,
      history: [],
      startedAt: new Date().toISOString(),
      startedBy: actorInfo(),
    };
  };

  const commit = async (next: PageWorkflowState) => {
    const res = await savePageWorkflow(next, ctVersionRef.current);
    setWorkflowState(next);
    ctVersionRef.current = res.ctVersion;
  };

  const advance = async () => {
    const base = ensureWorkflowState();
    if (!base || base.position >= base.steps.length) return;
    try {
      // Persist the latest content as a draft first, so reviewers see it.
      await onSaveDraftForReview();
      const p = base.position;
      const transition: WorkflowTransition = {
        at: new Date().toISOString(),
        actor: actorInfo(),
        action: p === 0 ? 'start' : 'advance',
        fromPosition: p,
        toPosition: p + 1,
        fromLabel: workflowNodeLabel(base.steps, p),
        toLabel: workflowNodeLabel(base.steps, p + 1),
      };
      await commit({
        ...base,
        status: 'active',
        position: p + 1,
        history: [...base.history, transition],
      });
      toast.success({ title: `Moved to ${transition.toLabel}` });
    } catch {
      toast.error({ title: 'Could not advance the workflow. Please retry.' });
    }
  };

  const reject = async (comment: string) => {
    const base = workflowState;
    if (!base || base.position < 1) return;
    try {
      const p = base.position;
      const rejectedStep = base.steps[p - 1];
      const transition: WorkflowTransition = {
        at: new Date().toISOString(),
        actor: actorInfo(),
        action: 'reject',
        fromPosition: p,
        toPosition: p - 1,
        fromLabel: workflowNodeLabel(base.steps, p),
        toLabel: workflowNodeLabel(base.steps, p - 1),
        comment,
      };
      await commit({
        ...base,
        position: p - 1,
        history: [...base.history, transition],
      });
      // Mirror the reject comment into the shared comments store so it also
      // surfaces in the page-wide messages drawer.
      await commentsUpdater.addComment(
        {
          kind: 'workflow',
          stepId: rejectedStep?.id ?? `pos-${p}`,
          event: 'reject',
        },
        comment,
        author
      );
      setRejectOpen(false);
      toast.success({ title: 'Sent back one step.' });
    } catch {
      toast.error({ title: 'Could not reject. Please retry.' });
    }
  };

  const publishAndReset = async () => {
    const base = ensureWorkflowState();
    await onPublish();
    if (!base) return;
    try {
      const transition: WorkflowTransition = {
        at: new Date().toISOString(),
        actor: actorInfo(),
        action: 'publish',
        fromPosition: base.position,
        toPosition: 0,
        fromLabel: workflowNodeLabel(base.steps, base.position),
        toLabel: 'Published',
      };
      await commit({
        ...base,
        status: 'active',
        position: 0,
        history: [...base.history, transition],
      });
    } catch {
      // `onPublish` already surfaced any publish error via toast.
    }
  };

  return {
    active,
    atFinish,
    /** Title of the step currently awaiting review, for the reject dialog. */
    currentStepLabel: position >= 1 ? steps[position - 1]?.title : undefined,
    /** True while a workflow transition is being written to CT. */
    committing,
    canAdvance,
    canPublish,
    canReject,
    nextLabel,
    stageLabel,
    name: workflowState?.workflowName ?? definition?.name,
    history: workflowState?.history ?? [],
    historyOpen,
    setHistoryOpen,
    rejectOpen,
    setRejectOpen,
    advance,
    reject,
    publishAndReset,
  };
};
