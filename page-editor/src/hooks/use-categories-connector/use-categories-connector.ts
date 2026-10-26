/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import type { ApolloError } from '@apollo/client';
import { useMcQuery } from '@commercetools-frontend/application-shell-connectors';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import type { PageNode } from '../../components/page-builder/types';
import FetchCategoriesQuery from './fetch-categories.ctp.graphql';

const LIMIT = 500;

type RawCategory = {
  id: string;
  key: string | null;
  name: string | null;
  slug: string | null;
  childCount: number;
  parent: { id: string } | null;
};

type FetchCategoriesQueryResult = {
  categories: {
    total: number;
    results: RawCategory[];
  };
};

type FetchCategoriesQueryVariables = {
  locale: string;
  limit: number;
};

export type CategoriesFetcherResult = {
  nodes: PageNode[];
  loading: boolean;
  error?: ApolloError;
};

export const useCategoriesFetcher = (
  locale: string
): CategoriesFetcherResult => {
  const { data, loading, error } = useMcQuery<
    FetchCategoriesQueryResult,
    FetchCategoriesQueryVariables
  >(FetchCategoriesQuery, {
    variables: { locale, limit: LIMIT },
    context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
  });

  const results = data?.categories.results ?? [];

  // Group children by parent once, rather than re-scanning all `results` (up to
  // LIMIT = 500) inside every recursive call — that made tree building O(n^2)
  // in the category count.
  const byParent = new Map<string | null, typeof results>();
  for (const cat of results) {
    const parentId = cat.parent?.id ?? null;
    const siblings = byParent.get(parentId);
    if (siblings) siblings.push(cat);
    else byParent.set(parentId, [cat]);
  }

  const buildTree = (parentId: string | null): PageNode[] =>
    (byParent.get(parentId) ?? []).map((cat) => {
      const children = cat.childCount > 0 ? buildTree(cat.id) : undefined;
      return {
        id: cat.id,
        key: cat.key ?? undefined,
        title: cat.name ?? cat.key ?? cat.id,
        type: 'category' as const,
        icon: 'Folder',
        children: children && children.length > 0 ? children : undefined,
        slug: cat.slug ?? undefined,
      };
    });

  const nodes: PageNode[] = results.length > 0 ? buildTree(null) : [];

  return { nodes, loading, error };
};
