import { buildOutline } from './outline-tree';
import {
  buildComponentElement,
  buildLayoutElement,
  buildSection,
  localized,
} from '../../test-utils/factories';

describe('buildOutline', () => {
  it('returns one entry per section, in the order given', () => {
    const outline = buildOutline({}, [
      buildSection({ id: 'HEAD' }),
      buildSection({ id: 'MAIN' }),
      buildSection({ id: 'FOOTER' }),
    ]);
    expect(outline.map((s) => s.sectionId)).toEqual(['HEAD', 'MAIN', 'FOOTER']);
  });

  it('carries the section name through', () => {
    const name = localized('Main content');
    const [section] = buildOutline({}, [buildSection({ id: 'MAIN', name })]);
    expect(section.sectionName).toBe(name);
  });

  it('yields no layouts for a section the page has no entry for', () => {
    const [section] = buildOutline({}, [buildSection({ id: 'MAIN' })]);
    expect(section.layouts).toEqual([]);
  });

  it('flattens layouts and stamps each with its section', () => {
    const layout = buildLayoutElement({ id: 'l1', width: '1/2' });
    const [section] = buildOutline({ MAIN: [layout] }, [
      buildSection({ id: 'MAIN' }),
    ]);

    expect(section.layouts).toHaveLength(1);
    expect(section.layouts[0]).toMatchObject({
      id: 'l1',
      sectionId: 'MAIN',
      width: '1/2',
      name: layout.name,
    });
  });

  it('stamps each component with both its layout and its section', () => {
    const child = buildComponentElement({ id: 'c1', type: 'content/hero' });
    const layout = buildLayoutElement({ id: 'l1', children: [child] });
    const [section] = buildOutline({ MAIN: [layout] }, [
      buildSection({ id: 'MAIN' }),
    ]);

    expect(section.layouts[0].components).toEqual([
      {
        id: 'c1',
        layoutId: 'l1',
        sectionId: 'MAIN',
        type: 'content/hero',
        name: child.name,
      },
    ]);
  });

  it('ignores page sections that are not in the visible section list', () => {
    // The caller filters `sections` by pageType; anything else in the page is dropped.
    const outline = buildOutline(
      { MAIN: [buildLayoutElement()], SECRET: [buildLayoutElement()] },
      [buildSection({ id: 'MAIN' })]
    );
    expect(outline).toHaveLength(1);
    expect(outline[0].sectionId).toBe('MAIN');
  });

  it('handles a layout with no components', () => {
    const [section] = buildOutline(
      { MAIN: [buildLayoutElement({ children: [] })] },
      [buildSection({ id: 'MAIN' })]
    );
    expect(section.layouts[0].components).toEqual([]);
  });

  it('returns nothing when there are no sections', () => {
    expect(buildOutline({ MAIN: [buildLayoutElement()] }, [])).toEqual([]);
  });
});
