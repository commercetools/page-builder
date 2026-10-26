import { PageBuilder } from '@commercetools-labs/page-builder';
import { notFound, redirect } from 'next/navigation';
import { components } from '@/components/blocks';
import { setLinkPrefix } from '@/lib/links';
import { DEFAULT_MARKET, marketFor } from '@/lib/market';

/** Rendering this answers 404: `notFound()` throws during the render, which Next turns into the status. */
function NotFound(): never {
  notFound();
}

/**
 * Shown when the page-builder service cannot be reached or answers with an error. A missing page
 * is a 404 (`fallback`); an outage is not, so shoppers and crawlers see the page as unavailable,
 * not as gone. Replace it with your own native page.
 */
function Unavailable() {
  return (
    <main style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
      <h1 style={{ margin: 0 }}>We&apos;ll be right back</h1>
      <p style={{ color: '#555' }}>This page is temporarily unavailable. Please try again in a moment.</p>
    </main>
  );
}

/**
 * The whole integration: one catch-all route. The service decides which page the path is
 * (home, content, category, product); this file only supplies the shopper's market and the
 * component map.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { path = [] } = await params;
  const market = marketFor(path[0]);
  if (!market) redirect(`/${DEFAULT_MARKET.slug}${path.length ? `/${path.join('/')}` : ''}`);
  setLinkPrefix(market.slug);

  return (
    <PageBuilder
      components={components}
      path={`/${path.join('/')}`}
      context={{
        locale: market.locale,
        currency: market.currency,
        country: market.country,
        store: process.env.STORE_KEY || undefined,
      }}
      searchParams={await searchParams}
      fallback={<NotFound />}
      errorFallback={<Unavailable />}
    />
  );
}
