import type { PageNode, PageTypeId } from './types';

export function pageTypeForNode(node: PageNode | undefined): PageTypeId {
  if (!node) return 'static';
  if (
    node.id === 'pdp' ||
    node.id.startsWith('pdp-') ||
    node.type === 'template'
  )
    return 'pdp';
  if (node.type === 'category') return 'category';
  if (node.type === 'dynamic') return 'dynamic';
  return 'static';
}

export const PAGE_TREE: PageNode[] = [
  {
    id: 'home',
    title: 'Homepage',
    icon: 'Home',
  },
  {
    id: 'cat-root',
    title: 'All categories',
    icon: 'Category',
    type: 'category',
  },
];

export function findPageById(
  nodes: PageNode[],
  id: string
): PageNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findPageById(node.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

export const WIDTH_OPTIONS = [
  { v: '1/1' as const, label: 'Full width (1/1)', span: 12 },
  { v: '1/2' as const, label: 'Half (1/2)', span: 6 },
  { v: '1/3' as const, label: 'Third (1/3)', span: 4 },
  { v: '2/3' as const, label: 'Two-thirds (2/3)', span: 8 },
  { v: '1/4' as const, label: 'Quarter (1/4)', span: 3 },
  { v: '3/4' as const, label: 'Three quarters (3/4)', span: 9 },
];
