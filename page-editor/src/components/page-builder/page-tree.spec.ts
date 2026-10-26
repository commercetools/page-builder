import {
  PAGE_TREE,
  WIDTH_OPTIONS,
  findPageById,
  pageTypeForNode,
} from './page-tree';
import { buildPageNode } from '../../test-utils/factories';

describe('pageTypeForNode', () => {
  it('defaults to static when there is no node', () => {
    expect(pageTypeForNode(undefined)).toBe('static');
  });

  it('treats the pdp id and its descendants as pdp', () => {
    expect(pageTypeForNode(buildPageNode({ id: 'pdp', type: undefined }))).toBe(
      'pdp'
    );
    expect(
      pageTypeForNode(buildPageNode({ id: 'pdp-shoes', type: undefined }))
    ).toBe('pdp');
  });

  it('treats a template node as pdp regardless of its id', () => {
    expect(
      pageTypeForNode(buildPageNode({ id: 'anything', type: 'template' }))
    ).toBe('pdp');
  });

  it('maps category and dynamic through', () => {
    expect(
      pageTypeForNode(buildPageNode({ id: 'shoes', type: 'category' }))
    ).toBe('category');
    expect(pageTypeForNode(buildPageNode({ id: 'x', type: 'dynamic' }))).toBe(
      'dynamic'
    );
  });

  it('falls back to static for a plain node', () => {
    expect(
      pageTypeForNode(buildPageNode({ id: 'about', type: undefined }))
    ).toBe('static');
    expect(
      pageTypeForNode(buildPageNode({ id: 'about', type: 'folder' }))
    ).toBe('static');
  });

  it('does not treat a merely pdp-prefixed word as pdp', () => {
    // `pdpsomething` has no hyphen, so it is not a pdp descendant.
    expect(
      pageTypeForNode(buildPageNode({ id: 'pdpsomething', type: undefined }))
    ).toBe('static');
  });
});

describe('findPageById', () => {
  const tree = [
    buildPageNode({ id: 'home' }),
    buildPageNode({
      id: 'cat-root',
      children: [
        buildPageNode({
          id: 'shoes',
          children: [buildPageNode({ id: 'boots' })],
        }),
      ],
    }),
  ];

  it('finds a top-level node', () => {
    expect(findPageById(tree, 'home')?.id).toBe('home');
  });

  it('finds a deeply nested node', () => {
    expect(findPageById(tree, 'boots')?.id).toBe('boots');
  });

  it('returns undefined for an unknown id', () => {
    expect(findPageById(tree, 'nope')).toBeUndefined();
  });

  it('returns undefined for an empty tree', () => {
    expect(findPageById([], 'home')).toBeUndefined();
  });
});

describe('PAGE_TREE', () => {
  it('seeds the homepage and the category root', () => {
    expect(PAGE_TREE.map((n) => n.id)).toEqual(['home', 'cat-root']);
    expect(findPageById(PAGE_TREE, 'cat-root')?.type).toBe('category');
  });
});

describe('WIDTH_OPTIONS', () => {
  it('spans a 12-column grid for every option', () => {
    for (const { v, span } of WIDTH_OPTIONS) {
      const [num, den] = v.split('/').map(Number);
      expect(span).toBe((12 * num) / den);
    }
  });

  it('covers every width the layout element type allows', () => {
    expect(WIDTH_OPTIONS.map((o) => o.v)).toEqual([
      '1/1',
      '1/2',
      '1/3',
      '2/3',
      '1/4',
      '3/4',
    ]);
  });
});
