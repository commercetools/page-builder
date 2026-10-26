import { PBText } from '@commercetools-labs/page-builder';

interface HeroData {
  title?: string;
  subTitle?: string;
  text?: string;
  image?: string;
  buttons?: Array<{ label?: string; link?: string }>;
}

export function Hero({ data }: { data: HeroData }) {
  return (
    <section
      style={{
        padding: '4rem 2rem',
        color: '#fff',
        background: data.image ? `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.45)), url(${JSON.stringify(data.image)}) center / cover` : '#222',
      }}
    >
      {data.title ? <PBText field="title" value={data.title} as="h1" html /> : null}
      {data.subTitle ? <PBText field="subTitle" value={data.subTitle} as="h2" html /> : null}
      {data.text ? <PBText field="text" value={data.text} as="div" html /> : null}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
        {(data.buttons ?? []).map((b, i) =>
          b.label ? (
            <a key={i} href={b.link || '#'} style={{ background: '#fff', color: '#111', padding: '.5rem 1rem', textDecoration: 'none' }}>
              {b.label}
            </a>
          ) : null
        )}
      </div>
    </section>
  );
}
