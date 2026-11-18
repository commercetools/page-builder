import { computeUnread, useCommentsLastSeen } from './use-unread';
import type { CommentThread } from './types';
import { act, renderHookWithProviders } from '../../../test-utils/render';

const ME = { id: 'me', email: 'me@example.test' };
const THEM = { id: 'them', email: 'them@example.test', name: 'Them' };

const comment = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  author: THEM,
  body: 'hello',
  mentions: [ME.email],
  createdAt: '2026-02-01T10:00:00.000Z',
  ...over,
});

const thread = (comments: unknown[]): CommentThread =>
  ({
    id: 't1',
    target: { kind: 'element', elementId: 'el-1' },
    comments,
    resolved: false,
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
  } as CommentThread);

const unread = (comments: unknown[], lastSeen = '') =>
  computeUnread([thread(comments)], lastSeen, ME.email, ME.id);

describe('computeUnread', () => {
  it('counts a mention from someone else', () => {
    expect(unread([comment()])).toBe(1);
  });

  it('ignores a comment that does not mention me', () => {
    expect(unread([comment({ mentions: [] })])).toBe(0);
  });

  it('ignores my own comment, even if it mentions me', () => {
    expect(unread([comment({ author: { ...ME, name: 'Me' } })])).toBe(0);
  });

  it('ignores a deleted comment', () => {
    expect(unread([comment({ deleted: true })])).toBe(0);
  });

  it('ignores anything from before I last looked', () => {
    expect(unread([comment()], '2026-03-01T00:00:00.000Z')).toBe(0);
  });

  it('ignores a comment made at exactly the last-seen moment', () => {
    expect(unread([comment()], '2026-02-01T10:00:00.000Z')).toBe(0);
  });

  it('counts anything since I last looked', () => {
    expect(unread([comment()], '2026-01-01T00:00:00.000Z')).toBe(1);
  });

  it('counts across several threads', () => {
    expect(
      computeUnread(
        [thread([comment()]), thread([comment({ id: 'c2' })])],
        '',
        ME.email,
        ME.id
      )
    ).toBe(2);
  });

  it('matches a mention case-insensitively on my email', () => {
    expect(
      computeUnread(
        [thread([comment({ mentions: ['me@example.test'] })])],
        '',
        'ME@EXAMPLE.TEST',
        ME.id
      )
    ).toBe(1);
  });

  it('counts nothing when the user has no email to be mentioned by', () => {
    expect(computeUnread([thread([comment()])], '', '', ME.id)).toBe(0);
  });

  it('counts nothing for an empty roster', () => {
    expect(computeUnread([], '', ME.email, ME.id)).toBe(0);
  });
});

describe('useCommentsLastSeen', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts with nothing seen', () => {
    const { result } = renderHookWithProviders(() =>
      useCommentsLastSeen('home')
    );
    expect(result.current.lastSeen).toBe('');
  });

  it('records the moment the reader looked', () => {
    const { result } = renderHookWithProviders(() =>
      useCommentsLastSeen('home')
    );
    act(() => result.current.markSeen());
    expect(result.current.lastSeen).toEqual(expect.any(String));
    expect(Date.parse(result.current.lastSeen)).not.toBeNaN();
  });

  it('persists per browser, so the badge survives a reload', () => {
    const first = renderHookWithProviders(() => useCommentsLastSeen('home'));
    act(() => first.result.current.markSeen());
    const stamped = first.result.current.lastSeen;
    first.unmount();

    const second = renderHookWithProviders(() => useCommentsLastSeen('home'));
    expect(second.result.current.lastSeen).toBe(stamped);
  });

  it('tracks each page separately', () => {
    const home = renderHookWithProviders(() => useCommentsLastSeen('home'));
    act(() => home.result.current.markSeen());
    home.unmount();

    const about = renderHookWithProviders(() => useCommentsLastSeen('about'));
    expect(about.result.current.lastSeen).toBe('');
  });

  it('degrades quietly when storage is unavailable', () => {
    const getItem = jest
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });
    const setItem = jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota');
      });

    const { result } = renderHookWithProviders(() =>
      useCommentsLastSeen('home')
    );
    expect(result.current.lastSeen).toBe('');
    expect(() => act(() => result.current.markSeen())).not.toThrow();

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
