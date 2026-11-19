import {
  appendComment,
  deleteCommentInPayload,
  editCommentInPayload,
  emptyPayload,
  findThreadByTarget,
  setThreadResolvedInPayload,
  uid,
} from './operations';
import type { CommentAuthor, CommentTarget } from './types';
import { COMMENTS_SCHEMA_VERSION } from './types';

const author: CommentAuthor = {
  id: 'u1',
  email: 'tess@example.test',
  name: 'Tess Tester',
};
const other: CommentAuthor = {
  id: 'u2',
  email: 'sam@example.test',
  name: 'Sam',
};

const element = (elementId = 'el-1'): CommentTarget => ({
  kind: 'element',
  elementId,
});

describe('uid', () => {
  it('uses the prefix it is given', () => {
    expect(uid('c')).toMatch(/^c-/);
  });

  it('never repeats, even within the same millisecond', () => {
    const ids = new Set(Array.from({ length: 500 }, () => uid('c')));
    expect(ids.size).toBe(500);
  });
});

describe('emptyPayload', () => {
  it('starts a page with no threads at the current schema version', () => {
    expect(emptyPayload('home')).toEqual({
      schemaVersion: COMMENTS_SCHEMA_VERSION,
      pageId: 'home',
      threads: [],
    });
  });
});

describe('appendComment', () => {
  it('opens a new thread for an unseen target', () => {
    const next = appendComment(
      emptyPayload('home'),
      element(),
      'first',
      author
    );
    expect(next.threads).toHaveLength(1);
    expect(next.threads[0].target).toEqual(element());
    expect(next.threads[0].comments).toHaveLength(1);
    expect(next.threads[0].comments[0]).toMatchObject({
      body: 'first',
      author,
      mentions: [],
    });
  });

  it('appends to the existing thread for a target already in play', () => {
    const one = appendComment(emptyPayload('home'), element(), 'first', author);
    const two = appendComment(one, element(), 'second', other);
    expect(two.threads).toHaveLength(1);
    expect(two.threads[0].comments.map((c) => c.body)).toEqual([
      'first',
      'second',
    ]);
  });

  it('keeps separate targets in separate threads', () => {
    const one = appendComment(emptyPayload('home'), element('a'), 'a', author);
    const two = appendComment(one, element('b'), 'b', author);
    expect(two.threads).toHaveLength(2);
  });

  it('denormalizes mentions out of the body at write time', () => {
    const next = appendComment(
      emptyPayload('home'),
      element(),
      'ping @sam@example.test please',
      author
    );
    expect(next.threads[0].comments[0].mentions).toContain('sam@example.test');
  });

  it('re-opens a resolved thread when someone comments again', () => {
    const one = appendComment(emptyPayload('home'), element(), 'first', author);
    const resolved = setThreadResolvedInPayload(one, one.threads[0].id, true);
    expect(resolved.threads[0].resolved).toBe(true);

    const reopened = appendComment(resolved, element(), 'actually…', other);
    expect(reopened.threads[0].resolved).toBe(false);
  });

  it('does not mutate the payload it is given', () => {
    const before = emptyPayload('home');
    const snapshot = JSON.parse(JSON.stringify(before));
    appendComment(before, element(), 'hi', author);
    expect(before).toEqual(snapshot);
  });
});

describe('findThreadByTarget', () => {
  it('finds a thread by its anchor', () => {
    const payload = appendComment(
      emptyPayload('home'),
      element('x'),
      'hi',
      author
    );
    expect(findThreadByTarget(payload, element('x'))?.comments[0].body).toBe(
      'hi'
    );
  });

  it('returns undefined when nothing anchors there', () => {
    expect(findThreadByTarget(emptyPayload('home'), element())).toBeUndefined();
  });
});

