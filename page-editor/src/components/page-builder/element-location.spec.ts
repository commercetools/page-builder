import { findElementLocation } from './element-location';
import type { Page } from './types';

const ALL = { mobile: true, tablet: true, desktop: true };

const comp = (id: string) => ({
  id,
  type: 'content/text',
  name: {},
  visibility: { ...ALL },
  settings: {},
});

const layout = (id: string, children: ReturnType<typeof comp>[]) => ({
  id,
  kind: 'layout' as const,
  width: '1/1' as const,
  name: {},
  visibility: { ...ALL },
  children,
});

const page: Page = {
  HEAD: [layout('head-1', [comp('h1')])],
  MAIN: [layout('main-1', [comp('m1'), comp('m2')]), layout('main-2', [])],
  FOOTER: [],
};

describe('findElementLocation', () => {
  it('locates a layout by id', () => {
    expect(findElementLocation(page, 'main-1')).toEqual({
      sectionId: 'MAIN',
      layoutId: 'main-1',
    });
  });

  it('locates a component, reporting its parent layout', () => {
    expect(findElementLocation(page, 'm2')).toEqual({
      sectionId: 'MAIN',
      layoutId: 'main-1',
      compId: 'm2',
    });
  });

  it('searches every section, not just MAIN', () => {
    expect(findElementLocation(page, 'h1')).toEqual({
      sectionId: 'HEAD',
      layoutId: 'head-1',
      compId: 'h1',
    });
  });

  it('finds an empty layout', () => {
    expect(findElementLocation(page, 'main-2')).toEqual({
      sectionId: 'MAIN',
      layoutId: 'main-2',
    });
  });

  it('returns null for an unknown id', () => {
    expect(findElementLocation(page, 'nope')).toBeNull();
  });

  it('omits compId for a layout, so callers can branch on it', () => {
    // Both the preview bridge and comment navigation switch on `compId` to
    // decide whether to select a component or its layout.
    expect(findElementLocation(page, 'main-1')).not.toHaveProperty('compId');
  });
});
