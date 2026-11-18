/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import { useMcQuery } from '@commercetools-frontend/application-shell-connectors';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import FetchCategoriesByIdsQuery from './fetch-categories-by-ids.ctp.graphql';

export type CategoryDisplay = {
  name: string | null;
  breadcrumb: string | null;
};

type RawResult = {
  categories: {
    results: Array<{
      id: string;
      name: string | null;
      ancestors: Array<{ id: string; name: string | null }>;
    }>;
  };
};

export const useCategoriesByIds = (
  ids: string[],
  locale: string
): Record<string, CategoryDisplay> => {
  const skip = ids.length === 0;

  const { data } = useMcQuery<RawResult>(FetchCategoriesByIdsQuery, {
    variables: {
      where: `id in (${ids.map((id) => `"${id}"`).join(', ')})`,
      locale,
      limit: ids.length,
    },
    skip,
    context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
  });

  const result: Record<string, CategoryDisplay> = {};
  for (const c of data?.categories?.results ?? []) {
    const parts = [
      ...c.ancestors.map((a) => a.name ?? a.id),
      c.name ?? '',
    ].filter(Boolean);
    result[c.id] = {
      name: c.name,
      breadcrumb: parts.length > 0 ? parts.join(' / ') : null,
    };
  }
  return result;
};
