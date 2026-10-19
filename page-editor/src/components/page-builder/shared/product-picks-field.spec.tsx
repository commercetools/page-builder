import ProductPicksField from './product-picks-field';
import type { ProductPick } from './product-picks-field';
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

const pick = (id: string): ProductPick => ({
  id,
  key: `${id}-key`,
  sku: `${id}-sku`,
});

const setup = (value: ProductPick[] = []) => {
  const onChange = jest.fn();
  const rendered = renderWithProviders(
    <ProductPicksField value={value} onChange={onChange} />
  );
  return { onChange, ...rendered };
};

/** The row for a given picked product. */
const rowFor = async (id: string) =>
  (await screen.findByText(`Product ${id}`)).closest('div')!.parentElement!;

describe('ProductPicksField when empty', () => {
  it('explains what the field is for', async () => {
    setup();
    expect(await screen.findByText(/no products/i)).toBeInTheDocument();
  });

  it('treats a non-array value as empty', async () => {
    setup('nonsense' as unknown as ProductPick[]);
    expect(await screen.findByText(/no products/i)).toBeInTheDocument();
  });

  it('offers to add a product', async () => {
    setup();
    expect(
      await screen.findByRole('button', { name: 'Add product' })
    ).toBeInTheDocument();
  });
});

describe('ProductPicksField with picks', () => {
  it('lists the picked products in order', async () => {
    byIdReturns('p1', 'p2');
    setup([pick('p1'), pick('p2')]);

    expect(await screen.findByText('Product p1')).toBeInTheDocument();
    expect(screen.getByText('Product p2')).toBeInTheDocument();
  });

  it('removes the product whose remove button is pressed', async () => {
    byIdReturns('p1', 'p2');
    const { user, onChange } = setup([pick('p1'), pick('p2')]);

    const row = await rowFor('p1');
    await user.click(
      within(row).getByRole('button', { name: 'Remove product' })
    );

    expect(onChange).toHaveBeenCalledWith([pick('p2')]);
  });

  it('moves a product down', async () => {
    byIdReturns('p1', 'p2');
    const { user, onChange } = setup([pick('p1'), pick('p2')]);

    const row = await rowFor('p1');
    await user.click(within(row).getByRole('button', { name: 'Move down' }));

    expect(onChange).toHaveBeenCalledWith([pick('p2'), pick('p1')]);
  });

  it('moves a product up', async () => {
    byIdReturns('p1', 'p2');
    const { user, onChange } = setup([pick('p1'), pick('p2')]);

    const row = await rowFor('p2');
    await user.click(within(row).getByRole('button', { name: 'Move up' }));

    expect(onChange).toHaveBeenCalledWith([pick('p2'), pick('p1')]);
  });

  it('cannot move the first product up', async () => {
    byIdReturns('p1', 'p2');
    const { user, onChange } = setup([pick('p1'), pick('p2')]);

    const row = await rowFor('p1');
    const up = within(row).getByRole('button', { name: 'Move up' });
    // Either disabled, or a no-op — both are acceptable; what matters is that
    // the order does not change.
    await user.click(up).catch(() => undefined);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cannot move the last product down', async () => {
    byIdReturns('p1', 'p2');
    const { user, onChange } = setup([pick('p1'), pick('p2')]);

    const row = await rowFor('p2');
    await user
      .click(within(row).getByRole('button', { name: 'Move down' }))
      .catch(() => undefined);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ProductPicksField adding', () => {
  /** Open the inline search and type a query. */
  const search = async (
    user: {
      click: (el: Element) => Promise<void>;
      type: (el: Element, t: string) => Promise<void>;
    },
    query: string
  ) => {
    await user.click(
      await screen.findByRole('button', { name: 'Add product' })
    );
    await user.type(
      await screen.findByRole('textbox', { name: 'Search products…' }),
      query
    );
  };

  it('appends a product chosen from the inline search', async () => {
    byIdReturns('p1');
    searchReturns('p9');
    const { user, onChange } = setup([pick('p1')]);

    await search(user, 'p9');
    await user.click(await screen.findByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenCalledWith([
      pick('p1'),
      { id: 'p9', key: 'p9-key', sku: 'p9-sku' },
    ]);
  });

  it('marks an already-picked product as added, and refuses to add it again', async () => {
    // Reaching this state means the same Product is written to the Apollo cache
    // by both FetchProductsByIds and SearchProducts, whose `allVariants` field
    // arguments differ — Apollo warns about the overwrite because
    // ProductCatalogData has no id and no merge function. Real, and reachable
    // in the app.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    byIdReturns('p1');
    searchReturns('p1');
    const { user, onChange } = setup([pick('p1')]);

    await search(user, 'p1');

    const added = await screen.findByRole('button', { name: 'Added' });
    expect(added).toBeDisabled();
    await user.click(added).catch(() => undefined);
    expect(onChange).not.toHaveBeenCalled();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('go.apollo.dev/c/err')
    );
    warn.mockRestore();
  });

  it('says so when the search matches nothing', async () => {
    searchReturns();
    const { user } = setup();

    await search(user, 'nothing');
    // Both the field's empty state and the search's no-results line show;
    // the second one is what this asserts.
    expect((await screen.findAllByText(/no products/i)).length).toBeGreaterThan(
      1
    );
  });
});
