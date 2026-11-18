import CategoryPinsField from './category-pins-field';
import type { CategoryPin } from './category-pins-field';
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

const pin = (id: string, position: number): CategoryPin => ({
  position,
  id,
  key: `${id}-key`,
});

const setup = (value: CategoryPin[] = [], limit?: number) => {
  const onChange = jest.fn();
  const rendered = renderWithProviders(
    <CategoryPinsField value={value} onChange={onChange} limit={limit} />
  );
  return { onChange, ...rendered };
};

const rowFor = async (id: string) => {
  let node: HTMLElement | null = (
    await screen.findAllByText(`Category ${id}`)
  )[0];
  while (node) {
    if (
      within(node).queryAllByRole('button', { name: 'Unpin category' })
        .length === 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  throw new Error(`no pin row for ${id}`);
};

const setPosition = async (
  user: {
    clear: (el: Element) => Promise<void>;
    type: (el: Element, t: string) => Promise<void>;
    tab: () => Promise<void>;
  },
  field: Element,
  to: string
) => {
  await user.clear(field);
  await user.type(field, `${to}{Enter}`);
  await user.tab();
};

describe('CategoryPinsField when empty', () => {
  it('explains that unpinned slots fill automatically', async () => {
    setup();
    expect(
      await screen.findByText(/No categories pinned/i)
    ).toBeInTheDocument();
  });

  it('treats a non-array value as no pins', async () => {
    setup('nonsense' as unknown as CategoryPin[]);
    expect(
      await screen.findByText(/No categories pinned/i)
    ).toBeInTheDocument();
  });

  it('offers to pin a category', async () => {
    setup();
    expect(
      await screen.findByRole('button', { name: 'Pin a category' })
    ).toBeInTheDocument();
  });
});

describe('CategoryPinsField with pins', () => {
  it('lists the pinned categories', async () => {
    byIdReturns('c1', 'c2');
    setup([pin('c1', 1), pin('c2', 2)]);

    expect((await screen.findAllByText('Category c1')).length).toBeGreaterThan(
      0
    );
    expect(screen.getAllByText('Category c2').length).toBeGreaterThan(0);
  });

  it('sorts pins by position regardless of array order', async () => {
    byIdReturns('c1', 'c2');
    const { container } = setup([pin('c2', 2), pin('c1', 1)]);
    await screen.findAllByText('Category c1');

    const text = container.textContent ?? '';
    expect(text.indexOf('Category c1')).toBeLessThan(
      text.indexOf('Category c2')
    );
  });

  it('unpins the category whose button is pressed', async () => {
    byIdReturns('c1', 'c2');
    const { user, onChange } = setup([pin('c1', 1), pin('c2', 2)]);

    const row = await rowFor('c1');
    await user.click(
      within(row).getByRole('button', { name: 'Unpin category' })
    );

    expect(onChange).toHaveBeenCalledWith([pin('c2', 2)]);
  });

  it('moves a pin to a free position', async () => {
    byIdReturns('c1');
    const { user, onChange } = setup([pin('c1', 1)], 8);

    const row = await rowFor('c1');
    await setPosition(
      user,
      within(row).getByRole('textbox', { name: 'Position' }),
      '5'
    );

    expect(onChange).toHaveBeenCalledWith([pin('c1', 5)]);
  });

  it('swaps with the pin already holding the target position', async () => {
    byIdReturns('c1', 'c2');
    const { user, onChange } = setup([pin('c1', 1), pin('c2', 2)], 8);

    const row = await rowFor('c1');
    await setPosition(
      user,
      within(row).getByRole('textbox', { name: 'Position' }),
      '2'
    );

    expect(onChange).toHaveBeenCalledWith([pin('c2', 1), pin('c1', 2)]);
  });
});

describe('CategoryPinsField adding', () => {
  it('pins a category into the first free position', async () => {
    byIdReturns('c1');
    searchReturns('c9');
    const { user, onChange } = setup([pin('c1', 1)], 8);

    await user.click(
      await screen.findByRole('button', { name: 'Pin a category' })
    );
    await user.type(
      await screen.findByRole('textbox', { name: 'Filter categories…' }),
      'c9'
    );
    await user.click(await screen.findByRole('button', { name: 'Pin' }));

    expect(onChange).toHaveBeenCalledWith([pin('c1', 1), pin('c9', 2)]);
  });

  it('fills the gap left by an unpinned position', async () => {
    byIdReturns('c1');
    searchReturns('c9');
    const { user, onChange } = setup([pin('c1', 2)], 8);

    await user.click(
      await screen.findByRole('button', { name: 'Pin a category' })
    );
    await user.type(
      await screen.findByRole('textbox', { name: 'Filter categories…' }),
      'c9'
    );
    await user.click(await screen.findByRole('button', { name: 'Pin' }));

    expect(onChange).toHaveBeenCalledWith([pin('c9', 1), pin('c1', 2)]);
  });

  it('offers no add control once every position is taken', async () => {
    byIdReturns('c1');
    setup([pin('c1', 1)], 1);
    await screen.findAllByText('Category c1');

    expect(
      screen.queryByRole('button', { name: 'Pin a category' })
    ).not.toBeInTheDocument();
  });
});
