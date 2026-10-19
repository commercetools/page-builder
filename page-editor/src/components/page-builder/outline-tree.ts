import type { LocalizedString, Page, LayoutElement, Section } from './types';

export type OutlineComponentRow = {
  id: string;
  layoutId: string;
  sectionId: string;
  type: string;
  name: LocalizedString;
};

export type OutlineLayoutRow = {
  id: string;
  sectionId: string;
  width: LayoutElement['width'];
  name: LocalizedString;
  components: OutlineComponentRow[];
};

export type OutlineSection = {
  sectionId: string;
  sectionName: LocalizedString;
  layouts: OutlineLayoutRow[];
};

/** `sections` should already be filtered to the ones visible for the current
 * pageType, matching LayoutCanvas's own `sections.filter(...)`. */
export function buildOutline(
  page: Page,
  sections: Section[]
): OutlineSection[] {
  return sections.map((section) => ({
    sectionId: section.id,
    sectionName: section.name,
    layouts: (page[section.id] ?? []).map((layout) => ({
      id: layout.id,
      sectionId: section.id,
      width: layout.width,
      name: layout.name,
      components: layout.children.map((comp) => ({
        id: comp.id,
        layoutId: layout.id,
        sectionId: section.id,
        type: comp.type,
        name: comp.name,
      })),
    })),
  }));
}
