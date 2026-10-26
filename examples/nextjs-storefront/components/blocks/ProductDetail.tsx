import type { Breadcrumb, Image, Price } from '@commercetools-labs/page-builder';
import { PriceView } from './shared';

export function ProductTitle({ data }: { data: { name?: string; breadcrumb?: Breadcrumb } }) {
  if (!data.name) return null;
  return (
    <header>
      <nav aria-label="Breadcrumb" style={{ fontSize: '.875rem', color: '#666' }}>
        {(data.breadcrumb ?? []).map((b) => b.name).join(' / ')}
      </nav>
      <h1 style={{ margin: '.25rem 0' }}>{data.name}</h1>
    </header>
  );
}

export function ProductPrice({ data }: { data: { price?: Price | null; sku?: string } }) {
  if (!data.price) return null;
  return (
    <p style={{ fontSize: '1.25rem' }}>
      <PriceView price={data.price} /> <small style={{ color: '#777' }}>SKU {data.sku}</small>
    </p>
  );
}

export function ProductGallery({ data }: { data: { images?: Image[] } }) {
  if (!data.images?.length) return null;
  return (
    <div style={{ display: 'flex', gap: '.5rem', overflowX: 'auto' }}>
      {data.images.map((img) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={img.url} src={img.url} alt={img.alt ?? ''} style={{ height: '24rem', background: '#eee' }} />
      ))}
    </div>
  );
}

export function ProductDescription({ data }: { data: { description?: string } }) {
  return data.description ? <p>{data.description}</p> : null;
}
