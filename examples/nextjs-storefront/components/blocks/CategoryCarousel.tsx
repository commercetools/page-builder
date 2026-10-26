import { PBText, type CategoryNode } from '@commercetools-labs/page-builder';
import { links } from '@/lib/links';

export function CategoryCarousel({ data }: { data: { title?: string; categories?: CategoryNode[] | null } }) {
  if (!data.categories?.length) return null;
  return (
    <section style={{ padding: '1rem 0' }}>
      {data.title ? <PBText field="title" value={data.title} as="h2" html /> : null}
      <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', listStyle: 'none', padding: 0 }}>
        {data.categories.map((c) => (
          <li key={c.id}>
            <a href={links.category(c.slug)}>{c.name}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
