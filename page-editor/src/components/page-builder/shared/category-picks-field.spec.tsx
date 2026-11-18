import CategoryPicksField from './category-picks-field';
import type { CategoryPick } from './category-picks-field';
import {
  renderWithProviders,
  screen,
  within,
} from '../../../test-utils/render';
import { installMockServer, respondWith } from '../../../test-utils/msw';
import { server } from '../../../test-utils/msw/server';

installMockServer();

const byIdReturns = (...ids: string[]) =>
  server.use(
    respondWith('FetchCategoriesByIds', {
      categories: {
        __typename: 'CategoryQueryResult',
        results: ids.map((id) => ({
          __typename: 'Category',
          id,
          key: `${id}-key`,
          name: `Category ${id}`,
          ancestors: [],
        })),
      },
    })
  );

const searchReturns = (...ids: string[]) =>
  server.use(
    respondWith('CategorySearch', {
      categorySearch: {
        __typename: 'CategorySearchResult',
        results: ids.map((id) => ({
          __typename: 'CategorySearch',
          id,
          key: `${id}-key`,
          name: `Category ${id}`,
          ancestors: [],
        })),
      },
    })
  );

const pick = (id: string): CategoryPick => ({ id, key: `${id}-key` });

const setup = (value: CategoryPick[] = []) => {
  const onChange = jest.fn();
  const rendered = renderWithProviders(
    <CategoryPicksField value={value} onChange={onChange} />
  );
  return { onChange, ...rendered };
};

const rowFor = async (id: string) => {
  let node: HTMLElement | null = (
    await screen.findAllByText(`Category ${id}`)
  )[0];
  while (node) {
    if (
      within(node).queryAllByRole('button', { name: 'Remove category' })
        .length === 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  throw new Error(`no row for ${id}`);
};

describe('CategoryPicksField when empty', () => {
  it('explains what the field is for', async () => {
    setup();
    expect(
      await screen.findByText(/No categories picked yet/i)
    ).toBeInTheDocument();
  });

  it('treats a non-array value as empty', async () => {
    setup('nonsense' as unknown as CategoryPick[]);
    expect(
      await screen.findByText(/No categories picked yet/i)
    ).toBeInTheDocument();
  });

  it('offers to add a category', async () => {
    setup();
    expect(
      await screen.findByRole('button', { name: 'Add category' })
    ).toBeInTheDocument();
  });
});

describe('CategoryPicksField with picks', () => {
  it('lists the picked categories', async () => {
    byIdReturns('c1', 'c2');
    setup([pick('c1'), pick('c2')]);

    expect((await screen.findAllByText('Category c1')).length).toBeGreaterThan(
      0
    );
    expect(screen.getAllByText('Category c2').length).toBeGreaterThan(0);
  });

  it('removes the category whose remove button is pressed', async () => {
    byIdReturns('c1', 'c2');
    const { user, onChange } = setup([pick('c1'), pick('c2')]);

    const row = await rowFor('c1');
    await user.click(
      within(row).getByRole('button', { name: 'Remove category' })
    );

    expect(onChange).toHaveBeenCalledWith([pick('c2')]);
  });

  it('reorders with the move controls', async () => {
    byIdReturns('c1', 'c2');
    const { user, onChange } = setup([pick('c1'), pick('c2')]);

    const row = await rowFor('c1');
    await user.click(within(row).getByRole('button', { name: 'Move down' }));

    expect(onChange).toHaveBeenCalledWith([pick('c2'), pick('c1')]);
  });

  it('will not move the first entry up', async () => {
    byIdReturns('c1', 'c2');
    const { user, onChange } = setup([pick('c1'), pick('c2')]);

    const row = await rowFor('c1');
    await user
      .click(within(row).getByRole('button', { name: 'Move up' }))
      .catch(() => undefined);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('CategoryPicksField adding', () => {
  it('appends a category chosen from the inline search', async () => {
    byIdReturns('c1');
    searchReturns('c9');
    const { user, onChange } = setup([pick('c1')]);

    await user.click(
      await screen.findByRole('button', { name: 'Add category' })
    );
    await user.type(
      await screen.findByRole('textbox', { name: 'Filter categories…' }),
      'c9'
    );
    await user.click(await screen.findByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenCalledWith([pick('c1'), pick('c9')]);
  });

  it('marks an already-picked category as added', async () => {
    byIdReturns('c1');
    searchReturns('c1');
    const { user, onChange } = setup([pick('c1')]);

    await user.click(
      await screen.findByRole('button', { name: 'Add category' })
    );
    await user.type(
      await screen.findByRole('textbox', { name: 'Filter categories…' }),
      'c1'
    );

    const added = await screen.findByRole('button', { name: 'Added' });
    expect(added).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('says so when the search matches nothing', async () => {
    searchReturns();
    const { user } = setup();

    await user.click(
      await screen.findByRole('button', { name: 'Add category' })
    );
    await user.type(
      await screen.findByRole('textbox', { name: 'Filter categories…' }),
      'nothing'
    );
    expect(
      await screen.findByText('No categories match your search.')
    ).toBeInTheDocument();
  });
});
