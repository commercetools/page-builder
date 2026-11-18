import { newComponentId, remapPageComponentIds } from './ids';
import type { Page } from './types';

const ALL = { mobile: true, tablet: true, desktop: true };

const makePage = (): Page => ({
  HEAD: [],
  MAIN: [
    {
      id: 'main-1',
      kind: 'layout',
      width: '1/1',
      name: {},
      visibility: { ...ALL },
      children: [
        {
          id: 'c1',
          type: 'content/hero',
          name: {},
          visibility: { ...ALL },
          settings: { t: 1 },
        },
        {
          id: 'c2',
          type: 'content/text',
          name: {},
          visibility: { ...ALL },
          settings: {},
        },
      ],
    },
  ],
  FOOTER: [],
});

describe('newComponentId', () => {
  it('returns unique, non-empty strings', () => {
    const a = newComponentId();
    const b = newComponentId();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});

describe('remapPageComponentIds', () => {
  it('assigns fresh component ids while preserving structure and settings', () => {
    const out = remapPageComponentIds(makePage());
    expect(out.MAIN[0].id).toBe('main-1'); // layout id preserved
    const [n1, n2] = out.MAIN[0].children;
    expect(n1.id).not.toBe('c1');
    expect(n2.id).not.toBe('c2');
    expect(n1.id).not.toBe(n2.id); // no aliasing
    expect(n1.type).toBe('content/hero');
    expect(n1.settings).toEqual({ t: 1 });
  });

  it('does not mutate the source page', () => {
    const page = makePage();
    const before = structuredClone(page);
    remapPageComponentIds(page);
    expect(page).toEqual(before);
  });
});
