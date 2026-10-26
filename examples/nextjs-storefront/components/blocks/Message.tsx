import { PBText } from '@commercetools-labs/page-builder';

export function Message({ data }: { data: { title?: string; description?: string } }) {
  return (
    <section style={{ padding: '1rem', textAlign: 'center' }}>
      {data.title ? <PBText field="title" value={data.title} as="h2" /> : null}
      {data.description ? <PBText field="description" value={data.description} as="p" /> : null}
    </section>
  );
}
