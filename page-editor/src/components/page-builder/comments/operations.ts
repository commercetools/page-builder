/**
 * Pure, immutable operations on a CommentsPayload. Kept separate from the
 * connector so they're trivially testable and reusable, and so every mutation
 * is an id-scoped patch (never a blind overwrite) — which lets the connector's
 * read-modify-write retry merge concurrent commenters cleanly.
 */
import type {
  Comment,
  CommentAuthor,
  CommentsPayload,
  CommentTarget,
  CommentThread,
} from './types';
import { COMMENTS_SCHEMA_VERSION, isSameTarget } from './types';
import { parseMentions } from './mention';

let seq = 0;
/** Creation-time unique id, independent of array position. */
export const uid = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}-${Math.floor(
    Math.random() * 1e6
  ).toString(36)}`;

export const emptyPayload = (pageId: string): CommentsPayload => ({
  schemaVersion: COMMENTS_SCHEMA_VERSION,
  pageId,
  threads: [],
});

export const findThreadByTarget = (
  payload: CommentsPayload,
  target: CommentTarget
): CommentThread | undefined =>
  payload.threads.find((t) => isSameTarget(t.target, target));

/** Find-or-create the thread for `target` and append a new comment. */
export const appendComment = (
  payload: CommentsPayload,
  target: CommentTarget,
  body: string,
  author: CommentAuthor
): CommentsPayload => {
  const now = new Date().toISOString();
  const comment: Comment = {
    id: uid('c'),
    author,
    body,
    mentions: parseMentions(body),
    createdAt: now,
  };
  const existing = findThreadByTarget(payload, target);
  if (existing) {
    return {
      ...payload,
      threads: payload.threads.map((t) =>
        t.id === existing.id
          ? {
              ...t,
              comments: [...t.comments, comment],
              updatedAt: now,
              resolved: false, // new activity re-opens a resolved thread
            }
          : t
      ),
    };
  }
  const thread: CommentThread = {
    id: uid('t'),
    target,
    comments: [comment],
    resolved: false,
    createdAt: now,
    updatedAt: now,
  };
  return { ...payload, threads: [...payload.threads, thread] };
};

export const editCommentInPayload = (
  payload: CommentsPayload,
  threadId: string,
  commentId: string,
  body: string
): CommentsPayload => {
  const now = new Date().toISOString();
  return {
    ...payload,
    threads: payload.threads.map((t) =>
      t.id !== threadId
        ? t
        : {
            ...t,
            updatedAt: now,
            comments: t.comments.map((c) =>
              c.id !== commentId
                ? c
                : { ...c, body, mentions: parseMentions(body), editedAt: now }
            ),
          }
    ),
  };
};

/** Soft-delete a comment; drop the thread entirely if nothing survives. */
export const deleteCommentInPayload = (
  payload: CommentsPayload,
  threadId: string,
  commentId: string
): CommentsPayload => {
  const now = new Date().toISOString();
  return {
    ...payload,
    threads: payload.threads
      .map((t) =>
        t.id !== threadId
          ? t
          : {
              ...t,
              updatedAt: now,
              comments: t.comments.map((c) =>
                c.id !== commentId
                  ? c
                  : { ...c, deleted: true, body: '', mentions: [] }
              ),
            }
      )
      .filter((t) => t.comments.some((c) => !c.deleted)),
  };
};

export const setThreadResolvedInPayload = (
  payload: CommentsPayload,
  threadId: string,
  resolved: boolean
): CommentsPayload => ({
  ...payload,
  threads: payload.threads.map((t) =>
    t.id === threadId
      ? { ...t, resolved, updatedAt: new Date().toISOString() }
      : t
  ),
});
