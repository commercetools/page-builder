import { PBText, type ProductCard } from '@commercetools-labs/page-builder';
import { ProductGrid } from './shared';

export function ProductCarousel({ data }: { data: { title?: string; products?: ProductCard[] | null } }) {
  if (!data.products?.length) return null;
  return (
    <section style={{ padding: '1rem 0' }}>
      {data.title ? <PBText field="title" value={data.title} as="h2" html /> : null}
      <ProductGrid products={data.products} />
    </section>
  );
}
