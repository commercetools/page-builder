import Workflows from './workflows';
import type { WorkflowDefinition } from './types';
import { useOrgDirectory } from '../../hooks/use-org-directory';
import { renderWithProviders, screen, waitFor } from '../../test-utils/render';
import { installMockServer } from '../../test-utils/msw';
import {
  buildOrgDirectory,
  buildOrgTeam,
  unavailableOrgDirectory,
} from '../../test-utils/factories';

const store = installMockServer();
const CONTAINER = 'page-editor';

jest.mock('../../hooks/use-org-directory', () => ({
  ...jest.requireActual('../../hooks/use-org-directory'),
  useOrgDirectory: jest.fn(),
}));
const mockedDirectory = useOrgDirectory as jest.MockedFunction<
  typeof useOrgDirectory
>;

beforeEach(() => {
  mockedDirectory.mockReturnValue(
    buildOrgDirectory({
      teams: [
        buildOrgTeam({ id: 't1', name: 'Legal' }),
        buildOrgTeam({ id: 't2', name: 'Brand' }),
      ],
    })
  );
});

const definition = (
  over: Partial<WorkflowDefinition> = {}
): WorkflowDefinition => ({
  schemaVersion: 1,
  id: 'wf-1',
  name: 'Standard review',
  pageType: 'all',
  steps: [
    { id: 's1', title: 'Legal', assignee: { teamId: 't1', teamName: 'Legal' } },
  ],
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  ...over,
});

const seed = (def = definition()) =>
  store.seed({ container: CONTAINER, key: `workflow-${def.id}`, value: def });

const setup = () => renderWithProviders(<Workflows />);

const settled = () =>
  waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

describe('Workflows list', () => {
  it('shows the heading and its explanation', async () => {
    setup();
    await settled();
    expect(
      screen.getByText('Visual approval flows applied per page type.')
    ).toBeInTheDocument();
  });

  it('invites the first workflow when there are none', async () => {
    setup();
    await settled();

    expect(await screen.findByText('No workflows yet.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Create your first workflow/ })
    ).toBeInTheDocument();
  });

  it('lists existing workflows', async () => {
    seed();
    setup();
    expect(await screen.findByText('Standard review')).toBeInTheDocument();
  });

  it('offers edit and delete per workflow', async () => {
    seed();
    setup();
    await screen.findByText('Standard review');

    expect(
      screen.getByRole('button', { name: 'Edit workflow' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete workflow' })
    ).toBeInTheDocument();
  });

  it('warns when the team directory cannot be read', async () => {
    mockedDirectory.mockReturnValue(unavailableOrgDirectory());
    setup();
    await settled();

    expect(
      await screen.findByText(/Team directory unavailable/)
    ).toBeInTheDocument();
  });

  it('stays quiet when the directory is available', async () => {
    setup();
    await settled();
    expect(
      screen.queryByText(/Team directory unavailable/)
    ).not.toBeInTheDocument();
  });
});

describe('Workflows editing', () => {
  it('opens an empty builder for a new workflow', async () => {
    const { user } = setup();
    await settled();

    await user.click(screen.getByRole('button', { name: /New workflow/ }));
    // The list is replaced by the builder.
    await waitFor(() =>
      expect(screen.queryByText('No workflows yet.')).not.toBeInTheDocument()
    );
  });

  it('opens the builder from the empty state too', async () => {
    const { user } = setup();
    await settled();

    await user.click(
      screen.getByRole('button', { name: /Create your first workflow/ })
    );
    await waitFor(() =>
      expect(screen.queryByText('No workflows yet.')).not.toBeInTheDocument()
    );
  });

  it('opens the builder on an existing workflow', async () => {
    seed();
    const { user } = setup();
    await screen.findByText('Standard review');

    await user.click(screen.getByRole('button', { name: 'Edit workflow' }));
    expect(
      await screen.findByDisplayValue('Standard review')
    ).toBeInTheDocument();
  });

  it('returns to the list on cancel, without saving', async () => {
    seed();
    const { user } = setup();
    await screen.findByText('Standard review');
    const before = store.get(CONTAINER, 'workflow-wf-1')!.version;

    await user.click(screen.getByRole('button', { name: 'Edit workflow' }));
    await screen.findByDisplayValue('Standard review');

    const cancel = screen
      .getAllByRole('button')
      .find((b) => /cancel/i.test(b.textContent ?? ''));
    await user.click(cancel!);

    await screen.findByText('Standard review');
    expect(store.get(CONTAINER, 'workflow-wf-1')!.version).toBe(before);
  });

  it('saves an edited workflow and returns to the list', async () => {
    seed();
    const { user } = setup();
    await screen.findByText('Standard review');

    await user.click(screen.getByRole('button', { name: 'Edit workflow' }));
    const nameField = await screen.findByDisplayValue('Standard review');
    await user.type(nameField, ' v2');

    const save = screen
      .getAllByRole('button')
      .find((b) => /save/i.test(b.textContent ?? ''));
    await user.click(save!);

    await waitFor(() => {
      const stored = store.get(CONTAINER, 'workflow-wf-1')!
        .value as WorkflowDefinition;
      expect(stored.name).toBe('Standard review v2');
    });
  });
});

describe('Workflows deletion', () => {
  it('removes the workflow', async () => {
    seed();
    const { user } = setup();
    await screen.findByText('Standard review');

    await user.click(screen.getByRole('button', { name: 'Delete workflow' }));

    await waitFor(() =>
      expect(store.get(CONTAINER, 'workflow-wf-1')).toBeUndefined()
    );
  });
});
