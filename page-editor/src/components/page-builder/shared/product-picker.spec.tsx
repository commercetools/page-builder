import ProductPicker from './product-picker';
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
  over: { name?: string | null; sku?: string | null; url?: string } = {}
) => ({
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
        name: over.name === undefined ? `Product ${id}` : over.name,
        allVariants: [
          {
            __typename: 'ProductVariant',
            id: 1,
            sku: over.sku === undefined ? `SKU-${id}` : over.sku,
            key: `${id}-v1`,
            images: over.url ? [{ __typename: 'Image', url: over.url }] : [],
          },
        ],
      },
    },
  },
});

const searchReturns = (...results: unknown[]) =>
  server.use(
    respondWith('SearchProducts', {
      productsSearch: { __typename: 'ProductSearchQueryResult', results },
    })
  );

const byIdReturns = (
  id: string,
  over: { name?: string | null; url?: string | null } = {}
) =>
  server.use(
    respondWith('FetchProductsByIds', {
      products: {
        __typename: 'ProductQueryResult',
        results: [
          {
            __typename: 'Product',
            id,
            masterData: {
              __typename: 'ProductCatalogData',
              current: {
                __typename: 'ProductData',
                name: over.name === undefined ? `Product ${id}` : over.name,
                allVariants: [
                  {
                    __typename: 'ProductVariant',
                    sku: `${id}-sku`,
                    key: `${id}-key`,
                    images: over.url
                      ? [{ __typename: 'Image', url: over.url }]
                      : [],
                  },
                ],
              },
              staged: null,
            },
          },
        ],
      },
    })
  );

const setup = (over: Partial<Parameters<typeof ProductPicker>[0]> = {}) => {
  const onChange = jest.fn();
  const rendered = renderWithProviders(
    <ProductPicker value="" onChange={onChange} {...over} />
  );
  return { onChange, ...rendered };
};

describe('ProductPicker when nothing is chosen', () => {
  it('offers a labelled search box', async () => {
    setup();
    expect(
      await screen.findByRole('textbox', { name: 'Search products…' })
    ).toBeInTheDocument();
  });

  it('shows no result list until something is typed', async () => {
    setup();
    await screen.findByRole('textbox', { name: 'Search products…' });
    expect(screen.queryByText(/no products found/i)).not.toBeInTheDocument();
  });

  it('lists matching products as you type', async () => {
    searchReturns(searchHit('p1', { name: 'Leather boots' }));
    const { user } = setup();

    await user.type(
      await screen.findByRole('textbox', { name: 'Search products…' }),
      'boot'
    );

    expect(await screen.findByText('Leather boots')).toBeInTheDocument();
    expect(screen.getByText('SKU-p1')).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    searchReturns();
    const { user } = setup();

    await user.type(
      await screen.findByRole('textbox', { name: 'Search products…' }),
      'nothing'
    );
    expect(await screen.findByText(/no products found/i)).toBeInTheDocument();
  });

  it('reports the product that was picked', async () => {
    searchReturns(searchHit('p1', { name: 'Leather boots' }));
    const { user, onChange } = setup();

    await user.type(
      await screen.findByRole('textbox', { name: 'Search products…' }),
      'boot'
    );
    await user.click(await screen.findByText('Leather boots'));

    expect(onChange).toHaveBeenCalledWith({
      id: 'p1',
      key: 'p1-key',
      sku: 'SKU-p1',
    });
  });

  it('closes the list once a product is picked', async () => {
    searchReturns(searchHit('p1', { name: 'Leather boots' }));
    const { user } = setup();

    await user.type(
      await screen.findByRole('textbox', { name: 'Search products…' }),
      'boot'
    );
    await user.click(await screen.findByText('Leather boots'));

    await waitFor(() =>
      expect(screen.queryByText('Leather boots')).not.toBeInTheDocument()
    );
  });

  it('falls back to the product id when a hit has no name', async () => {
    searchReturns(searchHit('p1', { name: null }));
    const { user } = setup();

    await user.type(
      await screen.findByRole('textbox', { name: 'Search products…' }),
      'x'
    );
    expect(await screen.findByText('p1')).toBeInTheDocument();
  });

  it('shows a thumbnail when the product has one', async () => {
    searchReturns(
      searchHit('p1', { name: 'Leather boots', url: 'https://img/1.jpg' })
    );
    const { user } = setup();

    await user.type(
      await screen.findByRole('textbox', { name: 'Search products…' }),
      'boot'
    );
    await screen.findByText('Leather boots');
    expect(screen.getByRole('img', { name: 'Leather boots' })).toHaveAttribute(
      'src',
      'https://img/1.jpg'
    );
  });

  it('closes the list on a click outside', async () => {
    searchReturns(searchHit('p1', { name: 'Leather boots' }));
    const { user } = setup();

    await user.type(
      await screen.findByRole('textbox', { name: 'Search products…' }),
      'boot'
    );
    await screen.findByText('Leather boots');

    await user.click(document.body);
    await waitFor(() =>
      expect(screen.queryByText('Leather boots')).not.toBeInTheDocument()
    );
  });
});

describe('ProductPicker when a product is chosen', () => {
  it('shows the resolved product name', async () => {
    byIdReturns('p1', { name: 'Leather boots' });
    setup({ value: 'p1' });
    expect(await screen.findByText('Leather boots')).toBeInTheDocument();
  });

  it('falls back to the sku when the product has no name', async () => {
    // The sku then appears twice: as the display name and as the sku line.
    byIdReturns('p1', { name: null });
    setup({ value: 'p1', valueSku: 'SKU-1' });
    expect(await screen.findAllByText('SKU-1')).toHaveLength(2);
  });

  it('falls back to the product id when there is neither name nor sku', async () => {
    byIdReturns('p1', { name: null });
    setup({ value: 'p1' });
    expect(await screen.findByText('p1')).toBeInTheDocument();
  });

  it('shows the sku alongside the name', async () => {
    byIdReturns('p1', { name: 'Leather boots' });
    setup({ value: 'p1', valueSku: 'SKU-1' });
    await screen.findByText('Leather boots');
    expect(screen.getByText('SKU-1')).toBeInTheDocument();
  });

  it('shows the product image when there is one', async () => {
    byIdReturns('p1', { name: 'Leather boots', url: 'https://img/1.jpg' });
    setup({ value: 'p1' });
    expect(
      await screen.findByRole('img', { name: 'Leather boots' })
    ).toHaveAttribute('src', 'https://img/1.jpg');
  });

  it('clears the selection', async () => {
    byIdReturns('p1', { name: 'Leather boots' });
    const { user, onChange } = setup({ value: 'p1' });

    await user.click(await screen.findByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('clears the selection and reopens the search on Change', async () => {
    byIdReturns('p1', { name: 'Leather boots' });
    const { user, onChange } = setup({ value: 'p1' });

    await user.click(await screen.findByRole('button', { name: 'Change' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
