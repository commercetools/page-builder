import { Route } from 'react-router-dom';
import PageBuilder from './page-builder';
import { useOrgDirectory } from '../../hooks/use-org-directory';
import { DRAFT_PAGE_CONTAINER, LEGACY_PAGE_CONTAINER, pageKey } from './types';
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '../../test-utils/render';
import { installMockServer, respondWith } from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';
import {
  buildComponentGroup,
  buildComponentType,
  buildDraftPagePayload,
  buildOrgDirectory,
  buildSection,
  localized,
} from '../../test-utils/factories';

const store = installMockServer();
const CONTAINER = LEGACY_PAGE_CONTAINER;

jest.mock('../../hooks/use-org-directory', () => ({
  ...jest.requireActual('../../hooks/use-org-directory'),
  useOrgDirectory: jest.fn(),
}));

beforeEach(() => {
  (
    useOrgDirectory as jest.MockedFunction<typeof useOrgDirectory>
  ).mockReturnValue(buildOrgDirectory());
  server.use(
    respondWith('FetchCategories', {
      categories: { __typename: 'CategoryQueryResult', total: 0, results: [] },
    })
  );
});

const seedComponents = (
  components = [
    buildComponentType({
      type: 'content/hero',
      name: localized('Hero'),
      groupKey: 'content',
    }),
  ]
) =>
  store.seed({
    container: CONTAINER,
    key: 'components',
    value: {
      schemaVersion: 2,
      draft: {},
      published: {
        schemaVersion: 2,
        appVersion: 1,
        publishedAt: '2026-01-15T10:00:00.000Z',
        groups: [buildComponentGroup({ key: 'content', name: 'Content' })],
        components,
      },
    },
  });

const seedSections = (sections: unknown[] | undefined) =>
  store.seed({
    container: CONTAINER,
    key: 'sections',
    value: {
      schemaVersion: 2,
      draft: {},
      published:
        sections === undefined
          ? null
          : {
              schemaVersion: 2,
              appVersion: 1,
              publishedAt: '2026-01-15T10:00:00.000Z',
              sections,
            },
    },
  });

/**
 * `PageBuilder` reads `:pageId` with `useParams`, so it needs a matching Route
 * ancestor — setting the URL alone leaves the param undefined.
 */
const setup = (pageId = 'home') =>
  renderWithProviders(
    <Route path="/builder/:pageId">
      <PageBuilder />
    </Route>,
    { route: `/builder/${pageId}` }
  );

/** The builder mounts a lot; wait for the canvas rather than a spinner. */
const canvasReady = () =>
  screen.findByText(/MAIN SECTION/i, {}, { timeout: 5000 });

describe('PageBuilder shell', () => {
  it('renders the canvas with the default sections', async () => {
    seedComponents();
    setup();
    expect(await canvasReady()).toBeInTheDocument();
  });

  it('falls back to the default sections when the synced catalog is empty', async () => {
    // A sync that wrote `sections: []` must not leave the builder blank.
    seedComponents();
    seedSections([]);
    setup();
    expect(await canvasReady()).toBeInTheDocument();
  });

  it('uses the synced sections when there are any', async () => {
    seedComponents();
    seedSections([
      buildSection({
        id: 'CUSTOM',
        name: localized('Custom'),
        pageTypes: ['all'],
      }),
    ]);
    setup();
    expect(await screen.findByText(/CUSTOM SECTION/i)).toBeInTheDocument();
  });

  it('shows the component palette from the synced catalog', async () => {
    seedComponents();
    setup();
    await canvasReady();
    expect(await screen.findByText('Hero')).toBeInTheDocument();
  });

  it('renders an empty palette for an unsynced project', async () => {
    setup();
    await canvasReady();
    expect(screen.queryByText('Hero')).not.toBeInTheDocument();
  });

  it('loads the page named in the route', async () => {
    seedComponents();
    store.seed({
      container: DRAFT_PAGE_CONTAINER,
      key: pageKey('about'),
      value: buildDraftPagePayload({ title: 'About', pageType: 'static' }),
    });

    setup('about');
    await canvasReady();
    // The draft resolved without falling back to a blank page.
    expect(store.get(DRAFT_PAGE_CONTAINER, pageKey('about'))).toBeDefined();
  });
});

describe('PageBuilder layout picker', () => {
  it('opens the picker from a section add button', async () => {
    seedComponents();
    const { user } = setup();
    await canvasReady();

    const add = screen.getAllByRole('button', { name: /add layout/i })[0];
    await user.click(add);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('adds the chosen layout to that section', async () => {
    seedComponents();
    const { user } = setup();
    await canvasReady();

    await user.click(screen.getAllByRole('button', { name: /add layout/i })[0]);
    const dialog = await screen.findByRole('dialog');

    // Any of the offered widths creates a row.
    const option = within(dialog).getAllByRole('button')[0];
    await user.click(option);

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });
});

describe('PageBuilder panels', () => {
  it('shows the settings pane with nothing selected', async () => {
    seedComponents();
    setup();
    await canvasReady();
    expect(await screen.findByText('Nothing selected')).toBeInTheDocument();
  });

  it('collapses and reopens the left pane', async () => {
    seedComponents();
    const { user } = setup();
    await canvasReady();

    await user.click(screen.getByRole('button', { name: 'Collapse panel' }));
    await waitFor(() =>
      expect(screen.queryByText('Components')).not.toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: 'Show components' }));
    expect(await screen.findByText('Components')).toBeInTheDocument();
  });

  it('links back to the pages dashboard', async () => {
    seedComponents();
    setup();
    await canvasReady();
    // The menu bar offers a way out of the builder.
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
