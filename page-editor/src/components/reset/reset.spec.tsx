import { toast } from '@commercetools/nimbus';
import Reset from './reset';
import {
  COMPONENTS_CONTAINER,
  DRAFT_PAGE_CONTAINER,
  LEGACY_PAGE_CONTAINER,
  PUBLISHED_PAGE_CONTAINER,
} from '../page-builder/types';
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '../../test-utils/render';
import { graphql } from 'msw';
import { failOperation, installMockServer } from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';

const store = installMockServer();

const fill = (container: string, count: number) =>
  store.seed(
    ...Array.from({ length: count }, (_, i) => ({
      container,
      key: `object-${i}`,
      value: { i },
    }))
  );

let toastSuccess: jest.SpyInstance;
let toastError: jest.SpyInstance;
beforeEach(() => {
  toastSuccess = jest.spyOn(toast, 'success').mockImplementation(() => '');
  toastError = jest.spyOn(toast, 'error').mockImplementation(() => '');
});
afterEach(() => {
  toastSuccess.mockRestore();
  toastError.mockRestore();
});

const setup = () => renderWithProviders(<Reset />);

const loaded = () =>
  waitFor(() =>
    expect(
      screen.queryByLabelText('Loading containers')
    ).not.toBeInTheDocument()
  );

const resetButton = () =>
  screen.getByRole('button', { name: /Reset selected/ });

describe('Reset listing', () => {
  it('shows a spinner while the counts are loading', async () => {
    // Delayed so the loading state is observable — MSW otherwise answers before
    // the application shell has finished suspending.
    server.use(
      graphql.query('FetchContainerObjects', async (_req, res, ctx) =>
        res(
          ctx.delay(200),
          ctx.data({
            customObjects: {
              __typename: 'CustomObjectQueryResult',
              total: 0,
              count: 0,
              offset: 0,
              results: [],
            },
          })
        )
      )
    );

    setup();
    expect(
      await screen.findByLabelText('Loading containers')
    ).toBeInTheDocument();
    await loaded();
  });

  it('lists every container this app owns', async () => {
    setup();
    await loaded();

    for (const container of [
      LEGACY_PAGE_CONTAINER,
      DRAFT_PAGE_CONTAINER,
      PUBLISHED_PAGE_CONTAINER,
      COMPONENTS_CONTAINER,
    ]) {
      expect(screen.getByText(container)).toBeInTheDocument();
    }
  });

  it('shows how many objects each container holds', async () => {
    fill(DRAFT_PAGE_CONTAINER, 3);
    setup();
    await loaded();

    expect(await screen.findByText('3 objects')).toBeInTheDocument();
    expect(screen.getAllByText('0 objects').length).toBeGreaterThan(0);
  });

  it('uses the singular for one object', async () => {
    fill(DRAFT_PAGE_CONTAINER, 1);
    setup();
    await loaded();
    expect(await screen.findByText('1 object')).toBeInTheDocument();
  });

  it('reports an error rather than an empty list', async () => {
    server.use(failOperation('FetchContainerObjects', 'gateway down'));
    setup();
    await loaded();
    expect(await screen.findByText(/gateway down/)).toBeInTheDocument();
  });
});

describe('Reset selection', () => {
  it('cannot reset with nothing selected', async () => {
    setup();
    await loaded();
    expect(resetButton()).toBeDisabled();
  });

  it('enables reset once a container is chosen', async () => {
    const { user } = setup();
    await loaded();

    await user.click(
      screen.getByRole('checkbox', { name: `Select ${DRAFT_PAGE_CONTAINER}` })
    );
    expect(resetButton()).toBeEnabled();
  });

  it('selects and clears every container at once', async () => {
    const { user } = setup();
    await loaded();

    const all = screen.getByRole('checkbox', { name: /Select all containers/ });
    await user.click(all);
    expect(
      screen.getByRole('checkbox', { name: `Select ${DRAFT_PAGE_CONTAINER}` })
    ).toBeChecked();

    await user.click(all);
    expect(
      screen.getByRole('checkbox', { name: `Select ${DRAFT_PAGE_CONTAINER}` })
    ).not.toBeChecked();
  });

  it('deselects an individual container', async () => {
    const { user } = setup();
    await loaded();

    const one = screen.getByRole('checkbox', {
      name: `Select ${DRAFT_PAGE_CONTAINER}`,
    });
    await user.click(one);
    await user.click(one);

    expect(resetButton()).toBeDisabled();
  });
});

describe('Reset confirmation', () => {
  const selectAndConfirm = async (user: {
    click: (el: Element) => Promise<void>;
  }) => {
    await user.click(
      screen.getByRole('checkbox', { name: `Select ${DRAFT_PAGE_CONTAINER}` })
    );
    await user.click(resetButton());
    return screen.findByRole('dialog');
  };

  it('asks before deleting anything', async () => {
    fill(DRAFT_PAGE_CONTAINER, 2);
    const { user } = setup();
    await loaded();

    const dialog = await selectAndConfirm(user);
    expect(
      within(dialog).getByText('Reset selected containers?')
    ).toBeInTheDocument();
    // Nothing has been deleted yet.
    expect(store.list(DRAFT_PAGE_CONTAINER)).toHaveLength(2);
  });

  it('names how many objects will go', async () => {
    fill(DRAFT_PAGE_CONTAINER, 2);
    const { user } = setup();
    await loaded();

    const dialog = await selectAndConfirm(user);
    expect(
      within(dialog).getByRole('button', { name: /Delete 2 objects/ })
    ).toBeInTheDocument();
  });

  it('backs out without deleting', async () => {
    fill(DRAFT_PAGE_CONTAINER, 2);
    const { user } = setup();
    await loaded();

    const dialog = await selectAndConfirm(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
    expect(store.list(DRAFT_PAGE_CONTAINER)).toHaveLength(2);
  });

  it('wipes the chosen container and confirms', async () => {
    fill(DRAFT_PAGE_CONTAINER, 2);
    fill(PUBLISHED_PAGE_CONTAINER, 1);
    const { user } = setup();
    await loaded();

    const dialog = await selectAndConfirm(user);
    await user.click(
      within(dialog).getByRole('button', { name: /Delete 2 objects/ })
    );

    await waitFor(() =>
      expect(store.list(DRAFT_PAGE_CONTAINER)).toHaveLength(0)
    );
    // Only the selected container is touched.
    expect(store.list(PUBLISHED_PAGE_CONTAINER)).toHaveLength(1);
    expect(toastSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Reset complete' })
    );
  });

  it('clears the selection after a successful reset', async () => {
    fill(DRAFT_PAGE_CONTAINER, 1);
    const { user } = setup();
    await loaded();

    const dialog = await selectAndConfirm(user);
    await user.click(
      within(dialog).getByRole('button', { name: /Delete 1 object/ })
    );

    await waitFor(() => expect(resetButton()).toBeDisabled());
  });

  it('reports a failure instead of claiming success', async () => {
    fill(DRAFT_PAGE_CONTAINER, 1);
    const { user } = setup();
    await loaded();

    server.use(failOperation('DeleteCustomObject', 'denied', 'mutation'));
    const dialog = await selectAndConfirm(user);
    await user.click(
      within(dialog).getByRole('button', { name: /Delete 1 object/ })
    );

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Reset failed' })
      )
    );
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
