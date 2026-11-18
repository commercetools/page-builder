import LayoutPickerDialog from './layout-picker-dialog';
import type { LayoutElement } from './types';
import {
  renderWithProviders,
  screen,
  waitFor,
  within,
} from '../../test-utils/render';

const setup = (
  over: Partial<Parameters<typeof LayoutPickerDialog>[0]> = {}
) => {
  const onAdd = jest.fn();
  const onClose = jest.fn();
  const rendered = renderWithProviders(
    <LayoutPickerDialog
      open
      section="MAIN"
      onAdd={onAdd}
      onClose={onClose}
      {...over}
    />
  );
  return { onAdd, onClose, ...rendered };
};

describe('LayoutPickerDialog', () => {
  it('renders nothing while closed', async () => {
    setup({ open: false });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  it('names the section it will add to', async () => {
    setup();
    expect(await screen.findByText(/Add layout to MAIN/)).toBeInTheDocument();
  });

  it('offers every layout width', async () => {
    setup();
    const dialog = await screen.findByRole('dialog');

    for (const label of [
      'Full width',
      'Half',
      'Third',
      'Two-thirds',
      'Quarter',
      'Three quarters',
    ]) {
      expect(within(dialog).getByText(label)).toBeInTheDocument();
    }
  });

  it('adds a full-width row', async () => {
    const { user, onAdd } = setup();
    await user.click(await screen.findByText('Full width'));

    const layout = onAdd.mock.calls[0][0] as LayoutElement;
    expect(layout).toMatchObject({
      kind: 'layout',
      width: '1/1',
      children: [],
      visibility: { mobile: true, tablet: true, desktop: true },
    });
  });

  it('adds a half-width row', async () => {
    const { user, onAdd } = setup();
    await user.click(await screen.findByText('Half'));
    expect((onAdd.mock.calls[0][0] as LayoutElement).width).toBe('1/2');
  });

  it('names the new row after its width', async () => {
    const { user, onAdd } = setup();
    await user.click(await screen.findByText('Third'));

    const layout = onAdd.mock.calls[0][0] as LayoutElement;
    expect(Object.values(layout.name)[0]).toContain('1/3');
  });

  it('derives the row id from the section', async () => {
    const { user, onAdd } = setup({ section: 'FOOTER' });
    await user.click(await screen.findByText('Full width'));
    expect((onAdd.mock.calls[0][0] as LayoutElement).id).toContain('footer');
  });

  it('gives each row a distinct id', async () => {
    const { user, onAdd } = setup();
    await user.click(await screen.findByText('Full width'));
    await user.click(await screen.findByText('Half'));

    const [first] = onAdd.mock.calls[0] as [LayoutElement];
    const [second] = onAdd.mock.calls[1] as [LayoutElement];
    expect(first.id).not.toBe(second.id);
  });

  it('closes itself after adding', async () => {
    const { user, onClose } = setup();
    await user.click(await screen.findByText('Full width'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
