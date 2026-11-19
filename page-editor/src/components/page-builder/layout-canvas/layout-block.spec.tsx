import LayoutBlock from './layout-block';
import {
  fireEvent,
  renderWithProviders,
  screen,
  within,
} from '../../../test-utils/render';
import {
  buildComponentElement,
  buildLayoutElement,
  localized,
} from '../../../test-utils/factories';

const setup = (over: Partial<Parameters<typeof LayoutBlock>[0]> = {}) => {
  const handlers = {
    onSelectLayout: jest.fn(),
    onSelectComp: jest.fn(),
    onDuplicateLayout: jest.fn(),
    onDeleteLayout: jest.fn(),
    onDuplicateComp: jest.fn(),
    onDeleteComp: jest.fn(),
    onDropNewComp: jest.fn(),
    onUpdateComponents: jest.fn(),
    onLayoutDragStart: jest.fn(),
    onLayoutDragOver: jest.fn(),
    onLayoutDrop: jest.fn(),
  };
  const rendered = renderWithProviders(
    <LayoutBlock
      layout={buildLayoutElement({ name: localized('Hero row'), width: '1/2' })}
      selected={false}
      selectedCompId={null}
      draggedComponentType={null}
      {...handlers}
      {...over}
    />
  );
  return { ...handlers, ...rendered };
};

/** The layout's own header row (the one carrying the width in its label). */
const layoutHeader = () => screen.findByText(/Hero row · 1\/2/);

describe('LayoutBlock header', () => {
  it('labels the row with its name and width', async () => {
    setup();
    expect(await layoutHeader()).toBeInTheDocument();
  });

  it('selects the layout when its header is clicked', async () => {
    const { user, onSelectLayout } = setup();
    await user.click(await layoutHeader());
    expect(onSelectLayout).toHaveBeenCalledTimes(1);
  });

  it('offers duplicate and delete once selected', async () => {
    const { user, onDuplicateLayout, onDeleteLayout } = setup({
      selected: true,
    });
    await layoutHeader();

    await user.click(screen.getAllByRole('button', { name: /duplicate/i })[0]);
    expect(onDuplicateLayout).toHaveBeenCalledTimes(1);

    await user.click(screen.getAllByRole('button', { name: /delete/i })[0]);
    expect(onDeleteLayout).toHaveBeenCalledTimes(1);
  });

  it('offers commenting on the layout when the caller supports it', async () => {
    const onCommentLayout = jest.fn();
    const { user } = setup({ selected: true, onCommentLayout });
    await layoutHeader();

    await user.click(
      screen.getAllByRole('button', { name: 'Comment on this element' })[0]
    );
    expect(onCommentLayout).toHaveBeenCalledTimes(1);
  });
});

