import ElementHeader from './element-header';
import { renderWithProviders, screen } from '../../../test-utils/render';

const setup = (over: Partial<Parameters<typeof ElementHeader>[0]> = {}) => {
  const onDelete = jest.fn();
  const onSelect = jest.fn();
  const onToggleExpand = jest.fn();
  const rendered = renderWithProviders(
    <ElementHeader
      label="Hero row"
      devices={[true, true, true]}
      isSelected={false}
      hover
      onDelete={onDelete}
      {...over}
    />
  );
  return { onDelete, onSelect, onToggleExpand, ...rendered };
};

describe('ElementHeader', () => {
  it('shows the label and the element actions', async () => {
    setup();
    expect(await screen.findByText('Hero row')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('selects the element when the header is clicked', async () => {
    const onSelect = jest.fn();
    const { user } = setup({ onSelect });
    await user.click(await screen.findByText('Hero row'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('does nothing on click when the caller offers no selection', async () => {
    const { user } = setup({ onSelect: undefined });
    await user.click(await screen.findByText('Hero row'));
    // No handler, no crash.
    expect(screen.getByText('Hero row')).toBeInTheDocument();
  });

  // The chevron and drag handle are decorative (aria-hidden) icons with no
  // accessible name, so they are identified by their glyph path.
  const EXPAND_MORE = 'M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z';

  const chevron = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('svg')).find(
      (svg) => svg.querySelector('path')?.getAttribute('d') === EXPAND_MORE
    );

  const chevronWrapper = (container: HTMLElement) =>
    chevron(container)?.parentElement as HTMLElement | undefined;

  it('shows no chevron when the element is not collapsible', async () => {
    const { container } = setup({ collapsible: false });
    await screen.findByText('Hero row');
    expect(chevron(container)).toBeUndefined();
  });

  it('adds a chevron when the element is collapsible', async () => {
    const { container } = setup({ collapsible: true, expanded: true });
    await screen.findByText('Hero row');
    expect(chevron(container)).toBeDefined();
  });

  it('styles the chevron differently when collapsed', async () => {
    // Chakra compiles the rotation into a class, so compare classes rather than
    // looking for an inline `rotate(-90deg)`.
    const collapsed = setup({ collapsible: true, expanded: false });
    await collapsed.findByText('Hero row');
    const collapsedClass = chevronWrapper(collapsed.container)!.className;
    collapsed.unmount();

    const expanded = setup({ collapsible: true, expanded: true });
    await expanded.findByText('Hero row');
    const expandedClass = chevronWrapper(expanded.container)!.className;

    expect(collapsedClass).not.toBe(expandedClass);
  });

  it('toggles expansion without also selecting the element', async () => {
    const onSelect = jest.fn();
    const onToggleExpand = jest.fn();
    const { user, container } = setup({
      collapsible: true,
      expanded: true,
      onSelect,
      onToggleExpand,
    });
    await screen.findByText('Hero row');

    await user.click(chevronWrapper(container)!);

    expect(onToggleExpand).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('changes its background when selected', async () => {
    const plain = setup({ isSelected: false, hover: false });
    const plainHtml = (await plain.findByText('Hero row')).parentElement!
      .parentElement!.className;
    plain.unmount();

    const selected = setup({ isSelected: true, hover: false });
    const selectedHtml = (await selected.findByText('Hero row')).parentElement!
      .parentElement!.className;

    expect(selectedHtml).not.toBe(plainHtml);
  });
});
