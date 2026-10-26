import ProductPinsField from './product-pins-field';
import type { ProductPin } from './product-pins-field';
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
    respondWith('FetchProductsByIds', {
      products: {
        __typename: 'ProductQueryResult',
        results: ids.map((id) => ({
          __typename: 'Product',
          id,
          masterData: {
            __typename: 'ProductCatalogData',
            current: {
              __typename: 'ProductData',
              name: `Product ${id}`,
              allVariants: [
                {
                  __typename: 'ProductVariant',
                  sku: `${id}-sku`,
                  key: `${id}-key`,
                  images: [],
                },
              ],
            },
            staged: null,
          },
        })),
      },
    })
  );

const searchReturns = (...ids: string[]) =>
  server.use(
    respondWith('SearchProducts', {
      productsSearch: {
        __typename: 'ProductSearchQueryResult',
        results: ids.map((id) => ({
          __typename: 'ProductSearchResult',
          id,
          product: {
            __typename: 'Product',
            id,
            key: `${id}-key`,
            masterData: {
              __typename: 'ProductCatalogData',
              current: {
                __typename: 'ProductData',
                name: `Product ${id}`,
                allVariants: [
                  {
                    __typename: 'ProductVariant',
                    id: 1,
                    sku: `${id}-sku`,
                    key: `${id}-v1`,
                    images: [],
                  },
                ],
              },
            },
          },
        })),
      },
    })
  );

const pin = (id: string, position: number): ProductPin => ({
  position,
  id,
  key: `${id}-key`,
  sku: `${id}-sku`,
});

const setup = (value: ProductPin[] = [], limit?: number) => {
  const onChange = jest.fn();
  const rendered = renderWithProviders(
    <ProductPinsField value={value} onChange={onChange} limit={limit} />
  );
  return { onChange, ...rendered };
};

/** The pin row for a product: the nearest ancestor holding exactly one remove button. */
const rowFor = async (id: string) => {
  let node: HTMLElement | null = await screen.findByText(`Product ${id}`);
  while (node) {
    if (
      within(node).queryAllByRole('button', { name: 'Remove pin' }).length === 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  throw new Error(`no pin row found for ${id}`);
};

describe('ProductPinsField when empty', () => {
  it('explains that unpinned slots are filled by the query', async () => {
    setup();
    expect(await screen.findByText(/No products pinned/i)).toBeInTheDocument();
  });

  it('names the configured limit', async () => {
    setup([], 3);
    expect(await screen.findByText(/All 3 positions/i)).toBeInTheDocument();
  });

  it('defaults the limit to eight', async () => {
    setup();
    expect(await screen.findByText(/All 8 positions/i)).toBeInTheDocument();
  });

  it('falls back to eight for a nonsensical limit', async () => {
    setup([], 0);
    expect(await screen.findByText(/All 8 positions/i)).toBeInTheDocument();
  });

  it('treats a non-array value as no pins', async () => {
    setup('nonsense' as unknown as ProductPin[]);
    expect(await screen.findByText(/No products pinned/i)).toBeInTheDocument();
  });
});

describe('ProductPinsField with pins', () => {
  it('lists the pinned products', async () => {
    byIdReturns('p1', 'p2');
    setup([pin('p1', 1), pin('p2', 2)]);

    expect(await screen.findByText('Product p1')).toBeInTheDocument();
    expect(screen.getByText('Product p2')).toBeInTheDocument();
  });

  it('sorts pins by position regardless of array order', async () => {
    byIdReturns('p1', 'p2');
    const { container } = setup([pin('p2', 2), pin('p1', 1)]);
    await screen.findByText('Product p1');

    const text = container.textContent ?? '';
    expect(text.indexOf('Product p1')).toBeLessThan(text.indexOf('Product p2'));
  });

  it('removes the pin whose remove button is pressed', async () => {
    byIdReturns('p1', 'p2');
    const { user, onChange } = setup([pin('p1', 1), pin('p2', 2)]);

    const row = await rowFor('p1');
    await user.click(within(row).getByRole('button', { name: 'Remove pin' }));

    expect(onChange).toHaveBeenCalledWith([pin('p2', 2)]);
  });
});

describe('ProductPinsField positions', () => {
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

  it('moves a pin to a free position', async () => {
    byIdReturns('p1');
    const { user, onChange } = setup([pin('p1', 1)], 8);

    const row = await rowFor('p1');
    await setPosition(
      user,
      within(row).getByRole('textbox', { name: 'Position' }),
      '5'
    );

    expect(onChange).toHaveBeenCalledWith([{ ...pin('p1', 5) }]);
  });

  it('swaps with whichever pin already holds the target position', async () => {
    byIdReturns('p1', 'p2');
    const { user, onChange } = setup([pin('p1', 1), pin('p2', 2)], 8);

    const row = await rowFor('p1');
    await setPosition(
      user,
      within(row).getByRole('textbox', { name: 'Position' }),
      '2'
    );

    expect(onChange).toHaveBeenCalledWith([pin('p2', 1), pin('p1', 2)]);
  });

  it('clamps a position beyond the limit', async () => {
    byIdReturns('p1');
    const { user, onChange } = setup([pin('p1', 1)], 3);

    const row = await rowFor('p1');
    await setPosition(
      user,
      within(row).getByRole('textbox', { name: 'Position' }),
      '99'
    );

    expect(onChange).toHaveBeenCalledWith([pin('p1', 3)]);
  });
});

describe('ProductPinsField adding', () => {
  it('pins a product into the first free position', async () => {
    byIdReturns('p1');
    searchReturns('p9');
    const { user, onChange } = setup([pin('p1', 1)], 8);

    await user.click(await screen.findByRole('button', { name: 'Add pin' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'Search products…' }),
      'p9'
    );
    await user.click(await screen.findByRole('button', { name: 'Pin' }));

    expect(onChange).toHaveBeenCalledWith([
      pin('p1', 1),
      { position: 2, id: 'p9', key: 'p9-key', sku: 'p9-sku' },
    ]);
  });

  it('fills a gap left by a removed pin', async () => {
    byIdReturns('p1');
    searchReturns('p9');
    const { user, onChange } = setup([pin('p1', 2)], 8);

    await user.click(await screen.findByRole('button', { name: 'Add pin' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'Search products…' }),
      'p9'
    );
    await user.click(await screen.findByRole('button', { name: 'Pin' }));

    // Position 1 is free, and the result stays position-sorted.
    expect(onChange).toHaveBeenCalledWith([
      { position: 1, id: 'p9', key: 'p9-key', sku: 'p9-sku' },
      pin('p1', 2),
    ]);
  });

  it('refuses to pin more products than there are positions', async () => {
    byIdReturns('p1');
    searchReturns('p9');
    const { onChange } = setup([pin('p1', 1)], 1);

    // Every position is taken, so adding is not offered.
    await screen.findByText('Product p1');
    expect(
      screen.queryByRole('button', { name: 'Add pin' })
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText(/All positions pinned/i)
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
