import LayoutCanvas from './index';
import {
  fireEvent,
  renderWithProviders,
  screen,
  within,
} from '../../../test-utils/render';
import {
  buildComponentElement,
  buildComponentType,
  buildLayoutElement,
  buildSection,
  localized,
} from '../../../test-utils/factories';

const sections = [
  buildSection({ id: 'HEAD', name: localized('Head'), pageTypes: ['all'] }),
  buildSection({ id: 'MAIN', name: localized('Main'), pageTypes: ['all'] }),
];

const setup = (over: Partial<Parameters<typeof LayoutCanvas>[0]> = {}) => {
  const handlers = {
    onPageChange: jest.fn(),
    onSelectLayout: jest.fn(),
    onSelectComp: jest.fn(),
    onAddLayout: jest.fn(),
    onCommentElement: jest.fn(),
  };
  const rendered = renderWithProviders(
    <LayoutCanvas
      page={{}}
      sections={sections}
      pageType="static"
      selectedLayoutId={null}
      selectedCompId={null}
      draggedComponentType={null}
      device="desktop"
      componentCatalog={[buildComponentType()]}
      {...handlers}
      {...over}
    />
  );
  return { ...handlers, ...rendered };
};

describe('LayoutCanvas sections', () => {
  it('renders a heading per section', async () => {
    setup();
    expect(await screen.findByText('HEAD SECTION')).toBeInTheDocument();
    expect(screen.getByText('MAIN SECTION')).toBeInTheDocument();
  });

  it('shows only the sections valid for the page type', async () => {
    setup({
      sections: [
        buildSection({
          id: 'MAIN',
          name: localized('Main'),
          pageTypes: ['all'],
        }),
        buildSection({ id: 'PDP', name: localized('Pdp'), pageTypes: ['pdp'] }),
      ],
      pageType: 'static',
    });

    expect(await screen.findByText('MAIN SECTION')).toBeInTheDocument();
    expect(screen.queryByText('PDP SECTION')).not.toBeInTheDocument();
  });

  it('shows a page-type-specific section on its own page type', async () => {
    setup({
      sections: [
        buildSection({ id: 'PDP', name: localized('Pdp'), pageTypes: ['pdp'] }),
      ],
      pageType: 'pdp',
    });
    expect(await screen.findByText('PDP SECTION')).toBeInTheDocument();
  });

  it('collapses a section when its title is clicked', async () => {
    const { user } = setup();
    await screen.findByText('MAIN SECTION');
    expect(
      screen.getAllByText(/no layout elements|empty/i).length
    ).toBeGreaterThan(0);

    await user.click(screen.getByText('MAIN SECTION'));
    // Collapsing hides the section body, including its add button.
    expect(screen.getAllByRole('button', { name: /add layout/i })).toHaveLength(
      1
    );
  });

  it('clears the selection when the section background is clicked', async () => {
    const { user, onSelectLayout } = setup({ selectedLayoutId: 'layout-1' });
    await user.click(await screen.findByText('MAIN SECTION'));
    expect(onSelectLayout).toHaveBeenCalledWith(null);
  });
});

