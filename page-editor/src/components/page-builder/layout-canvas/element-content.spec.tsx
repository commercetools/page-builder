import ElementContent from './element-content';
import { renderWithProviders, screen } from '../../../test-utils/render';

const setup = (over: Partial<Parameters<typeof ElementContent>[0]> = {}) => {
  const onDelete = jest.fn();
  const onDuplicate = jest.fn();
  const onComment = jest.fn();
  const rendered = renderWithProviders(
    <ElementContent
      label="Hero row"
      devices={[true, true, true]}
      isSelected={false}
      hover
      onDelete={onDelete}
      {...over}
    />
  );
  return { onDelete, onDuplicate, onComment, ...rendered };
};

describe('ElementContent', () => {
  it('shows the element label', async () => {
    setup();
    expect(await screen.findByText('Hero row')).toBeInTheDocument();
  });

  it('renders one visibility dot per device', async () => {
    setup({ devices: [true, false, true] });
    await screen.findByText('Hero row');
    // Three dots, in the canonical order.
    const dots = document.querySelectorAll('span[class*="css"]');
    expect(dots.length).toBeGreaterThanOrEqual(3);
  });

  it('always offers delete', async () => {
    setup();
    expect(
      await screen.findByRole('button', { name: /delete/i })
    ).toBeInTheDocument();
  });

  it('calls onDelete when the delete button is pressed', async () => {
    const { user, onDelete } = setup();
    await user.click(await screen.findByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('offers duplicate only when the caller supports it', async () => {
    setup();
    await screen.findByText('Hero row');
    expect(
      screen.queryByRole('button', { name: /duplicate/i })
    ).not.toBeInTheDocument();
  });

  it('calls onDuplicate when offered and pressed', async () => {
    const onDuplicate = jest.fn();
    const { user } = setup({ onDuplicate });
    await user.click(await screen.findByRole('button', { name: /duplicate/i }));
    expect(onDuplicate).toHaveBeenCalledTimes(1);
  });

  it('offers commenting only when the caller supports it', async () => {
    setup();
    await screen.findByText('Hero row');
    expect(
      screen.queryByRole('button', { name: 'Comment on this element' })
    ).not.toBeInTheDocument();
  });

  it('calls onComment when offered and pressed', async () => {
    const onComment = jest.fn();
    const { user } = setup({ onComment });
    await user.click(
      await screen.findByRole('button', { name: 'Comment on this element' })
    );
    expect(onComment).toHaveBeenCalledTimes(1);
  });

  it('marks the comment button when there are comments', async () => {
    const onComment = jest.fn();
    const withComments = setup({ onComment, commentCount: 3 });
    const marked = (
      await withComments.findByRole('button', {
        name: 'Comment on this element',
      })
    ).innerHTML;
    withComments.unmount();

    const withoutComments = setup({ onComment, commentCount: 0 });
    const unmarked = (
      await withoutComments.findByRole('button', {
        name: 'Comment on this element',
      })
    ).innerHTML;

    expect(marked).not.toBe(unmarked);
  });

  it('keeps the actions unclickable until the row is hovered or selected', async () => {
    // Hidden with opacity + pointer-events rather than unmounted, so the row does
    // not reflow on hover. A stray click must not delete an element.
    const { user, onDelete } = setup({ hover: false, isSelected: false });
    const deleteButton = await screen.findByRole('button', { name: /delete/i });

    await expect(user.click(deleteButton)).rejects.toThrow(
      /pointer-events: none/
    );
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('makes the actions clickable once the row is selected', async () => {
    const { user, onDelete } = setup({ hover: false, isSelected: true });
    await user.click(await screen.findByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('does not let an action click reach the element behind it', async () => {
    const onParentClick = jest.fn();
    const onDelete = jest.fn();
    const { user } = renderWithProviders(
      <div onClick={onParentClick}>
        <ElementContent
          label="Hero row"
          devices={[true, true, true]}
          isSelected
          hover
          onDelete={onDelete}
        />
      </div>
    );

    await user.click(await screen.findByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalled();
    expect(onParentClick).not.toHaveBeenCalled();
  });
});
