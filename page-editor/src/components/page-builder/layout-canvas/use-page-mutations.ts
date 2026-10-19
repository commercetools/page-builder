import { useRef, useState } from 'react';
import { newComponentId, newLayoutId } from '../ids';
import type {
  ComponentElement,
  ComponentType,
  LayoutElement,
  Page,
} from '../types';

type UsePageMutationsArgs = {
  page: Page;
  onPageChange: (next: Page) => void;
  componentCatalog: ComponentType[];
  /** Component type currently being dragged out of the palette, if any. */
  draggedComponentType: string | null;
  /** Deleting the selected layout has to clear the selection with it. */
  selectedLayoutId: string | null;
  onSelectLayout: (id: string | null) => void;
  /** Locale a newly dropped component's default name is written under. */
  defaultLocale: string;
};

/**
 * Every edit the canvas can make to the page, as pure transforms funnelled
 * through one `onPageChange`. Kept apart from the canvas's own drag-highlight
 * state so the transforms can be read — and eventually tested — without the
 * rendering around them.
 *
 * Section collapse lives here too: it is page-shaped rather than transient
 * drag state, and `toggleSection` is the only thing that writes it.
 */
export const usePageMutations = ({
  page,
  onPageChange,
  componentCatalog,
  draggedComponentType,
  selectedLayoutId,
  onSelectLayout,
  defaultLocale,
}: UsePageMutationsArgs) => {
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});
  const pendingCompUpdates = useRef<
    Record<string, { sectionId: string; components: ComponentElement[] }>
  >({});

  const toggleSection = (sectionId: string) =>
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));

  const reorderLayout = (sectionId: string, fromId: string, toId: string) => {
    if (fromId === toId) return;
    const layouts = [...(page[sectionId] ?? [])];
    const fromIdx = layouts.findIndex((l) => l.id === fromId);
    const toIdx = layouts.findIndex((l) => l.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [item] = layouts.splice(fromIdx, 1);
    layouts.splice(toIdx, 0, item);
    onPageChange({ ...page, [sectionId]: layouts });
  };

  const duplicateLayout = (sectionId: string, layoutId: string) => {
    const sectionLayouts = page[sectionId] ?? [];
    const src = sectionLayouts.find((l) => l.id === layoutId);
    if (!src) return;
    const clone = {
      ...src,
      id: newLayoutId(sectionId.toLowerCase()),
      children: src.children.map((c) => ({
        ...c,
        id: newComponentId(),
      })),
    };
    const idx = sectionLayouts.findIndex((l) => l.id === layoutId);
    const updated = [...sectionLayouts];
    updated.splice(idx + 1, 0, clone);
    onPageChange({ ...page, [sectionId]: updated });
  };

  const duplicateComp = (
    sectionId: string,
    layoutId: string,
    compId: string
  ) => {
    const sectionLayouts = page[sectionId] ?? [];
    const layout = sectionLayouts.find((l) => l.id === layoutId);
    const src = layout?.children.find((c) => c.id === compId);
    if (!src) return;
    const clone = { ...src, id: newComponentId() };
    const idx = layout!.children.findIndex((c) => c.id === compId);
    const newChildren = [...layout!.children];
    newChildren.splice(idx + 1, 0, clone);
    onPageChange({
      ...page,
      [sectionId]: sectionLayouts.map((l) =>
        l.id === layoutId ? { ...l, children: newChildren } : l
      ),
    });
  };

  const deleteLayout = (sectionId: string, layoutId: string) => {
    const updated = {
      ...page,
      [sectionId]: (page[sectionId] ?? []).filter((l) => l.id !== layoutId),
    };
    onPageChange(updated);
    if (selectedLayoutId === layoutId) onSelectLayout(null);
  };

  const deleteComp = (sectionId: string, layoutId: string, compId: string) => {
    const updated = {
      ...page,
      [sectionId]: (page[sectionId] ?? []).map((l) =>
        l.id === layoutId
          ? { ...l, children: l.children.filter((c) => c.id !== compId) }
          : l
      ),
    };
    onPageChange(updated);
  };

  const updateComponents = (
    sectionId: string,
    layoutId: string,
    components: ComponentElement[]
  ) => {
    const current =
      (page[sectionId] ?? []).find((l: LayoutElement) => l.id === layoutId)
        ?.children ?? [];
    if (
      current.length === components.length &&
      current.every((c, i) => c.id === components[i].id)
    )
      return;
    pendingCompUpdates.current[layoutId] = { sectionId, components };
    queueMicrotask(() => {
      const updates = pendingCompUpdates.current;
      if (Object.keys(updates).length === 0) return;
      pendingCompUpdates.current = {};
      let next = page;
      for (const [lId, { sectionId: sId, components: comps }] of Object.entries(
        updates
      )) {
        next = {
          ...next,
          [sId]: (next[sId] ?? []).map((l: LayoutElement) =>
            l.id === lId ? { ...l, children: comps } : l
          ),
        };
      }
      onPageChange(next);
    });
  };

  const dropNewComp = (sectionId: string, layoutId: string) => {
    if (!draggedComponentType) return;
    const def = componentCatalog.find((c) => c.type === draggedComponentType);
    if (!def) return;
    const newComp: ComponentElement = {
      id: newComponentId(),
      type: draggedComponentType,
      name: def.name,
      visibility: { mobile: true, tablet: true, desktop: true },
      settings: {},
    };
    const updated = {
      ...page,
      [sectionId]: (page[sectionId] ?? []).map((l) =>
        l.id === layoutId ? { ...l, children: [...l.children, newComp] } : l
      ),
    };
    onPageChange(updated);
  };

  // A section with zero layout rows has nowhere for dropNewComp's target
  // layoutId to point at — synthesize a full-width row (mirroring
  // LayoutPickerDialog's '1/1' pick) with the dropped component as its only
  // child, so the first drag-and-drop onto an empty section isn't a no-op.
  const dropNewComponentIntoEmptySection = (sectionId: string) => {
    if (!draggedComponentType) return;
    const def = componentCatalog.find((c) => c.type === draggedComponentType);
    if (!def) return;
    const layoutId = newLayoutId(sectionId.toLowerCase());
    const newComp: ComponentElement = {
      id: newComponentId(),
      type: draggedComponentType,
      name: def.name,
      visibility: { mobile: true, tablet: true, desktop: true },
      settings: {},
    };
    const newLayout: LayoutElement = {
      id: layoutId,
      kind: 'layout',
      width: '1/1',
      name: { [defaultLocale]: 'New 1/1 layout' },
      visibility: { mobile: true, tablet: true, desktop: true },
      children: [newComp],
    };
    onPageChange({
      ...page,
      [sectionId]: [...(page[sectionId] ?? []), newLayout],
    });
  };

  return {
    collapsedSections,
    toggleSection,
    reorderLayout,
    duplicateLayout,
    duplicateComp,
    deleteLayout,
    deleteComp,
    updateComponents,
    dropNewComp,
    dropNewComponentIntoEmptySection,
  };
};
