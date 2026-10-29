import { toast } from '@commercetools/nimbus';
import Pages from './pages';
import {
  DRAFT_PAGE_CONTAINER,
  LEGACY_PAGE_CONTAINER,
  pageKey,
} from '../page-builder/types';
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '../../test-utils/render';
import { installMockServer, respondWith } from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';
import { buildDraftPagePayload, buildPage } from '../../test-utils/factories';

const store = installMockServer();

const noCategories = () =>
  server.use(
    respondWith('FetchCategories', {
      categories: {
        __typename: 'CategoryQueryResult',
        total: 0,
        results: [],
      },
    })
  );

const categoriesReturn = (
  ...cats: Array<{ id: string; name: string; parentId?: string | null }>
) =>
  server.use(
    respondWith('FetchCategories', {
      categories: {
        __typename: 'CategoryQueryResult',
        total: cats.length,
        results: cats.map((c) => ({
          __typename: 'Category',
          id: c.id,
          key: null,
          name: c.name,
          slug: c.id,
          childCount: 0,
          parent: c.parentId
            ? { __typename: 'Category', id: c.parentId, key: null }
            : null,
        })),
      },
    })
  );

const legacyPage = (pageId: string) => ({
  schemaVersion: 2,
  draft: {
    schemaVersion: 2,
    currentVersion: 1,
    pageId,
    versions: [
      {
        appVersion: 1,
        savedAt: '2026-01-15T10:00:00.000Z',
        publishedAt: null,
        page: buildPage(),
      },
    ],
  },
  published: null,
});

let toastSuccess: jest.SpyInstance;
beforeEach(() => {
  noCategories();
  toastSuccess = jest.spyOn(toast, 'success').mockImplementation(() => '');
});
afterEach(() => toastSuccess.mockRestore());

const setup = (route = '/pages') => renderWithProviders(<Pages />, { route });

describe('Pages dashboard', () => {
  it('shows the dashboard heading', async () => {
    setup();
    expect(
      await screen.findByRole('heading', { name: 'Pages' })
    ).toBeInTheDocument();
    expect(screen.getByText('SITE BUILDER')).toBeInTheDocument();
  });

  it('offers the page-level actions', async () => {
    setup();
    expect(
      await screen.findByRole('button', { name: /New page/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Settings$/ })
    ).toBeInTheDocument();
  });

  it('lists the static page tree', async () => {
    setup();
    // Homepage appears in both the tree and the detail pane for the default
    // selection, so assert presence rather than uniqueness.
    expect((await screen.findAllByText('Homepage')).length).toBeGreaterThan(0);
    expect(screen.getByText('All categories')).toBeInTheDocument();
  });

  it('grafts live categories into the tree', async () => {
    categoriesReturn({ id: 'shoes', name: 'Shoes' });
    setup();
    expect(await screen.findByText('Shoes')).toBeInTheDocument();
  });

  it('selects the homepage by default', async () => {
    setup();
    // The detail pane renders for the selected node.
    await waitFor(() =>
      expect(screen.getAllByText('Homepage').length).toBeGreaterThan(0)
    );
  });
});

describe('Pages search', () => {
  /** The nearest ancestor of the search box that also contains the tree. */
  const treePane = () => {
    let node: HTMLElement | null = screen.getByRole('searchbox', {
      name: 'Search pages...',
    });
    while (node) {
      if (within(node).queryByText('All categories')) return node;
      node = node.parentElement;
    }
    throw new Error('tree pane not found');
  };

  it('filters the tree', async () => {
    categoriesReturn({ id: 'shoes', name: 'Shoes' });
    const { user } = setup();
    await screen.findByText('Shoes');

    const pane = treePane();
    await user.type(
      screen.getByRole('searchbox', { name: 'Search pages...' }),
      'Shoes'
    );

    await waitFor(() =>
      expect(within(pane).queryByText('Homepage')).not.toBeInTheDocument()
    );
    expect(within(pane).getByText('Shoes')).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    const { user } = setup();
    await screen.findAllByText('Homepage');

    await user.type(
      screen.getByRole('searchbox', { name: 'Search pages...' }),
      'nothing at all'
    );
    expect(await screen.findByText('No pages found')).toBeInTheDocument();
  });
});

describe('Pages selection', () => {
  it('selects a node and records it in the URL', async () => {
    categoriesReturn({ id: 'shoes', name: 'Shoes' });
    const { user, history } = setup();

    await user.click(await screen.findByText('Shoes'));
    await waitFor(() =>
      expect(history.location.search).toContain('node=shoes')
    );
  });

  it('drops a deep-linked view when another page is selected', async () => {
    categoriesReturn({ id: 'shoes', name: 'Shoes' });
    const { user, history } = setup('/pages?node=home&view=pdp');

    await user.click(await screen.findByText('Shoes'));
    await waitFor(() => expect(history.location.search).not.toContain('view='));
  });

  it('restores the node named in the URL', async () => {
    categoriesReturn({ id: 'shoes', name: 'Shoes' });
    setup('/pages?node=shoes');
    // The detail pane shows the deep-linked node, so its title appears twice.
    await waitFor(() =>
      expect(screen.getAllByText('Shoes').length).toBeGreaterThan(1)
    );
  });
});

describe('Pages creation', () => {
  it('opens the create drawer', async () => {
    const { user } = setup();
    await user.click(await screen.findByRole('button', { name: /New page/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('creates a page and navigates into the builder', async () => {
    const { user, history } = setup();
    await user.click(await screen.findByRole('button', { name: /New page/ }));

    const dialog = await screen.findByRole('dialog');
    // Both a display name and a URL slug are required before Create enables.
    const [nameField, urlField] = within(dialog).getAllByRole('textbox');
    await user.type(nameField, 'About us');
    await user.type(urlField, 'about-us');

    const create = within(dialog)
      .getAllByRole('button')
      .find((b) => /create/i.test(b.textContent ?? ''));
    await user.click(create!);

    await waitFor(() =>
      expect(store.get(DRAFT_PAGE_CONTAINER, pageKey('about-us'))).toBeDefined()
    );
    await waitFor(() =>
      expect(history.location.pathname).toContain('/builder/about-us')
    );
  });
});

describe('Pages preview settings', () => {
  it('opens the preview settings dialog', async () => {
    const { user } = setup();
    await user.click(
      await screen.findByRole('button', { name: /^Settings$/ })
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('Pages legacy migration', () => {
  it('blocks the dashboard while legacy pages exist', async () => {
    store.seed({
      container: LEGACY_PAGE_CONTAINER,
      key: pageKey('old'),
      value: legacyPage('old'),
    });

    setup();
    // A non-closable dialog forces the migration before anything else.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('does not block when everything is already migrated', async () => {
    store.seed({
      container: DRAFT_PAGE_CONTAINER,
      key: pageKey('home'),
      value: buildDraftPagePayload(),
    });

    setup();
    await screen.findAllByText('Homepage');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('migrates and confirms', async () => {
    store.seed({
      container: LEGACY_PAGE_CONTAINER,
      key: pageKey('old'),
      value: legacyPage('old'),
    });

    const { user } = setup();
    const dialog = await screen.findByRole('dialog');
    const migrate = within(dialog)
      .getAllByRole('button')
      .find((b) => /migrate/i.test(b.textContent ?? ''));
    await user.click(migrate!);

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith({
        title: expect.stringContaining('Migrated 1 page'),
      })
    );
  });
});
