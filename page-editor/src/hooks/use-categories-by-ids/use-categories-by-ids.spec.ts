import { useCategoriesByIds } from './use-categories-by-ids';
import { renderHookWithProviders, waitFor } from '../../test-utils/render';
import {
  installMockServer,
  respondUsing,
  respondWith,
} from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';

installMockServer();

// Mirrors exactly what the query selects. `key` matters: Apollo's cache keys
// Category on it, and omitting it makes normalization fail loudly.
const category = (
  id: string,
  name: string | null,
  ancestors: Array<{ id: string; name: string | null }> = [],
  key: string | null = null
) => ({
  __typename: 'Category',
  id,
  key,
  name,
  ancestors: ancestors.map((a) => ({
    __typename: 'Category',
    key: null,
    ...a,
  })),
});

const returns = (...results: unknown[]) =>
  server.use(
    respondWith('FetchCategoriesByIds', {
      categories: { __typename: 'CategoryQueryResult', results },
    })
  );

const render = (ids: string[], locale = 'en-US') =>
  renderHookWithProviders(() => useCategoriesByIds(ids, locale));

describe('useCategoriesByIds', () => {
  it('queries nothing for an empty id list', () => {
    const { result } = render([]);
    expect(result.current).toEqual({});
  });

  it('returns the name and a single-part breadcrumb for a root category', async () => {
    returns(category('c1', 'Shoes'));

    const { result } = render(['c1']);
    await waitFor(() => expect(result.current.c1).toBeDefined());
    expect(result.current.c1).toEqual({ name: 'Shoes', breadcrumb: 'Shoes' });
  });

  it('joins ancestors into a breadcrumb, outermost first', async () => {
    returns(
      category('c1', 'Boots', [
        { id: 'a1', name: 'Footwear' },
        { id: 'a2', name: 'Shoes' },
      ])
    );

    const { result } = render(['c1']);
    await waitFor(() => expect(result.current.c1).toBeDefined());
    expect(result.current.c1.breadcrumb).toBe('Footwear / Shoes / Boots');
  });

  it('falls back to an ancestor id when it has no name', async () => {
    returns(category('c1', 'Boots', [{ id: 'a1', name: null }]));

    const { result } = render(['c1']);
    await waitFor(() => expect(result.current.c1).toBeDefined());
    expect(result.current.c1.breadcrumb).toBe('a1 / Boots');
  });

  it('omits an unnamed leaf from the breadcrumb but keeps its ancestors', async () => {
    returns(category('c1', null, [{ id: 'a1', name: 'Footwear' }]));

    const { result } = render(['c1']);
    await waitFor(() => expect(result.current.c1).toBeDefined());
    expect(result.current.c1).toEqual({ name: null, breadcrumb: 'Footwear' });
  });

  it('reports a null breadcrumb when there is nothing to show', async () => {
    returns(category('c1', null));

    const { result } = render(['c1']);
    await waitFor(() => expect(result.current.c1).toBeDefined());
    expect(result.current.c1).toEqual({ name: null, breadcrumb: null });
  });

  it('builds an `id in (...)` predicate sized to the request', async () => {
    let seen: Record<string, unknown> = {};
    server.use(
      respondUsing('FetchCategoriesByIds', (variables) => {
        seen = variables;
        return {
          categories: { __typename: 'CategoryQueryResult', results: [] },
        };
      })
    );

    render(['c1', 'c2']);
    await waitFor(() => expect(seen.where).toBeDefined());
    expect(seen.where).toBe('id in ("c1", "c2")');
    expect(seen.limit).toBe(2);
  });

  it('omits ids the query did not return', async () => {
    returns(category('c1', 'Shoes'));

    const { result } = render(['c1', 'gone']);
    await waitFor(() => expect(result.current.c1).toBeDefined());
    expect(result.current.gone).toBeUndefined();
  });
});
