import type { Money, ProductCard } from '@commercetools-labs/page-builder';
import { links } from '@/lib/links';

export function formatMoney(m: Money): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: m.currencyCode }).format(m.centAmount / 100);
}

export function PriceView({ price }: { price: ProductCard['price'] }) {
  if (!price) return null;
  return price.discounted ? (
    <span>
      <s style={{ color: '#777', marginRight: '.5rem' }}>{formatMoney(price)}</s>
      <strong>{formatMoney(price.discounted)}</strong>
    </span>
  ) : (
    <strong>{formatMoney(price)}</strong>
  );
}

export function ProductGrid({ products }: { products: ProductCard[] }) {
  return (
    <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(12rem, 1fr))', gap: '1rem', listStyle: 'none', padding: 0, margin: 0 }}>
      {products.map((p) => (
        <li key={p.id}>
          <a href={links.product(p.slug, p.sku)} style={{ color: 'inherit', textDecoration: 'none' }}>
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image.url} alt={p.image.alt ?? p.name} style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', background: '#eee' }} />
            ) : (
              <div style={{ width: '100%', aspectRatio: '3 / 4', background: '#eee' }} />
            )}
            <div style={{ marginTop: '.5rem' }}>{p.name}</div>
            <PriceView price={p.price} />
          </a>
        </li>
      ))}
    </ul>
  );
}
