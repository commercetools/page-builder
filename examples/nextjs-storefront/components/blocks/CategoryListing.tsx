import type { CategoryNode, Facet, ProductCard } from '@commercetools-labs/page-builder';
import { ProductGrid } from './shared';

export function CategoryTitle({ data }: { data: { category?: CategoryNode } }) {
  return data.category ? <h1>{data.category.name}</h1> : null;
}

export function CategoryProducts({ data }: { data: { products?: ProductCard[] } }) {
  return data.products?.length ? <ProductGrid products={data.products} /> : <p>No products found.</p>;
}

export function CategoryFacets({ data }: { data: { facets?: Facet[] } }) {
  const facets = (data.facets ?? []).filter((f) => f.buckets.length > 0);
  if (!facets.length) return null;
  return (
    <aside>
      {facets.map((f) => (
        <div key={f.name} style={{ marginBottom: '1rem' }}>
          <strong>{f.label ?? f.name}</strong>
          <ul style={{ listStyle: 'none', padding: 0, margin: '.25rem 0' }}>
            {f.buckets.map((b) => (
              <li key={b.key}>
                <a href={`?facet.${encodeURIComponent(f.name)}=${encodeURIComponent(b.key)}`}>
                  {b.label ?? b.key} ({b.count})
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}

export function CategoryPagination({ data }: { data: { total?: number; offset?: number; limit?: number } }) {
  const { total = 0, offset = 0, limit = 24 } = data;
  if (total <= limit) return null;
  const href = (o: number): string => `?offset=${Math.max(0, o)}`;
  return (
    <nav style={{ display: 'flex', gap: '1rem' }}>
      {offset > 0 ? <a href={href(offset - limit)}>Previous</a> : null}
      <span>
        {offset + 1}–{Math.min(offset + limit, total)} of {total}
      </span>
      {offset + limit < total ? <a href={href(offset + limit)}>Next</a> : null}
    </nav>
  );
}
