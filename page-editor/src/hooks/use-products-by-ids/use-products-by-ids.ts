/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import { useMcQuery } from '@commercetools-frontend/application-shell-connectors';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import FetchProductsByIdsQuery from './fetch-products-by-ids.ctp.graphql';
import { TQuery, TQuery_ProductsArgs } from '../../types/generated/ctp';

export type ProductDisplay = {
  name: string | null;
  imageUrl: string | null;
};

export const useProductsByIds = (
  ids: string[],
  locale: string
): Record<string, ProductDisplay> => {
  const skip = ids.length === 0;

  const { data } = useMcQuery<TQuery, TQuery_ProductsArgs & { locale: string }>(
    FetchProductsByIdsQuery,
    {
      variables: {
        where: `id in (${ids.map((id) => `"${id}"`).join(', ')})`,
        locale,
        limit: ids.length,
      },
      skip,
      context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
    }
  );

  const result: Record<string, ProductDisplay> = {};
  for (const p of data?.products?.results ?? []) {
    const { current, staged } = p.masterData;
    result[p.id] = {
      name: current?.name ?? staged?.name ?? null,
      imageUrl:
        current?.allVariants[0]?.images[0]?.url ??
        staged?.allVariants[0]?.images[0]?.url ??
        null,
    };
  }
  return result;
};
