import { RejectDialog } from './reject-dialog';
import { renderWithProviders, screen, waitFor } from '../../test-utils/render';

const setup = (over: Partial<Parameters<typeof RejectDialog>[0]> = {}) => {
  const onClose = jest.fn();
  const onConfirm = jest.fn();
  const result = renderWithProviders(
    <RejectDialog isOpen onClose={onClose} onConfirm={onConfirm} {...over} />
  );
  return { onClose, onConfirm, ...result };
};

describe('RejectDialog', () => {
  it('stays closed when isOpen is false', async () => {
    setup({ isOpen: false });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  it('explains the consequence of rejecting', async () => {
    setup();
    expect(
      await screen.findByText(/sends the page back one step/i)
    ).toBeInTheDocument();
  });

  it('names the step it rejects from when given one', async () => {
    setup({ stepLabel: 'Legal review' });
    expect(await screen.findByText(/Legal review/)).toBeInTheDocument();
  });

  it('disables Reject until a non-blank comment is entered', async () => {
    const { user } = setup();
    const reject = await screen.findByRole('button', { name: 'Reject' });
    expect(reject).toBeDisabled();

    const input = screen.getByLabelText('Rejection comment');
    await user.type(input, '   ');
    expect(reject).toBeDisabled();

    await user.type(input, 'needs a better headline');
    await waitFor(() => expect(reject).toBeEnabled());
  });

  it('submits the trimmed comment', async () => {
    const { user, onConfirm } = setup();
    const input = await screen.findByLabelText('Rejection comment');
    await user.type(input, '  fix the copy  ');
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('fix the copy'));
  });

  it('disables both actions while busy', async () => {
    setup({ busy: true });
    expect(
      await screen.findByRole('button', { name: 'Cancel' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  });
});
