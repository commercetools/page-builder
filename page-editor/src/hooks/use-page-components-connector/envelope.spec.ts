import { appendComponentVersion, componentDraftHead } from './envelope';
import { MAX_VERSIONS } from '../../components/page-builder/types';
import type {
  CombinedComponent,
  ComponentAuthored,
} from '../../components/page-builder/types';

const authored = (settings: Record<string, unknown>): ComponentAuthored => ({
  name: { 'en-US': 'Hero' },
  visibility: { mobile: true, tablet: true, desktop: true },
  settings,
});

describe('appendComponentVersion', () => {
  it('creates a fresh object when none exists', () => {
    const { combined, changed } = appendComponentVersion(
      null,
      'cid',
      'content/hero',
      'home',
      authored({ title: 'A' }),
      't0'
    );
    expect(changed).toBe(true);
    expect(combined.type).toBe('content/hero');
    expect(combined.pageId).toBe('home');
    expect(combined.draft.componentId).toBe('cid');
    expect(combined.draft.versions).toHaveLength(1);
    expect(combined.draft.versions[0].appVersion).toBe(1);
    expect(combined.draft.versions[0].publishedAt).toBeNull();
  });

  it('is a no-op when content is unchanged (ignoring settings key order)', () => {
    const first = appendComponentVersion(
      null,
      'cid',
      'content/hero',
      'home',
      authored({ a: 1, b: 2 }),
      't0'
    ).combined;
    const { combined, changed } = appendComponentVersion(
      first,
      'cid',
      'content/hero',
      'home',
      authored({ b: 2, a: 1 }),
      't1'
    );
    expect(changed).toBe(false);
    expect(combined).toBe(first);
    expect(combined.draft.versions).toHaveLength(1);
  });

  it('appends a new version when content changes', () => {
    const first = appendComponentVersion(
      null,
      'cid',
      'content/hero',
      'home',
      authored({ title: 'A' }),
      't0'
    ).combined;
    const { combined, changed } = appendComponentVersion(
      first,
      'cid',
      'content/hero',
      'home',
      authored({ title: 'B' }),
      't1'
    );
    expect(changed).toBe(true);
    expect(combined.draft.versions).toHaveLength(2);
    expect(componentDraftHead(combined)?.appVersion).toBe(2);
    expect(
      (componentDraftHead(combined)?.settings as { title: string }).title
    ).toBe('B');
  });

  it('treats adding a style as a change', () => {
    const first = appendComponentVersion(
      null,
      'cid',
      'content/hero',
      'home',
      authored({}),
      't0'
    ).combined;
    const { changed } = appendComponentVersion(
      first,
      'cid',
      'content/hero',
      'home',
      { ...authored({}), style: 'dark' },
      't1'
    );
    expect(changed).toBe(true);
  });

  it('caps history at MAX_VERSIONS, dropping the oldest but keeping appVersion monotonic', () => {
    let c: CombinedComponent | null = null;
    const total = MAX_VERSIONS + 5;
    for (let i = 0; i < total; i++) {
      c = appendComponentVersion(
        c,
        'cid',
        'content/hero',
        'home',
        authored({ n: i }),
        `t${i}`
      ).combined;
    }
    expect(c!.draft.versions).toHaveLength(MAX_VERSIONS);
    expect(componentDraftHead(c!)?.appVersion).toBe(total); // not reset by capping
    expect((componentDraftHead(c!)?.settings as { n: number }).n).toBe(
      total - 1
    );
    // oldest surviving version is the (total - MAX_VERSIONS)-th appended
    expect((c!.draft.versions[0].settings as { n: number }).n).toBe(
      total - MAX_VERSIONS
    );
  });
});
