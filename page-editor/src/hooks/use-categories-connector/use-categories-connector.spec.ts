import { useCategoriesFetcher } from './use-categories-connector';
import { renderHookWithProviders, waitFor } from '../../test-utils/render';
import {
  installMockServer,
  failOperation,
  respondWith,
} from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';

installMockServer();

type Raw = {
  id: string;
  key?: string | null;
  name?: string | null;
  slug?: string | null;
  childCount?: number;
  parentId?: string | null;
};

const raw = ({
  id,
  key = null,
  name = null,
  slug = null,
  childCount = 0,
  parentId = null,
}: Raw) => ({
  __typename: 'Category',
  id,
  key,
  name,
  slug,
  childCount,
  parent: parentId ? { __typename: 'Category', id: parentId, key: null } : null,
});

const returns = (...results: unknown[]) =>
  server.use(
    respondWith('FetchCategories', {
      categories: {
        __typename: 'CategoryQueryResult',
        total: results.length,
        results,
      },
    })
  );

const render = (locale = 'en-US') =>
  renderHookWithProviders(() => useCategoriesFetcher(locale));

describe('useCategoriesFetcher', () => {
  it('reports no nodes for a project with no categories', async () => {
    returns();

    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.nodes).toEqual([]);
  });

  it('maps a flat list of roots', async () => {
    returns(
      raw({ id: 'c1', name: 'Shoes', slug: 'shoes', key: 'shoes-key' }),
      raw({ id: 'c2', name: 'Bags' })
    );

    const { result } = render();
    await waitFor(() => expect(result.current.nodes).toHaveLength(2));

    expect(result.current.nodes[0]).toEqual({
      id: 'c1',
      key: 'shoes-key',
      title: 'Shoes',
      type: 'category',
      icon: 'Folder',
      children: undefined,
      slug: 'shoes',
    });
  });

  it('nests children under their parent', async () => {
    returns(
      raw({ id: 'root', name: 'Footwear', childCount: 1 }),
      raw({ id: 'child', name: 'Boots', parentId: 'root' })
    );

    const { result } = render();
    await waitFor(() => expect(result.current.nodes).toHaveLength(1));

    expect(result.current.nodes[0].children).toHaveLength(1);
    expect(result.current.nodes[0].children![0].id).toBe('child');
  });

  it('nests several levels deep', async () => {
    returns(
      raw({ id: 'a', name: 'A', childCount: 1 }),
      raw({ id: 'b', name: 'B', parentId: 'a', childCount: 1 }),
      raw({ id: 'c', name: 'C', parentId: 'b' })
    );

    const { result } = render();
    await waitFor(() => expect(result.current.nodes).toHaveLength(1));
    expect(result.current.nodes[0].children![0].children![0].id).toBe('c');
  });

  it('leaves children undefined rather than empty when a node has none', async () => {
    returns(raw({ id: 'c1', name: 'Shoes' }));

    const { result } = render();
    await waitFor(() => expect(result.current.nodes).toHaveLength(1));
    expect(result.current.nodes[0].children).toBeUndefined();
  });

  it('leaves children undefined when childCount lies and no child was returned', async () => {
    // childCount can exceed what fits in one page of results.
    returns(raw({ id: 'c1', name: 'Shoes', childCount: 3 }));

    const { result } = render();
    await waitFor(() => expect(result.current.nodes).toHaveLength(1));
    expect(result.current.nodes[0].children).toBeUndefined();
  });

  it('falls back from name to key to id for the title', async () => {
    returns(
      raw({ id: 'c1', name: null, key: 'the-key' }),
      raw({ id: 'c2', name: null, key: null })
    );

    const { result } = render();
    await waitFor(() => expect(result.current.nodes).toHaveLength(2));
    expect(result.current.nodes[0].title).toBe('the-key');
    expect(result.current.nodes[1].title).toBe('c2');
  });

  it('drops a child whose parent is not in the result set', async () => {
    // Only roots (parent === null) seed the tree, so an orphan is not shown twice.
    returns(raw({ id: 'orphan', name: 'Orphan', parentId: 'missing' }));

    const { result } = render();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.nodes).toEqual([]);
  });

  it('surfaces a query error', async () => {
    server.use(failOperation('FetchCategories', 'nope'));

    const { result } = render();
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.nodes).toEqual([]);
  });
});
