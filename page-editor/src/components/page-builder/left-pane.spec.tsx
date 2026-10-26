import LeftPane from './left-pane';
import type { Page } from './types';
import { renderWithProviders, screen } from '../../test-utils/render';
import {
  buildComponentElement,
  buildComponentGroup,
  buildComponentType,
  buildLayoutElement,
  buildSection,
  localized,
} from '../../test-utils/factories';

const page = (): Page => ({
  MAIN: [
    buildLayoutElement({
      id: 'layout-1',
      name: localized('Hero row'),
      children: [
        buildComponentElement({ id: 'c1', name: localized('Banner') }),
      ],
    }),
  ],
});

const catalog = [
  buildComponentType({
    type: 'content/hero',
    name: localized('Hero'),
    groupKey: 'content',
  }),
  buildComponentType({
    type: 'commerce/grid',
    name: localized('Product grid'),
    groupKey: 'commerce',
  }),
];

const setup = (over: Partial<Parameters<typeof LeftPane>[0]> = {}) => {
  const handlers = {
    onActivatePanel: jest.fn(),
    onDragStart: jest.fn(),
    onSelectLayout: jest.fn(),
    onSelectComp: jest.fn(),
  };
  const rendered = renderWithProviders(
    <LeftPane
      activePanel="components"
      catalog={catalog}
      groups={[
        buildComponentGroup({ key: 'content', name: 'Content' }),
        buildComponentGroup({ key: 'commerce', name: 'Commerce' }),
      ]}
      pageType="static"
      page={page()}
      sections={[buildSection({ id: 'MAIN', name: localized('Main') })]}
      selectedLayoutId={null}
      selectedCompId={null}
      {...handlers}
      {...over}
    />
  );
  return { ...handlers, ...rendered };
};

describe('LeftPane collapsed', () => {
  it('offers a way back to each panel', async () => {
    setup({ activePanel: null });
    expect(
      await screen.findByRole('button', { name: 'Show components' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Show outline' })
    ).toBeInTheDocument();
  });

  it('reopens the components panel', async () => {
    const { user, onActivatePanel } = setup({ activePanel: null });
    await user.click(
      await screen.findByRole('button', { name: 'Show components' })
    );
    expect(onActivatePanel).toHaveBeenCalledWith('components');
  });

  it('reopens the outline panel', async () => {
    const { user, onActivatePanel } = setup({ activePanel: null });
    await user.click(
      await screen.findByRole('button', { name: 'Show outline' })
    );
    expect(onActivatePanel).toHaveBeenCalledWith('outline');
  });
});

describe('LeftPane components panel', () => {
  it('titles itself and lists the catalog', async () => {
    setup();
    expect(await screen.findByText('Components')).toBeInTheDocument();
    expect(screen.getByText('Hero')).toBeInTheDocument();
    expect(screen.getByText('Product grid')).toBeInTheDocument();
  });

  it('filters the catalog by search', async () => {
    const { user } = setup();
    await screen.findByText('Hero');

    await user.type(
      screen.getByRole('searchbox', { name: 'Search components...' }),
      'grid'
    );

    expect(screen.queryByText('Hero')).not.toBeInTheDocument();
    expect(screen.getByText('Product grid')).toBeInTheDocument();
  });

  it('hides components that do not apply to this page type', async () => {
    setup({
      catalog: [
        buildComponentType({
          type: 'pdp/only',
          name: localized('PDP only'),
          groupKey: 'content',
          pageTypes: ['pdp'],
        }),
        buildComponentType({
          type: 'any/where',
          name: localized('Anywhere'),
          groupKey: 'content',
          pageTypes: ['all'],
        }),
      ],
      pageType: 'static',
    });

    expect(await screen.findByText('Anywhere')).toBeInTheDocument();
    expect(screen.queryByText('PDP only')).not.toBeInTheDocument();
  });

  it('starts a drag with the component type', async () => {
    const { onDragStart } = setup();
    const hero = await screen.findByText('Hero');
    const draggable = hero.closest('[draggable="true"]') as HTMLElement;

    draggable.dispatchEvent(
      Object.assign(new Event('dragstart', { bubbles: true }), {
        dataTransfer: { setData: () => undefined, effectAllowed: 'copy' },
      })
    );

    expect(onDragStart).toHaveBeenCalledWith('content/hero');
  });

  it('switches to the outline panel', async () => {
    const { user, onActivatePanel } = setup();
    await screen.findByText('Components');

    await user.click(screen.getByRole('button', { name: 'Show outline' }));
    expect(onActivatePanel).toHaveBeenCalledWith('outline');
  });

  it('collapses the pane', async () => {
    const { user, onActivatePanel } = setup();
    await screen.findByText('Components');

    await user.click(screen.getByRole('button', { name: 'Collapse panel' }));
    expect(onActivatePanel).toHaveBeenCalledWith(null);
  });
});

describe('LeftPane outline panel', () => {
  it('lists the layouts and components of the page', async () => {
    setup({ activePanel: 'outline' });
    expect(await screen.findByText('Outline')).toBeInTheDocument();
    expect(screen.getByText('Hero row')).toBeInTheDocument();
    expect(screen.getByText('Banner')).toBeInTheDocument();
  });

  it('says so for a section with no rows', async () => {
    setup({ activePanel: 'outline', page: {} });
    expect(await screen.findByText('No layout rows yet')).toBeInTheDocument();
  });

  it('selects a layout from the outline', async () => {
    const { user, onSelectLayout } = setup({ activePanel: 'outline' });
    await user.click(await screen.findByText('Hero row'));
    expect(onSelectLayout).toHaveBeenCalledWith('layout-1');
  });

  it('selects a component from the outline', async () => {
    const { user, onSelectComp } = setup({ activePanel: 'outline' });
    await user.click(await screen.findByText('Banner'));
    expect(onSelectComp).toHaveBeenCalledWith('layout-1', 'c1');
  });

  it('filters the outline by search', async () => {
    const { user } = setup({ activePanel: 'outline' });
    await screen.findByText('Banner');

    await user.type(
      screen.getByRole('searchbox', { name: 'Search outline...' }),
      'Banner'
    );

    expect(screen.getByText('Banner')).toBeInTheDocument();
  });

  it('switches back to the components panel', async () => {
    const { user, onActivatePanel } = setup({ activePanel: 'outline' });
    await screen.findByText('Outline');

    await user.click(screen.getByRole('button', { name: 'Show components' }));
    expect(onActivatePanel).toHaveBeenCalledWith('components');
  });
});
