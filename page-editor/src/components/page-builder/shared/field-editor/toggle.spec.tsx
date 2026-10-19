import { Toggle } from './toggle';
import { renderWithProviders, screen } from '../../../../test-utils/render';

const setup = (over: Partial<Parameters<typeof Toggle>[0]> = {}) => {
  const onChange = jest.fn();
  const rendered = renderWithProviders(
    <Toggle value={false} onChange={onChange} label="Featured" {...over} />
  );
  return { onChange, ...rendered };
};

describe('Toggle', () => {
  it('is labelled, so it is reachable by name', async () => {
    setup();
    expect(
      await screen.findByRole('switch', { name: /Featured/ })
    ).toBeInTheDocument();
  });

  it('reflects the current value', async () => {
    const off = setup({ value: false });
    expect(
      await off.findByRole('switch', { name: /Featured/ })
    ).not.toBeChecked();
    off.unmount();

    const on = setup({ value: true });
    expect(await on.findByRole('switch', { name: /Featured/ })).toBeChecked();
  });

  it('reports the new value when toggled on', async () => {
    const { user, onChange } = setup({ value: false });
    await user.click(await screen.findByRole('switch', { name: /Featured/ }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reports the new value when toggled off', async () => {
    const { user, onChange } = setup({ value: true });
    await user.click(await screen.findByRole('switch', { name: /Featured/ }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('renders an optional leading icon without losing the label', async () => {
    setup({ icon: 'Visibility' });
    expect(
      await screen.findByRole('switch', { name: /Featured/ })
    ).toBeInTheDocument();
  });
});
