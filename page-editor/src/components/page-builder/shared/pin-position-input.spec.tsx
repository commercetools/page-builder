import { PinPositionInput } from './pin-position-input';
import { renderWithProviders, screen } from '../../../test-utils/render';

const setup = (over: Partial<Parameters<typeof PinPositionInput>[0]> = {}) => {
  const onCommit = jest.fn();
  const rendered = renderWithProviders(
    <PinPositionInput position={1} limit={8} onCommit={onCommit} {...over} />
  );
  return { onCommit, ...rendered };
};

const input = () => screen.findByRole('textbox', { name: 'Position' });

describe('PinPositionInput', () => {
  it('shows the current position', async () => {
    setup({ position: 3 });
    expect(await input()).toHaveValue('3');
  });

  it('does not commit on every keystroke, so the list cannot re-sort mid-edit', async () => {
    const { user, onCommit } = setup({ position: 1 });
    await user.clear(await input());
    await user.type(await input(), '4');
    expect(onCommit).not.toHaveBeenCalled();
  });

  /**
   * Nimbus `NumberInput` reports its value on blur, not per keystroke, so the
   * draft is only up to date after the value has been committed once (Enter).
   * See the "loses the edit" test below and findings.md #7.
   */
  const typeAndCommit = async (
    user: {
      clear: (el: Element) => Promise<void>;
      type: (el: Element, t: string) => Promise<void>;
      tab: () => Promise<void>;
    },
    field: Element,
    text: string
  ) => {
    await user.clear(field);
    await user.type(field, `${text}{Enter}`);
    await user.tab();
  };

  it('commits the typed position', async () => {
    const { user, onCommit } = setup({ position: 1 });
    await typeAndCommit(user, await input(), '4');
    expect(onCommit).toHaveBeenCalledWith('4');
  });

  it('clamps a position above the limit', async () => {
    const { user, onCommit } = setup({ position: 1, limit: 8 });
    await typeAndCommit(user, await input(), '99');
    expect(onCommit).toHaveBeenCalledWith('8');
  });

  it('clamps a position below one', async () => {
    const { user, onCommit } = setup({ position: 4 });
    await typeAndCommit(user, await input(), '0');
    expect(onCommit).toHaveBeenCalledWith('1');
  });

  it('falls back to position one for an emptied field', async () => {
    const { user, onCommit } = setup({ position: 4 });
    const field = await input();
    await user.clear(field);
    await user.type(field, '{Enter}');
    await user.tab();

    expect(onCommit).toHaveBeenCalledWith('1');
  });

  it('loses the edit when the field is tabbed away from without pressing Enter', async () => {
    // BUG, characterized rather than fixed — see findings.md #7. Nimbus reports
    // the new value in its own blur-time `onChange`, which lands after this
    // component's `onBlur` has already committed the previous `draft`.
    const { user, onCommit } = setup({ position: 1 });
    const field = await input();
    await user.clear(field);
    await user.type(field, '4');
    await user.tab();

    expect(onCommit).toHaveBeenCalledWith('1');
    expect(onCommit).not.toHaveBeenCalledWith('4');
  });

  it('re-syncs when a swap moves this pin while it is not being edited', async () => {
    const { rerender } = setup({ position: 1 });
    expect(await input()).toHaveValue('1');

    rerender(<PinPositionInput position={5} limit={8} onCommit={jest.fn()} />);
    expect(await input()).toHaveValue('5');
  });

  it('does not overwrite an edit in progress', async () => {
    // A swap elsewhere in the list must not replace what the user is typing.
    const { user, rerender } = setup({ position: 1 });
    const field = await input();
    await user.clear(field);
    await user.type(field, '7');

    rerender(<PinPositionInput position={5} limit={8} onCommit={jest.fn()} />);
    expect(field).toHaveValue('7');
  });
});
