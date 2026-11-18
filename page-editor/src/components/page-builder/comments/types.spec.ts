import { COMMENTS_SCHEMA_VERSION, isSameTarget } from './types';
import type { CommentTarget } from './types';

const element = (elementId: string): CommentTarget => ({
  kind: 'element',
  elementId,
});
const page = (): CommentTarget => ({ kind: 'page' });
const workflow = (
  stepId: string,
  event?: 'reject' | 'advance' | 'comment'
): CommentTarget => ({ kind: 'workflow', stepId, event });

describe('isSameTarget', () => {
  it('never matches across kinds', () => {
    expect(isSameTarget(element('a'), page())).toBe(false);
    expect(isSameTarget(page(), workflow('s1'))).toBe(false);
    expect(isSameTarget(element('a'), workflow('a'))).toBe(false);
  });

  it('matches elements by id', () => {
    expect(isSameTarget(element('a'), element('a'))).toBe(true);
    expect(isSameTarget(element('a'), element('b'))).toBe(false);
  });

  it('treats the page as a single anchor', () => {
    expect(isSameTarget(page(), page())).toBe(true);
  });

  it('matches workflow targets on stepId alone, ignoring the event', () => {
    // Reject and advance comments on the same step share one conversation.
    expect(
      isSameTarget(workflow('s1', 'reject'), workflow('s1', 'advance'))
    ).toBe(true);
    expect(isSameTarget(workflow('s1'), workflow('s2'))).toBe(false);
  });

  it('is symmetric', () => {
    const pairs: Array<[CommentTarget, CommentTarget]> = [
      [element('a'), element('a')],
      [element('a'), element('b')],
      [workflow('s1'), workflow('s1')],
      [page(), element('a')],
    ];
    for (const [a, b] of pairs) {
      expect(isSameTarget(a, b)).toBe(isSameTarget(b, a));
    }
  });
});

describe('COMMENTS_SCHEMA_VERSION', () => {
  it('is a positive integer the connector can compare against', () => {
    expect(Number.isInteger(COMMENTS_SCHEMA_VERSION)).toBe(true);
    expect(COMMENTS_SCHEMA_VERSION).toBeGreaterThan(0);
  });
});
