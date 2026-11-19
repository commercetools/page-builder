import type { PageTypeId } from '../page-builder/types';

/** A workflow step's assignee — a Merchant Center team (from the org directory). */
export type WorkflowAssignee = { teamId: string; teamName: string };

export type WorkflowStep = {
  id: string;
  title: string;
  assignee: WorkflowAssignee;
};

/**
 * A named approval workflow, bound to a page type. Start and Finish (= Publish)
 * are implicit bookends; `steps` are the intermediate review stages in order.
 * Persisted as custom object `page-editor/workflow-{id}`.
 */
export type WorkflowDefinition = {
  schemaVersion: 1;
  id: string;
  name: string;
  pageType: PageTypeId;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string };
};

export const WORKFLOW_SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Per-page runtime state (custom object `page-editor/wfstate-{pageId}`)
// ---------------------------------------------------------------------------

export type WorkflowActor = { id: string; name: string; email?: string };

export type WorkflowActionKind = 'start' | 'advance' | 'reject' | 'publish';

export type WorkflowTransition = {
  at: string;
  actor: WorkflowActor;
  action: WorkflowActionKind;
  fromPosition: number;
  toPosition: number;
  /** Denormalized node labels, so history renders stably even if the definition changes. */
  fromLabel: string;
  toLabel: string;
  /** Required when action === 'reject'. */
  comment?: string;
};

export type PageWorkflowState = {
  schemaVersion: 1;
  pageId: string;
  pageType: PageTypeId;
  workflowId: string;
  workflowName: string;
  status: 'active' | 'completed';
  /** 0 = Start/draft; k = k steps approved; N = all steps approved, ready to Publish. */
  position: number;
  /** Snapshot of the definition's steps at first entry, so a later edit to the definition can't corrupt an in-flight page. */
  steps: WorkflowStep[];
  history: WorkflowTransition[];
  startedAt: string;
  startedBy: WorkflowActor;
};

/**
 * Display label for a position in the ordered node chain:
 * 0 → "Start", 1..N → that step's title, > N → "Publish".
 */
export const workflowNodeLabel = (
  steps: WorkflowStep[],
  position: number
): string => {
  if (position <= 0) return 'Start';
  if (position <= steps.length)
    return steps[position - 1]?.title || `Step ${position}`;
  return 'Publish';
};
