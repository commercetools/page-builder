import { cache } from 'react';

/**
 * Components build links under the current market (`/en-us/...`). React's `cache` is scoped to
 * one server render, so the page sets the prefix once and every block reads it.
 */
const state = cache(() => ({ prefix: '/' + 'en-us' }));

export const setLinkPrefix = (slug: string): void => {
  state().prefix = `/${slug}`;
};

export const links = {
  home: (): string => state().prefix,
  category: (slug: string): string => `${state().prefix}/category/${slug}`,
  product: (slug: string, sku: string): string => `${state().prefix}/${slug}/p/${sku}`,
};
