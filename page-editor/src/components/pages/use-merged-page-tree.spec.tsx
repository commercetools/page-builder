/* eslint-disable testing-library/no-node-access --
 * `.children` here is a field on PageNode / LayoutElement, not a DOM node.
 * These are pure data assertions; nothing renders. */
import type { ReactNode } from 'react';
import { IntlProvider } from 'react-intl';
import { renderHook } from '@testing-library/react';
import { useMergedPageTree } from './use-merged-page-tree';
import type { PageNode } from '../page-builder/types';

const wrapper = ({ children }: { children: ReactNode }) => (
  <IntlProvider locale="en">{children}</IntlProvider>
);

const category = (id: string, children?: PageNode[]): PageNode => ({
  id,
  title: id,
  type: 'category',
  children,
});

type Built = {
  pageId: string;
  title?: string;
  pageType?: string;
  path?: string;
};

const setup = (over: {
  loading?: boolean;
  nodes?: PageNode[];
  builtPages?: Built[];
}) =>
  renderHook(
    () =>
      useMergedPageTree({
        categoriesFetcher: {
          loading: over.loading ?? false,
          nodes: over.nodes ?? [],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        builtPages: (over.builtPages ?? []) as any,
      }),
    { wrapper }
  );

const catRoot = (tree: PageNode[]) => tree.find((n) => n.id === 'cat-root');

describe('category grafting', () => {
  it('grafts live categories under cat-root', () => {
    const { result } = setup({ nodes: [category('c1'), category('c2')] });
    expect(
      catRoot(result.current.pageTree)?.children?.map((n) => n.id)
    ).toEqual(['c1', 'c2']);
  });

  // Replacing the placeholder children mid-fetch would blank the tree.
  it('keeps the static children while categories are loading', () => {
    const staticChildren = catRoot(setup({}).result.current.pageTree)?.children;
    const { result } = setup({ loading: true, nodes: [category('c1')] });
    expect(catRoot(result.current.pageTree)?.children).toEqual(staticChildren);
  });

  it('keeps the static children when the project has no categories', () => {
    const staticChildren = catRoot(setup({}).result.current.pageTree)?.children;
    const { result } = setup({ loading: false, nodes: [] });
    expect(catRoot(result.current.pageTree)?.children).toEqual(staticChildren);
  });

  it('collects category ids recursively, not just the top level', () => {
    const { result } = setup({
      nodes: [category('parent', [category('child', [category('grand')])])],
    });
    expect(result.current.categoryIds).toEqual(['parent', 'child', 'grand']);
  });
});

describe('content pages', () => {
  const all: Built[] = [
    { pageId: 'about', title: 'About' },
    { pageId: 'home' },
    { pageId: 'cat-root' },
    { pageId: 'pdp-cat-root' },
    { pageId: 'pdp-c1' },
    { pageId: 'c1' },
    { pageId: 'a-category', pageType: 'category' },
    { pageId: 'a-pdp', pageType: 'pdp' },
  ];

  it('keeps only genuinely arbitrary pages', () => {
    const { result } = setup({ nodes: [category('c1')], builtPages: all });
    expect(result.current.contentPages.map((p) => p.pageId)).toEqual(['about']);
  });

  it('adds a content group to the tree only when there is content', () => {
    const empty = setup({ builtPages: [] });
    expect(empty.result.current.treeWithContent).toBe(
      empty.result.current.pageTree
    );

    const { result } = setup({ builtPages: [{ pageId: 'about' }] });
    const group = result.current.treeWithContent.at(-1);
    expect(group?.id).toBe('__content__');
    expect(group?.children?.map((n) => n.id)).toEqual(['about']);
  });

  it('falls back to the page id for a missing title, and derives a slug', () => {
    const { result } = setup({ builtPages: [{ pageId: 'about' }] });
    const node = result.current.treeWithContent.at(-1)?.children?.[0];
    expect(node?.title).toBe('about');
    expect(node?.slug).toBe('/about');
  });

  it('prefers a stored path over the derived slug', () => {
    const { result } = setup({
      builtPages: [{ pageId: 'about', path: '/company/about-us' }],
    });
    expect(result.current.treeWithContent.at(-1)?.children?.[0].slug).toBe(
      '/company/about-us'
    );
  });
});
