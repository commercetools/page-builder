import {
  useCommentsFetcher,
  useCommentsUpdater,
} from './use-comments-connector';
import type {
  CommentAuthor,
  CommentsPayload,
  CommentTarget,
} from '../../components/page-builder/comments/types';
import { renderHookWithProviders, act, waitFor } from '../../test-utils/render';
import { installMockServer, failOperation } from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';

const store = installMockServer();

const CONTAINER = 'page-editor';
const keyFor = (pageId: string) => `comments-${pageId}`;

const author: CommentAuthor = {
  id: 'u1',
  email: 'tess@example.test',
  name: 'Tess Tester',
};
const target: CommentTarget = { kind: 'element', elementId: 'el-1' };

const stored = (pageId = 'home') =>
  store.get(CONTAINER, keyFor(pageId))?.value as CommentsPayload | undefined;

const updater = (pageId = 'home') =>
  renderHookWithProviders(() => useCommentsUpdater(pageId)).result;

describe('useCommentsFetcher', () => {
  it('reports no threads for a page nobody has commented on', async () => {
    const { result } = renderHookWithProviders(() =>
      useCommentsFetcher('home')
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.threads).toEqual([]);
    expect(result.current.ctVersion).toBeNull();
  });

  it('returns a stable empty array, so consumers do not re-render forever', async () => {
    const { result, rerender } = renderHookWithProviders(() =>
      useCommentsFetcher('home')
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    const first = result.current.threads;
    rerender();
    expect(result.current.threads).toBe(first);
  });

  it('reads the stored threads and CT version', async () => {
    store.seed({
      container: CONTAINER,
      key: keyFor('home'),
      value: {
        schemaVersion: 1,
        pageId: 'home',
        threads: [
          {
            id: 't1',
            target,
            comments: [],
            resolved: false,
            createdAt: '2026-01-15T10:00:00.000Z',
            updatedAt: '2026-01-15T10:00:00.000Z',
          },
        ],
      },
    });

    const { result } = renderHookWithProviders(() =>
      useCommentsFetcher('home')
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(result.current.ctVersion).toBe(1);
  });

  it('surfaces a query error', async () => {
    server.use(failOperation('FetchComments', 'nope'));

    const { result } = renderHookWithProviders(() =>
      useCommentsFetcher('home')
    );
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.threads).toEqual([]);
  });
});

describe('useCommentsUpdater', () => {
  it('creates the comments object on the first comment', async () => {
    const result = updater();
    await act(async () => {
      await result.current.addComment(target, 'first note', author);
    });

    const payload = stored()!;
    expect(payload.pageId).toBe('home');
    expect(payload.threads).toHaveLength(1);
    expect(payload.threads[0].comments[0].body).toBe('first note');
  });

  it('appends to the existing thread for the same anchor', async () => {
    const result = updater();
    await act(async () => {
      await result.current.addComment(target, 'first', author);
    });
    await act(async () => {
      await result.current.addComment(target, 'second', author);
    });

    expect(stored()!.threads).toHaveLength(1);
    expect(stored()!.threads[0].comments.map((c) => c.body)).toEqual([
      'first',
      'second',
    ]);
  });

  it('keeps different anchors in different threads', async () => {
    const result = updater();
    await act(async () => {
      await result.current.addComment(target, 'on element', author);
    });
    await act(async () => {
      await result.current.addComment({ kind: 'page' }, 'on page', author);
    });

    expect(stored()!.threads).toHaveLength(2);
  });

  it('edits a comment in place', async () => {
    const result = updater();
    await act(async () => {
      await result.current.addComment(target, 'typo', author);
    });
    const { id: threadId, comments } = stored()!.threads[0];

    await act(async () => {
      await result.current.editComment(threadId, comments[0].id, 'fixed');
    });

    expect(stored()!.threads[0].comments[0].body).toBe('fixed');
    expect(stored()!.threads[0].comments[0].editedAt).toEqual(
      expect.any(String)
    );
  });

  it('tombstones a deleted comment and drops an emptied thread', async () => {
    const result = updater();
    await act(async () => {
      await result.current.addComment(target, 'only', author);
    });
    const { id: threadId, comments } = stored()!.threads[0];

    await act(async () => {
      await result.current.deleteComment(threadId, comments[0].id);
    });

    expect(stored()!.threads).toHaveLength(0);
  });

  it('resolves and re-opens a thread', async () => {
    const result = updater();
    await act(async () => {
      await result.current.addComment(target, 'please fix', author);
    });
    const threadId = stored()!.threads[0].id;

    await act(async () => {
      await result.current.resolveThread(threadId, true);
    });
    expect(stored()!.threads[0].resolved).toBe(true);

    await act(async () => {
      await result.current.resolveThread(threadId, false);
    });
    expect(stored()!.threads[0].resolved).toBe(false);
  });

  it('merges a concurrent commenter instead of clobbering them', async () => {
    const result = updater();
    await act(async () => {
      await result.current.addComment(target, 'mine', author);
    });

    // Someone else writes a thread of their own, bumping the CT version.
    const current = store.get(CONTAINER, keyFor('home'))!;
    store.upsert(
      CONTAINER,
      keyFor('home'),
      {
        ...(current.value as CommentsPayload),
        threads: [
          ...(current.value as CommentsPayload).threads,
          {
            id: 'theirs',
            target: { kind: 'page' },
            comments: [
              {
                id: 'c-theirs',
                author: { id: 'u2', email: 's@e.test', name: 'Sam' },
                body: 'theirs',
                mentions: [],
                createdAt: '2026-01-15T11:00:00.000Z',
              },
            ],
            resolved: false,
            createdAt: '2026-01-15T11:00:00.000Z',
            updatedAt: '2026-01-15T11:00:00.000Z',
          },
        ],
      },
      current.version
    );

    await act(async () => {
      await result.current.addComment(target, 'mine again', author);
    });

    const threads = stored()!.threads;
    // Both survive: the read-modify-write re-read before patching.
    expect(threads.find((t) => t.id === 'theirs')).toBeDefined();
    expect(
      threads
        .find((t) => t.target.kind === 'element')!
        .comments.map((c) => c.body)
    ).toEqual(['mine', 'mine again']);
  });

  it('gives up with an error after exhausting its retries', async () => {
    server.use(failOperation('UpsertComments', 'always fails', 'mutation'));

    const result = updater();
    await act(async () => {
      await expect(
        result.current.addComment(target, 'never lands', author)
      ).rejects.toBeDefined();
    });
  });
});
