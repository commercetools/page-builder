import { WORKFLOW_SCHEMA_VERSION, workflowNodeLabel } from './types';
import type { WorkflowStep } from './types';

const step = (id: string, title: string): WorkflowStep => ({
  id,
  title,
  assignee: { teamId: `team-${id}`, teamName: `Team ${id}` },
});

const steps = [step('a', 'Legal review'), step('b', 'Brand review')];

describe('workflowNodeLabel', () => {
  it('labels position 0 as Start', () => {
    expect(workflowNodeLabel(steps, 0)).toBe('Start');
  });

  it('labels a negative position as Start too', () => {
    expect(workflowNodeLabel(steps, -1)).toBe('Start');
  });

  it('labels each intermediate position with its step title', () => {
    expect(workflowNodeLabel(steps, 1)).toBe('Legal review');
    expect(workflowNodeLabel(steps, 2)).toBe('Brand review');
  });

  it('labels the position past the last step as Publish', () => {
    expect(workflowNodeLabel(steps, 3)).toBe('Publish');
    expect(workflowNodeLabel(steps, 99)).toBe('Publish');
  });

  it('falls back to a numbered label for a step with no title', () => {
    expect(workflowNodeLabel([step('a', '')], 1)).toBe('Step 1');
  });

  it('treats a workflow with no steps as Start then Publish', () => {
    expect(workflowNodeLabel([], 0)).toBe('Start');
    expect(workflowNodeLabel([], 1)).toBe('Publish');
  });
});

describe('WORKFLOW_SCHEMA_VERSION', () => {
  it('is version 1', () => {
    expect(WORKFLOW_SCHEMA_VERSION).toBe(1);
  });
});
