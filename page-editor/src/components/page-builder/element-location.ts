import type { Page } from './types';

export type ElementLocation = {
  sectionId: string;
  layoutId: string;
  compId?: string;
};

/** Locate a layout/component in the page tree by its element id. */
export const findElementLocation = (
  page: Page,
  id: string
): ElementLocation | null => {
  for (const [sectionId, layouts] of Object.entries(page)) {
    for (const layout of layouts) {
      if (layout.id === id) return { sectionId, layoutId: layout.id };
      const comp = layout.children.find((c) => c.id === id);
      if (comp) return { sectionId, layoutId: layout.id, compId: comp.id };
    }
  }
  return null;
};
