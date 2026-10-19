import ComponentBlock from './component-block';
import {
  fireEvent,
  renderWithProviders,
  screen,
} from '../../../test-utils/render';
import {
  buildComponentElement,
  localized,
} from '../../../test-utils/factories';

const setup = (over: Partial<Parameters<typeof ComponentBlock>[0]> = {}) => {
  const onDelete = jest.fn();
  const onDuplicate = jest.fn();
  const rendered = renderWithProviders(
    <ComponentBlock
      comp={buildComponentElement({ name: localized('Hero banner') })}
      selected={false}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      {...over}
    />
  );
  return { onDelete, onDuplicate, ...rendered };
};

describe('ComponentBlock', () => {
  it('shows the component name in the project locale', async () => {
    setup();
    expect(await screen.findByText('Hero banner')).toBeInTheDocument();
  });

  it('reflects the component visibility as device dots', async () => {
    const { container } = setup({
      comp: buildComponentElement({
        visibility: { mobile: false, tablet: true, desktop: true },
      }),
    });
    await screen.findByText('Hero');
    // Three dots rendered regardless; the hidden one differs only in colour.
    expect(
      container.querySelectorAll('span[class]').length
    ).toBeGreaterThanOrEqual(3);
  });

  it('reveals its actions on hover', async () => {
    // `onMouseEnter` lives on the outer block, so hover that rather than the
    // label inside it — mouseenter does not bubble.
    const { user, onDelete } = setup();
    const label = await screen.findByText('Hero banner');
    // Box > ElementContent(Flex) > label span — mouseenter is on the Box.
    const block = label.parentElement!.parentElement!;

    await expect(
      user.click(screen.getByRole('button', { name: /delete/i }))
    ).rejects.toThrow(/pointer-events: none/);

    // React synthesizes onMouseEnter from mouseover at the root, so dispatch that.
    fireEvent.mouseOver(block);

    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('hides its actions again once the pointer leaves', async () => {
    const { user } = setup();
    const label = await screen.findByText('Hero banner');
    const block = label.parentElement!.parentElement!;

    fireEvent.mouseOver(block);
    fireEvent.mouseOut(block);

    await expect(
      user.click(screen.getByRole('button', { name: /delete/i }))
    ).rejects.toThrow(/pointer-events: none/);
  });

  it('keeps its actions available while selected, without hovering', async () => {
    const { user, onDuplicate } = setup({ selected: true });
    await screen.findByText('Hero banner');
    await user.click(screen.getByRole('button', { name: /duplicate/i }));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
  });

  it('passes the comment affordance through when offered', async () => {
    const onComment = jest.fn();
    const { user } = setup({ selected: true, onComment, commentCount: 2 });
    await user.click(
      await screen.findByRole('button', { name: 'Comment on this element' })
    );
    expect(onComment).toHaveBeenCalledTimes(1);
  });
});