describe('LayoutCanvas layouts', () => {
  const pageWithLayout = () => ({
    MAIN: [
      buildLayoutElement({
        id: 'layout-1',
        name: localized('Hero row'),
        width: '1/1',
        children: [
          buildComponentElement({ id: 'c1', name: localized('Banner') }),
        ],
      }),
    ],
  });

  it('renders the layouts of a section', async () => {
    setup({ page: pageWithLayout() });
    expect(await screen.findByText(/Hero row · 1\/1/)).toBeInTheDocument();
    expect(screen.getByText('Banner')).toBeInTheDocument();
  });

  it('invites a first element into an empty section', async () => {
    setup();
    expect(
      (await screen.findAllByText(/no layout elements|empty/i)).length
    ).toBeGreaterThan(0);
  });

  it('offers an add button per visible section', async () => {
    setup();
    await screen.findByText('MAIN SECTION');
    expect(screen.getAllByRole('button', { name: /add layout/i })).toHaveLength(
      2
    );
  });

  it('adds a layout to the section whose button was pressed', async () => {
    const { user, onAddLayout } = setup();
    await screen.findByText('MAIN SECTION');
    const buttons = screen.getAllByRole('button', { name: /add layout/i });
    await user.click(buttons[1]);
    expect(onAddLayout).toHaveBeenCalledWith('MAIN');
  });

  it('selects a layout when its header is clicked', async () => {
    const { user, onSelectLayout } = setup({ page: pageWithLayout() });
    await user.click(await screen.findByText(/Hero row · 1\/1/));
    expect(onSelectLayout).toHaveBeenCalledWith('layout-1');
  });

  it('routes a layout comment to the layout id', async () => {
    const { user, onCommentElement } = setup({
      page: pageWithLayout(),
      selectedLayoutId: 'layout-1',
    });
    const header = (await screen.findByText(/Hero row · 1\/1/)).parentElement!
      .parentElement!;
    await user.click(
      within(header).getByRole('button', { name: 'Comment on this element' })
    );
    expect(onCommentElement).toHaveBeenCalledWith('layout-1');
  });

  it('routes a component comment to the component id', async () => {
    const { user, onCommentElement } = setup({
      page: pageWithLayout(),
      selectedCompId: 'c1',
    });
    const banner = await screen.findByText('Banner');
    const block = banner.parentElement!.parentElement!;
    await user.click(
      within(block).getByRole('button', { name: 'Comment on this element' })
    );
    expect(onCommentElement).toHaveBeenCalledWith('c1');
  });

  it('treats a layout as selected only when no component inside it is', async () => {
    const withComp = setup({
      page: pageWithLayout(),
      selectedLayoutId: 'layout-1',
      selectedCompId: 'c1',
    });
    const header = await withComp.findByText(/Hero row · 1\/1/);
    const withCompClass = header.parentElement!.parentElement!.className;
    withComp.unmount();

    const layoutOnly = setup({
      page: pageWithLayout(),
      selectedLayoutId: 'layout-1',
      selectedCompId: null,
    });
    const layoutHeader = await layoutOnly.findByText(/Hero row · 1\/1/);

    expect(layoutHeader.parentElement!.parentElement!.className).not.toBe(
      withCompClass
    );
  });
});

describe('LayoutCanvas device widths', () => {
  const canvasWidth = async () => {
    const title = await screen.findByText('MAIN SECTION');
    // The inner Box carrying the max-width wraps every section.
    return title.closest('section')!.parentElement!.className;
  };

  it('narrows the canvas for each device', async () => {
    const desktop = setup({ device: 'desktop' });
    const desktopClass = await canvasWidth();
    desktop.unmount();

    const tablet = setup({ device: 'tablet' });
    const tabletClass = await canvasWidth();
    tablet.unmount();

    setup({ device: 'mobile' });
    const mobileClass = await canvasWidth();

    expect(new Set([desktopClass, tabletClass, mobileClass]).size).toBe(3);
  });
});

describe('LayoutCanvas empty-section drop', () => {
  const dataTransfer = {
    types: [],
    getData: () => '',
    setData: () => undefined,
  };

  it('accepts a palette drop into an empty section', async () => {
    const { onPageChange } = setup({ draggedComponentType: 'content/hero' });
    const empty = (await screen.findAllByText(/no layout elements|empty/i))[1];

    fireEvent.dragOver(empty, { dataTransfer });
    fireEvent.drop(empty, { dataTransfer });

    expect(onPageChange).toHaveBeenCalled();
  });

  it('ignores a drop when nothing is being dragged from the palette', async () => {
    const { onPageChange } = setup({ draggedComponentType: null });
    const empty = (await screen.findAllByText(/no layout elements|empty/i))[1];

    fireEvent.dragOver(empty, { dataTransfer });
    fireEvent.drop(empty, { dataTransfer });

    expect(onPageChange).not.toHaveBeenCalled();
  });
});
