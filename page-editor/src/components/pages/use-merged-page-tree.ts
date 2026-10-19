import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { PAGE_TREE } from '../page-builder/page-tree';
import { pathForSlug } from '../page-builder/page-path';
import type { PageNode } from '../page-builder/types';
import type { useCategoriesFetcher } from '../../hooks/use-categories-connector';
import type { useBuiltPageIds } from '../../hooks/use-page-builder-connector';
import messages from './messages';

type BuiltPages = ReturnType<typeof useBuiltPageIds>['pages'];

/** Ids the static tree already owns; they must not reappear as content pages. */
const RESERVED_PAGE_IDS = new Set(['home', 'cat-root', 'pdp-cat-root']);

/**
 * Merges the three sources the page list is assembled from: the static
 * PAGE_TREE skeleton, live commercetools categories grafted under `cat-root`,
 * and any arbitrary content pages that have actually been built, collected into
 * their own group.
 */
export const useMergedPageTree = ({
  categoriesFetcher,
  builtPages,
}: {
  categoriesFetcher: ReturnType<typeof useCategoriesFetcher>;
  builtPages: BuiltPages;
}) => {
  const intl = useIntl();

  const pageTree = useMemo<PageNode[]>(() => {
    return PAGE_TREE.map((node) => {
      if (node.id !== 'cat-root') return node;
      return {
        ...node,
        children: categoriesFetcher.loading
          ? node.children
          : categoriesFetcher.nodes.length > 0
          ? categoriesFetcher.nodes
          : node.children,
      };
    });
  }, [categoriesFetcher.loading, categoriesFetcher.nodes]);

  const categoryIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (nodes: PageNode[]) =>
      nodes.forEach((n) => {
        ids.push(n.id);
        if (n.children) walk(n.children);
      });
    walk(categoriesFetcher.nodes);
    return ids;
  }, [categoriesFetcher.nodes]);

  // Arbitrary "content" pages: everything that isn't home / a category PLP /
  // a PDP override / the global fallbacks.
  const contentPages = useMemo(() => {
    const categoryIdSet = new Set(categoryIds);
    return builtPages.filter(
      (p) =>
        !RESERVED_PAGE_IDS.has(p.pageId) &&
        !p.pageId.startsWith('pdp-') &&
        !categoryIdSet.has(p.pageId) &&
        p.pageType !== 'category' &&
        p.pageType !== 'pdp'
    );
  }, [builtPages, categoryIds]);

  const treeWithContent = useMemo<PageNode[]>(() => {
    if (contentPages.length === 0) return pageTree;
    const contentGroup: PageNode = {
      id: '__content__',
      title: intl.formatMessage(messages.contentPagesGroup),
      type: 'folder',
      icon: 'FolderOpen',
      children: contentPages.map((p) => ({
        id: p.pageId,
        title: p.title || p.pageId,
        slug: p.path ?? pathForSlug(p.pageId),
        icon: 'InsertDriveFile',
      })),
    };
    return [...pageTree, contentGroup];
  }, [pageTree, contentPages, intl]);

  return { pageTree, categoryIds, contentPages, treeWithContent };
};
