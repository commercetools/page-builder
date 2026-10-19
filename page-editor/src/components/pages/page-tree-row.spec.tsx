import PageTreeRow, { filterTree } from './page-tree-row';
import { renderWithProviders, screen } from '../../test-utils/render';
import { buildPageNode } from '../../test-utils/factories';

describe('filterTree', () => {
  const tree = () => [
    buildPageNode({ id: 'home', title: 'Homepage' }),
    buildPageNode({
      id: 'cat-root',
      title: 'All categories',
      children: [
        buildPageNode({ id: 'shoes', title: 'Shoes' }),
        buildPageNode({
          id: 'bags',
          title: 'Bags',
          children: [buildPageNode({ id: 'totes', title: 'Totes' })],
        }),
      ],
    }),
  ];

  it('returns everything for an empty query', () => {
    expect(filterTree(tree(), '')).toEqual(tree());
  });

  it('keeps a node whose own title matches', () => {
    const result = filterTree(tree(), 'homepage');
    expect(result.map((n) => n.id)).toEqual(['home']);
  });

  it('is case-insensitive', () => {
    expect(filterTree(tree(), 'SHOES')[0].children![0].id).toBe('shoes');
  });

  it('matches on a substring', () => {
    expect(filterTree(tree(), 'ome').map((n) => n.id)).toEqual(['home']);
  });

  it('keeps a parent whose descendant matches, pruned to the matches', () => {
    const result = filterTree(tree(), 'totes');
    expect(result.map((n) => n.id)).toEqual(['cat-root']);
    expect(result[0].children!.map((n) => n.id)).toEqual(['bags']);
    expect(result[0].children![0].children!.map((n) => n.id)).toEqual([
      'totes',
    ]);
  });

  it('keeps every child of a node that matches on its own title', () => {
    const result = filterTree(tree(), 'All categories');
    expect(result[0].children).toHaveLength(2);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterTree(tree(), 'nothing')).toEqual([]);
  });

  it('copes with an empty tree', () => {
    expect(filterTree([], 'x')).toEqual([]);
  });
});

const setup = (over: Partial<Parameters<typeof PageTreeRow>[0]> = {}) => {
  const onSelect = jest.fn();
  const rendered = renderWithProviders(
    <PageTreeRow
      node={buildPageNode({ id: 'home', title: 'Homepage' })}
      selectedId={undefined}
      onSelect={onSelect}
      builtPageStates={new Map()}
      {...over}
    />
  );
  return { onSelect, ...rendered };
};

describe('PageTreeRow', () => {
  it('shows the node title', async () => {
    setup();
    expect(await screen.findByText('Homepage')).toBeInTheDocument();
  });

  it('selects the node when clicked', async () => {
    const node = buildPageNode({ id: 'home', title: 'Homepage' });
    const { user, onSelect } = setup({ node });

    await user.click(await screen.findByText('Homepage'));
    expect(onSelect).toHaveBeenCalledWith(node);
  });

  it('expands a folder instead of selecting it', async () => {
    const node = buildPageNode({
      id: 'group',
      title: 'Group',
      type: 'folder',
      children: [buildPageNode({ id: 'child', title: 'Child' })],
    });
    const { user, onSelect } = setup({ node });

    await user.click(await screen.findByText('Group'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('shows children of a top-level node by default', async () => {
    setup({
      node: buildPageNode({
        id: 'cat-root',
        title: 'All categories',
        children: [buildPageNode({ id: 'shoes', title: 'Shoes' })],
      }),
    });
    expect(await screen.findByText('Shoes')).toBeInTheDocument();
  });

  it('collapses deeper levels by default', async () => {
    setup({
      depth: 1,
      node: buildPageNode({
        id: 'bags',
        title: 'Bags',
        children: [buildPageNode({ id: 'totes', title: 'Totes' })],
      }),
    });
    await screen.findByText('Bags');
    expect(screen.queryByText('Totes')).not.toBeInTheDocument();
  });

  it('toggles children with the chevron, without selecting', async () => {
    const { user, onSelect } = setup({
      depth: 1,
      node: buildPageNode({
        id: 'bags',
        title: 'Bags',
        children: [buildPageNode({ id: 'totes', title: 'Totes' })],
      }),
    });
    await screen.findByText('Bags');

    await user.click(screen.getAllByRole('button')[0]);
    expect(await screen.findByText('Totes')).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('forces every level open when asked', async () => {
    setup({
      depth: 1,
      forceExpand: true,
      node: buildPageNode({
        id: 'bags',
        title: 'Bags',
        children: [buildPageNode({ id: 'totes', title: 'Totes' })],
      }),
    });
    expect(await screen.findByText('Totes')).toBeInTheDocument();
  });

  it('opens an ancestor on the path to the selection', async () => {
    setup({
      depth: 1,
      openIds: new Set(['bags']),
      node: buildPageNode({
        id: 'bags',
        title: 'Bags',
        children: [buildPageNode({ id: 'totes', title: 'Totes' })],
      }),
    });
    expect(await screen.findByText('Totes')).toBeInTheDocument();
  });

  it('highlights the selected node', async () => {
    const plain = setup({ selectedId: undefined });
    const plainClass = (await plain.findByText('Homepage')).closest(
      'div'
    )!.className;
    plain.unmount();

    const selected = setup({ selectedId: 'home' });
    const selectedClass = (await selected.findByText('Homepage')).closest(
      'div'
    )!.className;

    expect(selectedClass).not.toBe(plainClass);
  });
});

describe('PageTreeRow assignment badges', () => {
  const withStates = (states: Array<[string, 'draft' | 'published']>) =>
    setup({
      node: buildPageNode({ id: 'shoes', title: 'Shoes', type: 'category' }),
      builtPageStates: new Map(states),
    });

  it('shows no badge for a category with no assignments', async () => {
    withStates([]);
    await screen.findByText('Shoes');
    expect(screen.queryByText('PLP')).not.toBeInTheDocument();
    expect(screen.queryByText('PDP')).not.toBeInTheDocument();
  });

  it('marks a PLP-only assignment', async () => {
    withStates([['shoes', 'draft']]);
    expect(await screen.findByText('PLP')).toBeInTheDocument();
  });

  it('marks a PDP-only assignment', async () => {
    withStates([['pdp-shoes', 'draft']]);
    expect(await screen.findByText('PDP')).toBeInTheDocument();
  });

  it('marks both as All', async () => {
    withStates([
      ['shoes', 'draft'],
      ['pdp-shoes', 'draft'],
    ]);
    expect(await screen.findByText('All')).toBeInTheDocument();
  });

  it('reports published only when every assignment is published', async () => {
    withStates([
      ['shoes', 'published'],
      ['pdp-shoes', 'published'],
    ]);
    expect(await screen.findByText('published')).toBeInTheDocument();
  });

  it('reports draft when any assignment is still a draft', async () => {
    withStates([
      ['shoes', 'published'],
      ['pdp-shoes', 'draft'],
    ]);
    expect(await screen.findByText('draft')).toBeInTheDocument();
  });
});
