import { useProductsByIds } from './use-products-by-ids';
import { renderHookWithProviders, waitFor } from '../../test-utils/render';
import {
  installMockServer,
  respondUsing,
  respondWith,
} from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';

installMockServer();

const product = (
  id: string,
  over: {
    currentName?: string | null;
    stagedName?: string | null;
    currentImage?: string | null;
    stagedImage?: string | null;
  } = {}
) => ({
  __typename: 'Product',
  id,
  masterData: {
    __typename: 'ProductCatalogData',
    current:
      over.currentName === undefined && over.currentImage === undefined
        ? null
        : {
            __typename: 'ProductData',
            name: over.currentName ?? null,
            allVariants: [
              {
                __typename: 'ProductVariant',
                // The app keys ProductVariant on sku+key, so both must be present
                // or Apollo cannot normalize the result.
                sku: `${id}-sku`,
                key: `${id}-key`,
                images: over.currentImage
                  ? [{ __typename: 'Image', url: over.currentImage }]
                  : [],
              },
            ],
          },
    staged:
      over.stagedName === undefined && over.stagedImage === undefined
        ? null
        : {
            __typename: 'ProductData',
            name: over.stagedName ?? null,
            allVariants: [
              {
                __typename: 'ProductVariant',
                sku: `${id}-staged-sku`,
                key: `${id}-staged-key`,
                images: over.stagedImage
                  ? [{ __typename: 'Image', url: over.stagedImage }]
                  : [],
              },
            ],
          },
  },
});

const returns = (...results: unknown[]) =>
  server.use(
    respondWith('FetchProductsByIds', {
      products: { __typename: 'ProductQueryResult', results },
    })
  );

const render = (ids: string[], locale = 'en-US') =>
  renderHookWithProviders(() => useProductsByIds(ids, locale));

describe('useProductsByIds', () => {
  it('queries nothing for an empty id list', async () => {
    // No handler registered — an unhandled request would fail the test, so this
    // also proves `skip` really skips.
    const { result } = render([]);
    expect(result.current).toEqual({});
  });

  it('maps a product to its display name and first image', async () => {
    returns(
      product('p1', { currentName: 'Boots', currentImage: 'https://img/1.jpg' })
    );

    const { result } = render(['p1']);
    await waitFor(() => expect(result.current.p1).toBeDefined());
    expect(result.current.p1).toEqual({
      name: 'Boots',
      imageUrl: 'https://img/1.jpg',
    });
  });

  it('falls back to staged data when there is no current version', async () => {
    returns(
      product('p1', {
        stagedName: 'Draft boots',
        stagedImage: 'https://img/s.jpg',
      })
    );

    const { result } = render(['p1']);
    await waitFor(() => expect(result.current.p1).toBeDefined());
    expect(result.current.p1).toEqual({
      name: 'Draft boots',
      imageUrl: 'https://img/s.jpg',
    });
  });

  it('prefers current over staged', async () => {
    returns(
      product('p1', {
        currentName: 'Published',
        currentImage: 'https://img/c.jpg',
        stagedName: 'Draft',
        stagedImage: 'https://img/s.jpg',
      })
    );

    const { result } = render(['p1']);
    await waitFor(() => expect(result.current.p1).toBeDefined());
    expect(result.current.p1.name).toBe('Published');
    expect(result.current.p1.imageUrl).toBe('https://img/c.jpg');
  });

  it('reports nulls for a product with no name or image', async () => {
    returns(product('p1', { currentName: null }));

    const { result } = render(['p1']);
    await waitFor(() => expect(result.current.p1).toBeDefined());
    expect(result.current.p1).toEqual({ name: null, imageUrl: null });
  });

  it('keys several products by id', async () => {
    returns(
      product('p1', { currentName: 'One' }),
      product('p2', { currentName: 'Two' })
    );

    const { result } = render(['p1', 'p2']);
    await waitFor(() => expect(Object.keys(result.current)).toHaveLength(2));
    expect(result.current.p2.name).toBe('Two');
  });

  it('builds an `id in (...)` predicate and asks for exactly as many as requested', async () => {
    let seen: Record<string, unknown> = {};
    server.use(
      respondUsing('FetchProductsByIds', (variables) => {
        seen = variables;
        return { products: { __typename: 'ProductQueryResult', results: [] } };
      })
    );

    const { result } = render(['p1', 'p2']);
    await waitFor(() => expect(seen.where).toBeDefined());
    expect(seen.where).toBe('id in ("p1", "p2")');
    expect(seen.limit).toBe(2);
    expect(seen.locale).toBe('en-US');
    expect(result.current).toEqual({});
  });

  it('omits ids the query did not return', async () => {
    returns(product('p1', { currentName: 'One' }));

    const { result } = render(['p1', 'gone']);
    await waitFor(() => expect(result.current.p1).toBeDefined());
    expect(result.current.gone).toBeUndefined();
  });
});
