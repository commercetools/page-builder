import { MessagesDrawer } from './messages-drawer';
import type { CommentAuthor, CommentThread } from './types';
import type { CommentsUpdater } from '../../../hooks/use-comments-connector';
import { useOrgDirectory } from '../../../hooks/use-org-directory';
import { renderWithProviders, screen } from '../../../test-utils/render';
import { buildOrgDirectory } from '../../../test-utils/factories';

// Thread cards embed a composer, which reaches for the org directory for
// @-mention autocomplete. The directory has its own spec.
jest.mock('../../../hooks/use-org-directory', () => ({
  ...jest.requireActual('../../../hooks/use-org-directory'),
  useOrgDirectory: jest.fn(),
}));

beforeEach(() => {
  (
    useOrgDirectory as jest.MockedFunction<typeof useOrgDirectory>
  ).mockReturnValue(buildOrgDirectory());
});

const AUTHOR: CommentAuthor = {
  id: 'me',
  email: 'me@example.test',
  name: 'Me',
};

const comment = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  author: { id: 'them', email: 'them@example.test', name: 'Them' },
  body: 'hello',
  mentions: [],
  createdAt: '2026-02-01T10:00:00.000Z',
  ...over,
});

const thread = (over: Partial<CommentThread> = {}): CommentThread =>
  ({
    id: 't1',
    target: { kind: 'element', elementId: 'c1' },
    comments: [comment()],
    resolved: false,
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    ...over,
  } as CommentThread);

const fakeUpdater = () =>
  ({
    loading: false,
    addComment: jest.fn(async () => undefined),
    editComment: jest.fn(async () => undefined),
    deleteComment: jest.fn(async () => undefined),
    resolveThread: jest.fn(async () => undefined),
  } as unknown as CommentsUpdater);

const setup = (over: Partial<Parameters<typeof MessagesDrawer>[0]> = {}) => {
  const onClose = jest.fn();
  const onNavigateToElement = jest.fn();
  const updater = over.updater ?? fakeUpdater();
  const rendered = renderWithProviders(
    <MessagesDrawer
      isOpen
      onClose={onClose}
      threads={[]}
      author={AUTHOR}
      updater={updater}
      resolveElementLabel={(id) => (id === 'c1' ? 'Banner' : null)}
      onNavigateToElement={onNavigateToElement}
      {...over}
    />
  );
  return { onClose, onNavigateToElement, updater, ...rendered };
};

describe('MessagesDrawer', () => {
  it('says so when there are no messages', async () => {
    setup();
    expect(await screen.findByText(/No messages yet/)).toBeInTheDocument();
  });

  it('renders nothing while closed', async () => {
    setup({ isOpen: false, threads: [thread()] });
    expect(screen.queryByText('Banner')).not.toBeInTheDocument();
  });

  it('groups element threads under component comments', async () => {
    setup({ threads: [thread()] });
    expect(await screen.findByText('Component comments')).toBeInTheDocument();
    expect(screen.getByText('Banner')).toBeInTheDocument();
  });

  it('groups page threads separately', async () => {
    setup({ threads: [thread({ id: 't2', target: { kind: 'page' } })] });
    expect(await screen.findByText('Page comments')).toBeInTheDocument();
    expect(screen.getByText('Page')).toBeInTheDocument();
  });

  it('groups workflow threads separately', async () => {
    setup({
      threads: [
        thread({ id: 't3', target: { kind: 'workflow', stepId: 's1' } }),
      ],
    });
    expect(await screen.findByText('Workflow comments')).toBeInTheDocument();
    expect(screen.getByText('Workflow step')).toBeInTheDocument();
  });

  it('separates threads whose element has been deleted', async () => {
    setup({
      threads: [
        thread({ id: 't4', target: { kind: 'element', elementId: 'gone' } }),
      ],
    });
    expect(
      await screen.findByText('Orphaned (deleted elements)')
    ).toBeInTheDocument();
    expect(screen.getByText('Deleted element')).toBeInTheDocument();
  });

  it('marks a resolved thread', async () => {
    setup({ threads: [thread({ resolved: true })] });
    expect(await screen.findByText('Resolved')).toBeInTheDocument();
  });

  it('collects mentions of the reader into their own section', async () => {
    setup({
      threads: [
        thread({ comments: [comment({ mentions: ['me@example.test'] })] }),
      ],
    });
    expect(await screen.findByText('Mentions of you (1)')).toBeInTheDocument();
  });

  it('ignores a mention of someone else', async () => {
    setup({
      threads: [
        thread({ comments: [comment({ mentions: ['other@example.test'] })] }),
      ],
    });
    await screen.findByText('Component comments');
    expect(screen.queryByText(/Mentions of you/)).not.toBeInTheDocument();
  });

  it('ignores a mention inside a deleted comment', async () => {
    setup({
      threads: [
        thread({
          comments: [comment({ mentions: ['me@example.test'], deleted: true })],
        }),
      ],
    });
    await screen.findByText('Component comments');
    expect(screen.queryByText(/Mentions of you/)).not.toBeInTheDocument();
  });

  it('navigates to the element a thread anchors to', async () => {
    const { user, onNavigateToElement } = setup({ threads: [thread()] });
    await screen.findByText('Banner');

    await user.click(
      screen.getAllByRole('button', { name: 'Go to element' })[0]
    );
    expect(onNavigateToElement).toHaveBeenCalledWith('c1');
  });

  it('offers no navigation for a page thread', async () => {
    setup({ threads: [thread({ id: 't2', target: { kind: 'page' } })] });
    await screen.findByText('Page comments');
    expect(
      screen.queryByRole('button', { name: 'Go to element' })
    ).not.toBeInTheDocument();
  });

  it('resolves an open thread', async () => {
    const updater = fakeUpdater();
    const { user } = setup({ threads: [thread()], updater });
    await screen.findByText('Banner');

    await user.click(screen.getByRole('button', { name: 'Resolve thread' }));
    expect(updater.resolveThread).toHaveBeenCalledWith('t1', true);
  });

  it('reopens a resolved thread', async () => {
    const updater = fakeUpdater();
    const { user } = setup({ threads: [thread({ resolved: true })], updater });
    await screen.findByText('Banner');

    await user.click(screen.getByRole('button', { name: 'Reopen thread' }));
    expect(updater.resolveThread).toHaveBeenCalledWith('t1', false);
  });
});