describe('editCommentInPayload', () => {
  const seed = () =>
    appendComment(emptyPayload('home'), element(), 'typo', author);

  it('rewrites the body and stamps editedAt', () => {
    const payload = seed();
    const { id: threadId, comments } = payload.threads[0];
    const next = editCommentInPayload(
      payload,
      threadId,
      comments[0].id,
      'fixed'
    );
    expect(next.threads[0].comments[0].body).toBe('fixed');
    expect(next.threads[0].comments[0].editedAt).toEqual(expect.any(String));
  });

  it('re-parses mentions from the new body', () => {
    const payload = seed();
    const { id: threadId, comments } = payload.threads[0];
    const next = editCommentInPayload(
      payload,
      threadId,
      comments[0].id,
      'now with @sam@example.test'
    );
    expect(next.threads[0].comments[0].mentions).toContain('sam@example.test');
  });

  it('leaves other threads and other comments untouched', () => {
    const one = appendComment(emptyPayload('home'), element('a'), 'a', author);
    const two = appendComment(one, element('b'), 'b', author);
    const target = two.threads[0];
    const next = editCommentInPayload(
      two,
      target.id,
      target.comments[0].id,
      'edited'
    );
    expect(next.threads[1].comments[0].body).toBe('b');
    expect(next.threads[1].updatedAt).toBe(two.threads[1].updatedAt);
  });

  it('is a no-op for an unknown thread or comment id', () => {
    const payload = seed();
    expect(editCommentInPayload(payload, 'nope', 'nope', 'x').threads).toEqual(
      payload.threads
    );
  });
});

describe('deleteCommentInPayload', () => {
  it('tombstones the comment rather than removing it, preserving reply order', () => {
    const one = appendComment(emptyPayload('home'), element(), 'root', author);
    const two = appendComment(one, element(), 'reply', other);
    const thread = two.threads[0];
    const next = deleteCommentInPayload(two, thread.id, thread.comments[0].id);

    expect(next.threads[0].comments).toHaveLength(2);
    expect(next.threads[0].comments[0]).toMatchObject({
      deleted: true,
      body: '',
      mentions: [],
    });
    expect(next.threads[0].comments[1].body).toBe('reply');
  });

  it('drops the whole thread once nothing survives', () => {
    const payload = appendComment(
      emptyPayload('home'),
      element(),
      'only',
      author
    );
    const thread = payload.threads[0];
    const next = deleteCommentInPayload(
      payload,
      thread.id,
      thread.comments[0].id
    );
    expect(next.threads).toHaveLength(0);
  });

  it('leaves other threads alone', () => {
    const one = appendComment(emptyPayload('home'), element('a'), 'a', author);
    const two = appendComment(one, element('b'), 'b', author);
    const next = deleteCommentInPayload(
      two,
      two.threads[0].id,
      two.threads[0].comments[0].id
    );
    expect(next.threads).toHaveLength(1);
    expect(next.threads[0].comments[0].body).toBe('b');
  });
});

describe('setThreadResolvedInPayload', () => {
  it('resolves and unresolves the named thread', () => {
    const payload = appendComment(
      emptyPayload('home'),
      element(),
      'hi',
      author
    );
    const id = payload.threads[0].id;
    expect(
      setThreadResolvedInPayload(payload, id, true).threads[0].resolved
    ).toBe(true);
    expect(
      setThreadResolvedInPayload(payload, id, false).threads[0].resolved
    ).toBe(false);
  });

  it('bumps updatedAt so the thread sorts as freshly touched', () => {
    const payload = appendComment(
      emptyPayload('home'),
      element(),
      'hi',
      author
    );
    const next = setThreadResolvedInPayload(
      payload,
      payload.threads[0].id,
      true
    );
    expect(Date.parse(next.threads[0].updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(payload.threads[0].updatedAt)
    );
  });

  it('is a no-op for an unknown thread', () => {
    const payload = appendComment(
      emptyPayload('home'),
      element(),
      'hi',
      author
    );
    expect(setThreadResolvedInPayload(payload, 'nope', true).threads).toEqual(
      payload.threads
    );
  });
});
