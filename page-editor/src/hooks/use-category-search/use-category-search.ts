/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import { useMcQuery } from '@commercetools-frontend/application-shell-connectors';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import SearchCategoriesQuery from './search-categories.ctp.graphql';
import {
  TCategorySearch,
  TQuery,
  TQuery_CategorySearchArgs,
} from '../../types/generated/ctp';

export type CategorySearchItem = {
  id: string;
  key: string | null | undefined;
  name: string | null | undefined;
  breadcrumb: string | null;
};

function buildBreadcrumb(
  name: string | null | undefined,
  ancestors: TCategorySearch[]
): string | null {
  const parts = [...ancestors.map((a) => a.name ?? a.id), name ?? ''].filter(
    Boolean
  );
  return parts.length > 0 ? parts.join(' / ') : null;
}

export const useCategorySearch = (
  text: string,
  locale: string
): { results: CategorySearchItem[]; loading: boolean } => {
  const skip = !text.trim();

  const { data, loading } = useMcQuery<
    TQuery,
    TQuery_CategorySearchArgs & { locale: string }
  >(SearchCategoriesQuery, {
    variables: {
      fulltext: skip ? null : { text: text.trim(), locale },
      locale,
      limit: 20,
      offset: 0,
    },
    skip,
    context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
  });

  const results: CategorySearchItem[] = (
    data?.categorySearch.results ?? []
  ).map((c) => ({
    id: c.id,
    key: c.key,
    name: c.name,
    breadcrumb: buildBreadcrumb(c.name, c.ancestors),
  }));

  return { results, loading: !skip && loading };
};
