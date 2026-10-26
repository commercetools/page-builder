import { usePageComments } from './use-page-comments';
import type { Page } from './types';
import type { ElementSelection } from './use-element-selection';
import { act, renderHookWithProviders, waitFor } from '../../test-utils/render';
import { installMockServer } from '../../test-utils/msw';
import {
  buildComponentElement,
  buildLayoutElement,
  localized,
} from '../../test-utils/factories';

const store = installMockServer();
const CONTAINER = 'page-editor';

const page = (): Page => ({
  MAIN: [
    buildLayoutElement({
      id: 'layout-1',
      name: localized('Hero row'),
      children: [
        buildComponentElement({ id: 'c1', name: localized('Banner') }),
      ],
    }),
  ],
});

const fakeSelection = () =>
  ({
    layoutId: null,
    compId: null,
    elementId: null,
    scrollOnSelect: { current: false },
    selectLayout: jest.fn(),
    selectComp: jest.fn(),
  } as unknown as ElementSelection);

const comment = (over: Record<string, unknown> = {}) => ({
  id: 'c-1',
  author: { id: 'them', email: 'them@example.test', name: 'Them' },
  body: 'hello',
  mentions: [],
  createdAt: '2026-02-01T10:00:00.000Z',
  ...over,
});

const thread = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  target: { kind: 'element', elementId: 'c1' },
  comments: [comment()],
  resolved: false,
  createdAt: '2026-02-01T10:00:00.000Z',
  updatedAt: '2026-02-01T10:00:00.000Z',
  ...over,
});

const seedThreads = (threads: unknown[]) =>
  store.seed({
    container: CONTAINER,
    key: 'comments-home',
    value: { schemaVersion: 1, pageId: 'home', threads },
  });

const setup = () => {
  const selection = fakeSelection();
  const highlightInPreview = jest.fn();
  const rendered = renderHookWithProviders(() =>
    usePageComments({
      pageId: 'home',
      page: page(),
      selection,
      highlightInPreview,
    })
  );
  return { selection, highlightInPreview, ...rendered };
};

beforeEach(() => window.localStorage.clear());

describe('usePageComments roster', () => {
  it('starts with no threads', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.threads).toEqual([]));
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.counts).toEqual({});
  });

  it('reports the stored threads', async () => {
    seedThreads([thread()]);
    const { result } = setup();
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
  });

  it('counts live comments per element for the canvas badges', async () => {
    seedThreads([thread({ comments: [comment(), comment({ id: 'c-2' })] })]);
    const { result } = setup();
    await waitFor(() => expect(result.current.counts).toEqual({ c1: 2 }));
  });

  it('excludes deleted comments from the badge count', async () => {
    seedThreads([
      thread({ comments: [comment(), comment({ id: 'c-2', deleted: true })] }),
    ]);
    const { result } = setup();
    await waitFor(() => expect(result.current.counts).toEqual({ c1: 1 }));
  });

  it('drops an element from the counts once every comment is deleted', async () => {
    seedThreads([thread({ comments: [comment({ deleted: true })] })]);
    const { result } = setup();
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(result.current.counts).toEqual({});
  });

  it('ignores non-element threads in the per-element counts', async () => {
    seedThreads([thread({ id: 't2', target: { kind: 'page' } })]);
    const { result } = setup();
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(result.current.counts).toEqual({});
  });

  it('badges a mention from someone else', async () => {
    seedThreads([
      thread({ comments: [comment({ mentions: ['tester@example.test'] })] }),
    ]);
    const { result } = setup();
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
  });

  it('clears the badge once the reader marks the drawer seen', async () => {
    seedThreads([
      thread({ comments: [comment({ mentions: ['tester@example.test'] })] }),
    ]);
    const { result } = setup();
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    act(() => result.current.markSeen());
    await waitFor(() => expect(result.current.unreadCount).toBe(0));
  });
});

describe('usePageComments surfaces', () => {
  it('opens and closes the messages drawer', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.threads).toEqual([]));

    expect(result.current.messagesOpen).toBe(false);
    act(() => result.current.setMessagesOpen(true));
    expect(result.current.messagesOpen).toBe(true);
  });

  it('opens a per-element thread', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.threads).toEqual([]));

    act(() => result.current.setTarget({ kind: 'element', elementId: 'c1' }));
    expect(result.current.target).toEqual({ kind: 'element', elementId: 'c1' });
  });

  it('titles an element dialog with the element name', async () => {
    const { result } = setup();
    act(() => result.current.setTarget({ kind: 'element', elementId: 'c1' }));
    expect(result.current.dialogTitle).toBe('Banner · Comments');
  });

  it('titles a layout dialog with the layout name', async () => {
    const { result } = setup();
    act(() =>
      result.current.setTarget({ kind: 'element', elementId: 'layout-1' })
    );
    expect(result.current.dialogTitle).toBe('Hero row · Comments');
  });

  it('falls back to a generic element title for an unknown id', async () => {
    const { result } = setup();
    act(() =>
      result.current.setTarget({ kind: 'element', elementId: 'ghost' })
    );
    expect(result.current.dialogTitle).toBe('Element · Comments');
  });

  it('titles the page-wide thread', async () => {
    const { result } = setup();
    act(() => result.current.setTarget({ kind: 'page' }));
    expect(result.current.dialogTitle).toBe('Page comments');
  });

  it('uses a plain title when nothing is targeted', () => {
    const { result } = setup();
    expect(result.current.dialogTitle).toBe('Comments');
  });
});

describe('usePageComments element labels', () => {
  it('resolves a component id to its name', () => {
    const { result } = setup();
    expect(result.current.resolveElementLabel('c1')).toBe('Banner');
  });

  it('resolves a layout id to its name', () => {
    const { result } = setup();
    expect(result.current.resolveElementLabel('layout-1')).toBe('Hero row');
  });

  it('reports nothing for an id that is not on the page', () => {
    const { result } = setup();
    expect(result.current.resolveElementLabel('ghost')).toBeNull();
  });
});

describe('usePageComments navigation', () => {
  it('selects the component and reveals it in the preview', async () => {
    const { result, selection, highlightInPreview } = setup();
    act(() => result.current.setMessagesOpen(true));

    act(() => result.current.navigateToElement('c1'));

    expect(selection.selectComp).toHaveBeenCalledWith('layout-1', 'c1');
    expect(highlightInPreview).toHaveBeenCalledWith('c1');
    // Navigating away closes the drawer that sent you there.
    expect(result.current.messagesOpen).toBe(false);
  });

  it('selects a layout when the thread anchors to one', () => {
    const { result, selection } = setup();
    act(() => result.current.navigateToElement('layout-1'));
    expect(selection.selectLayout).toHaveBeenCalledWith('layout-1');
  });

  it('does nothing for an element that is no longer on the page', () => {
    const { result, selection, highlightInPreview } = setup();
    act(() => result.current.navigateToElement('ghost'));

    expect(selection.selectComp).not.toHaveBeenCalled();
    expect(selection.selectLayout).not.toHaveBeenCalled();
    expect(highlightInPreview).not.toHaveBeenCalled();
  });
});
