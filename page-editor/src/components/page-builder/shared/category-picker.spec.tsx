import CategoryPicker from './category-picker';
import {
  renderWithProviders,
  screen,
  waitFor,
} from '../../../test-utils/render';
import { installMockServer, respondWith } from '../../../test-utils/msw';
import { server } from '../../../test-utils/msw/server';

installMockServer();

const searchHit = (
  id: string,
  over: { name?: string | null; key?: string | null; ancestor?: string } = {}
) => ({
  __typename: 'CategorySearch',
  id,
  key: over.key === undefined ? `${id}-key` : over.key,
  name: over.name === undefined ? `Category ${id}` : over.name,
  ancestors: over.ancestor
    ? [{ __typename: 'CategorySearch', id: 'a1', name: over.ancestor }]
    : [],
});

const searchReturns = (...results: unknown[]) =>
  server.use(
    respondWith('CategorySearch', {
      categorySearch: { __typename: 'CategorySearchResult', results },
    })
  );

const byIdReturns = (
  id: string,
  over: { name?: string | null; ancestor?: string } = {}
) =>
  server.use(
    respondWith('FetchCategoriesByIds', {
      categories: {
        __typename: 'CategoryQueryResult',
        results: [
          {
            __typename: 'Category',
            id,
            key: null,
            name: over.name === undefined ? `Category ${id}` : over.name,
            ancestors: over.ancestor
              ? [
                  {
                    __typename: 'Category',
                    id: 'a1',
                    key: null,
                    name: over.ancestor,
                  },
                ]
              : [],
          },
        ],
      },
    })
  );

const setup = (over: Partial<Parameters<typeof CategoryPicker>[0]> = {}) => {
  const onChange = jest.fn();
  const rendered = renderWithProviders(
    <CategoryPicker value="" onChange={onChange} {...over} />
  );
  return { onChange, ...rendered };
};

const searchBox = () =>
  screen.findByRole('textbox', { name: 'Search categories…' });

/**
 * A root category's breadcrumb is just its own name, so the name appears twice
 * in a result row. Address the row itself rather than either text node.
 */
const resultRow = async (name: string) => {
  const matches = await screen.findAllByText(name);
  return matches[0].closest('button') as HTMLElement;
};

describe('CategoryPicker when nothing is chosen', () => {
  it('offers a labelled search box', async () => {
    setup();
    expect(await searchBox()).toBeInTheDocument();
  });

  it('lists matching categories as you type', async () => {
    searchReturns(searchHit('c1', { name: 'Boots' }));
    const { user } = setup();

    await user.type(await searchBox(), 'boot');
    expect(await resultRow('Boots')).toBeInTheDocument();
  });

  it('shows the breadcrumb of a nested category', async () => {
    searchReturns(searchHit('c1', { name: 'Boots', ancestor: 'Shoes' }));
    const { user } = setup();

    await user.type(await searchBox(), 'boot');
    expect(await screen.findByText('Shoes / Boots')).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    searchReturns();
    const { user } = setup();

    await user.type(await searchBox(), 'nothing');
    expect(
      await screen.findByText('No categories match your search.')
    ).toBeInTheDocument();
  });

  it('reports the category that was picked', async () => {
    searchReturns(searchHit('c1', { name: 'Boots' }));
    const { user, onChange } = setup();

    await user.type(await searchBox(), 'boot');
    await user.click(await resultRow('Boots'));

    expect(onChange).toHaveBeenCalledWith({ id: 'c1', key: 'c1-key' });
  });

  it('reports no key when the category has none', async () => {
    searchReturns(searchHit('c1', { name: 'Boots', key: null }));
    const { user, onChange } = setup();

    await user.type(await searchBox(), 'boot');
    await user.click(await resultRow('Boots'));

    expect(onChange).toHaveBeenCalledWith({ id: 'c1', key: undefined });
  });

  it('falls back from name to key to id', async () => {
    searchReturns(searchHit('c1', { name: null, key: 'boots-key' }));
    const { user } = setup();

    await user.type(await searchBox(), 'x');
    expect(await screen.findByText('boots-key')).toBeInTheDocument();
  });

  it('shows no breadcrumb for a hit that has no name at all', async () => {
    searchReturns(searchHit('c1', { name: null, key: null }));
    const { user } = setup();

    await user.type(await searchBox(), 'x');
    expect(await screen.findByText('c1')).toBeInTheDocument();
  });

  it('closes the list on a click outside', async () => {
    searchReturns(searchHit('c1', { name: 'Boots' }));
    const { user } = setup();

    await user.type(await searchBox(), 'boot');
    await resultRow('Boots');

    await user.click(document.body);
    await waitFor(() =>
      expect(screen.queryByText('Boots')).not.toBeInTheDocument()
    );
  });
});

describe('CategoryPicker when a category is chosen', () => {
  it('shows the resolved category name', async () => {
    byIdReturns('c1', { name: 'Boots' });
    setup({ value: 'c1' });
    // Name plus the single-segment breadcrumb.
    expect(await screen.findAllByText('Boots')).toHaveLength(2);
  });

  it('shows the breadcrumb below the name', async () => {
    byIdReturns('c1', { name: 'Boots', ancestor: 'Shoes' });
    setup({ value: 'c1' });
    expect(await screen.findByText('Shoes / Boots')).toBeInTheDocument();
  });

  it('falls back to the key while the name is unresolved', async () => {
    byIdReturns('c1', { name: null });
    setup({ value: 'c1', valueKey: 'boots-key' });
    expect(await screen.findByText('boots-key')).toBeInTheDocument();
  });

  it('falls back to the id when there is no key either', async () => {
    byIdReturns('c1', { name: null });
    setup({ value: 'c1' });
    expect(await screen.findByText('c1')).toBeInTheDocument();
  });

  it('clears the selection', async () => {
    byIdReturns('c1', { name: 'Boots' });
    const { user, onChange } = setup({ value: 'c1' });

    await user.click(await screen.findByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('clears and reopens the search on Change', async () => {
    byIdReturns('c1', { name: 'Boots' });
    const { user, onChange } = setup({ value: 'c1' });

    await user.click(await screen.findByRole('button', { name: 'Change' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