describe('LayoutBlock contents', () => {
  it('invites a drop when the row is empty', async () => {
    setup({ layout: buildLayoutElement({ children: [] }) });
    expect(await screen.findByText(/drop/i)).toBeInTheDocument();
  });

  it('lists the components it holds', async () => {
    setup({
      layout: buildLayoutElement({
        name: localized('Hero row'),
        width: '1/2',
        children: [
          buildComponentElement({ id: 'c1', name: localized('Banner') }),
          buildComponentElement({ id: 'c2', name: localized('Copy') }),
        ],
      }),
    });

    expect(await screen.findByText('Banner')).toBeInTheDocument();
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('collapses and re-expands its contents', async () => {
    const { user, container } = setup({
      layout: buildLayoutElement({
        name: localized('Hero row'),
        width: '1/2',
        children: [buildComponentElement({ name: localized('Banner') })],
      }),
    });
    await screen.findByText('Banner');

    // The chevron in the layout header toggles the body.
    const EXPAND_MORE = 'M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z';
    const chevron = Array.from(container.querySelectorAll('svg')).find(
      (svg) => svg.querySelector('path')?.getAttribute('d') === EXPAND_MORE
    )!.parentElement!;

    await user.click(chevron);
    expect(screen.queryByText('Banner')).not.toBeInTheDocument();

    await user.click(chevron);
    expect(await screen.findByText('Banner')).toBeInTheDocument();
  });

  it('deletes and duplicates an individual component', async () => {
    const { user, onDeleteComp, onDuplicateComp } = setup({
      selectedCompId: 'c1',
      layout: buildLayoutElement({
        name: localized('Hero row'),
        width: '1/2',
        children: [
          buildComponentElement({ id: 'c1', name: localized('Banner') }),
        ],
      }),
    });

    const banner = await screen.findByText('Banner');
    const block = banner.parentElement!.parentElement!;

    await user.click(within(block).getByRole('button', { name: /delete/i }));
    expect(onDeleteComp).toHaveBeenCalledWith('c1');

    await user.click(within(block).getByRole('button', { name: /duplicate/i }));
    expect(onDuplicateComp).toHaveBeenCalledWith('c1');
  });
});

describe('LayoutBlock drag and drop', () => {
  const dataTransfer = (types: string[] = []) => ({
    types,
    getData: () => '',
    setData: () => undefined,
    dropEffect: 'move',
    effectAllowed: 'all',
  });

  /** The outermost draggable Box. */
  const rowElement = async () =>
    (await layoutHeader()).closest('[draggable="true"]') as HTMLElement;

  /** The row's body — the header is the first child, the drop area the second. */
  const bodyElement = async () =>
    (await rowElement()).children[1] as HTMLElement;

  it('starts a layout drag from the row itself', async () => {
    const { onLayoutDragStart } = setup();
    fireEvent.dragStart(await rowElement(), { dataTransfer: dataTransfer() });
    expect(onLayoutDragStart).toHaveBeenCalledTimes(1);
  });

  it('accepts a layout reorder drop', async () => {
    const { onLayoutDragOver, onLayoutDrop } = setup();
    const row = await rowElement();

    fireEvent.dragOver(row, { dataTransfer: dataTransfer() });
    expect(onLayoutDragOver).toHaveBeenCalled();

    fireEvent.drop(row, { dataTransfer: dataTransfer() });
    expect(onLayoutDrop).toHaveBeenCalledTimes(1);
  });

  it('ignores a component reorder as a layout reorder', async () => {
    // Nimbus's own list drag must not be mistaken for dragging the whole row.
    const { onLayoutDragOver, onLayoutDrop } = setup();
    const row = await rowElement();
    const transfer = dataTransfer(['nimbus-draggable-list-item']);

    fireEvent.dragOver(row, { dataTransfer: transfer });
    fireEvent.drop(row, { dataTransfer: transfer });

    expect(onLayoutDragOver).not.toHaveBeenCalled();
    expect(onLayoutDrop).not.toHaveBeenCalled();
  });

  it('ignores a palette drag as a layout reorder', async () => {
    const { onLayoutDragOver, onLayoutDrop } = setup({
      draggedComponentType: 'content/hero',
    });
    const row = await rowElement();

    fireEvent.dragOver(row, { dataTransfer: dataTransfer() });
    fireEvent.drop(row, { dataTransfer: dataTransfer() });

    expect(onLayoutDragOver).not.toHaveBeenCalled();
    expect(onLayoutDrop).not.toHaveBeenCalled();
  });

  it('accepts a new component dropped from the palette', async () => {
    const { onDropNewComp } = setup({
      draggedComponentType: 'content/hero',
      layout: buildLayoutElement({
        id: 'layout-1',
        name: localized('Hero row'),
        width: '1/2',
        children: [],
      }),
    });
    await layoutHeader();

    const body = await bodyElement();
    fireEvent.dragOver(body, { dataTransfer: dataTransfer() });
    fireEvent.drop(body, { dataTransfer: dataTransfer() });

    expect(onDropNewComp).toHaveBeenCalledWith('layout-1');
  });

  it('does not accept a palette drop when nothing is being dragged', async () => {
    const { onDropNewComp } = setup({
      draggedComponentType: null,
      layout: buildLayoutElement({
        name: localized('Hero row'),
        width: '1/2',
        children: [],
      }),
    });
    await layoutHeader();

    const body = await bodyElement();
    fireEvent.drop(body, { dataTransfer: dataTransfer() });

    expect(onDropNewComp).not.toHaveBeenCalled();
  });
});
