/**
 * Comment domain model. All threads for a page live in a single custom object
 * `page-editor/comments-{pageId}` (see use-comments-connector). A thread anchors
 * to a target: an element/layout node id, the page itself, or a workflow step
 * (so workflow reject/step comments share this store and surface in the drawer).
 */

export type CommentTarget =
  | { kind: 'element'; elementId: string }
  | { kind: 'page' }
  | {
      kind: 'workflow';
      stepId: string;
      event?: 'reject' | 'advance' | 'comment';
    };

export type CommentAuthor = {
  id: string;
  email: string;
  /** Display name (first+last, falling back to email). */
  name: string;
  firstName?: string;
  lastName?: string;
};

export type Comment = {
  /** Stable creation-time uid, independent of array index. */
  id: string;
  author: CommentAuthor;
  /** Raw text, the source of truth; may contain `@email` mention tokens. */
  body: string;
  /** Denormalized lowercased mention emails, parsed at write time. */
  mentions: string[];
  createdAt: string;
  editedAt?: string;
  /** Soft tombstone: preserves reply ordering when a comment is deleted. */
  deleted?: boolean;
};

export type CommentThread = {
  id: string;
  target: CommentTarget;
  /** Ordered ascending by createdAt; [0] is the root, the rest are replies. */
  comments: Comment[];
  resolved: boolean;
  createdAt: string;
  /** Bumped on any add/edit; used for thread sort + freshness. */
  updatedAt: string;
};

export type CommentsPayload = {
  schemaVersion: number;
  pageId: string;
  threads: CommentThread[];
};

export const COMMENTS_SCHEMA_VERSION = 1;

/** Two targets are the same conversation anchor. Workflow threads key on stepId. */
export const isSameTarget = (a: CommentTarget, b: CommentTarget): boolean => {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'element' && b.kind === 'element')
    return a.elementId === b.elementId;
  if (a.kind === 'workflow' && b.kind === 'workflow')
    return a.stepId === b.stepId;
  return true; // page
};
