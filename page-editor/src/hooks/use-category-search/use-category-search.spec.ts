import { useCategorySearch } from './use-category-search';
import { renderHookWithProviders, waitFor } from '../../test-utils/render';
import {
  installMockServer,
  respondUsing,
  respondWith,
} from '../../test-utils/msw';
import { server } from '../../test-utils/msw/server';

installMockServer();

const hit = (
  id: string,
  name: string | null,
  ancestors: Array<{ id: string; name: string | null }> = [],
  key: string | null = null
) => ({
  __typename: 'CategorySearch',
  id,
  key,
  name,
  ancestors: ancestors.map((a) => ({ __typename: 'CategorySearch', ...a })),
});

const returns = (...results: unknown[]) =>
  server.use(
    respondWith('CategorySearch', {
      categorySearch: { __typename: 'CategorySearchResult', results },
    })
  );

const render = (text: string, locale = 'en-US') =>
  renderHookWithProviders(() => useCategorySearch(text, locale));

describe('useCategorySearch', () => {
  it('searches nothing for empty text', () => {
    const { result } = render('');
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('searches nothing for whitespace-only text', () => {
    const { result } = render('   ');
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('maps a hit to id, key, name and breadcrumb', async () => {
    returns(hit('c1', 'Boots', [{ id: 'a1', name: 'Shoes' }], 'boots'));

    const { result } = render('boot');
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0]).toEqual({
      id: 'c1',
      key: 'boots',
      name: 'Boots',
      breadcrumb: 'Shoes / Boots',
    });
  });

  it('trims the query text before searching', async () => {
    let seen: Record<string, unknown> = {};
    server.use(
      respondUsing('CategorySearch', (variables) => {
        seen = variables;
        return {
          categorySearch: { __typename: 'CategorySearchResult', results: [] },
        };
      })
    );

    render('  boots  ');
    await waitFor(() => expect(seen.fulltext).toBeDefined());
    expect(seen.fulltext).toEqual({ text: 'boots', locale: 'en-US' });
  });

  it('caps the result set', async () => {
    let seen: Record<string, unknown> = {};
    server.use(
      respondUsing('CategorySearch', (variables) => {
        seen = variables;
        return {
          categorySearch: { __typename: 'CategorySearchResult', results: [] },
        };
      })
    );

    render('boots');
    await waitFor(() => expect(seen.limit).toBeDefined());
    expect(seen.limit).toBe(20);
  });

  it('reports a null breadcrumb for an unnamed root hit', async () => {
    returns(hit('c1', null));

    const { result } = render('x');
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0].breadcrumb).toBeNull();
  });

  it('returns no results when nothing matches', async () => {
    returns();

    const { result } = render('nothing');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.results).toEqual([]);
  });
});
