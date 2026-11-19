import { useEffect, useRef, useState } from 'react';
import {
  useVisualBridge,
  type HostMessage,
  type ElementRect,
  type Dropzone,
} from './preview/preview-bridge';
import { newComponentId, newLayoutId } from './ids';
import { findElementLocation } from './element-location';
import type {
  ComponentElement,
  ComponentType,
  LayoutElement,
  Page,
} from './types';
import type { PageDocument } from './use-page-document';
import type { ElementSelection } from './use-element-selection';

type UsePreviewBridgeArgs = {
  doc: PageDocument;
  selection: ElementSelection;
  componentCatalog: ComponentType[];
  /** Component type currently being dragged out of the palette, if any. */
  draggedType: string | null;
  setDraggedType: (type: string | null) => void;
  viewMode: 'edit' | 'preview';
  previewEnabled: boolean;
  previewLocale: string;
  /** Origin of the configured storefront; messages are only posted there. */
  hostOrigin: string | null;
};

/**
 * The builder side of the visual-editing bridge (docs/sdd/preview-contract.md).
 *
 * It owns the postMessage connection to the preview iframe, the geometry the
 * host reports back (element rects, hover, drop zones), and every page edit that
 * can originate from inside the rendered page — an inline text commit, a drag
 * between drop zones, or a duplicate/delete on the current selection.
 *
 * Page mutations go through `doc.pushHistory` so edits made in the preview are
 * undoable exactly like edits made on the canvas.
 */
export const usePreviewBridge = ({
  doc,
  selection,
  componentCatalog,
  draggedType,
  setDraggedType,
  viewMode,
  previewEnabled,
  previewLocale,
  hostOrigin,
}: UsePreviewBridgeArgs) => {
  const { page, pushHistory, dirty } = doc;

  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const [previewRects, setPreviewRects] = useState<Record<string, ElementRect>>(
    {}
  );
  const [previewHoveredId, setPreviewHoveredId] = useState<string | null>(null);
  const [previewDropzones, setPreviewDropzones] = useState<Dropzone[]>([]);

  // --- Phase 2/3: visual-editing bridge (host must implement the contract) ---

  // Phase 3: apply an inline text edit committed on the rendered page. Localized
  // fields (stored as an object) are updated for the active preview locale.
  const applyInlineFieldEdit = (
    loc: { sectionId: string; layoutId: string; compId?: string },
    key: string,
    value: string
  ) => {
    if (!loc.compId) return;
    const next: Page = {
      ...page,
      [loc.sectionId]: (page[loc.sectionId] ?? []).map((l) =>
        l.id === loc.layoutId
          ? {
              ...l,
              children: l.children.map((c) => {
                if (c.id !== loc.compId) return c;
                const current = c.settings[key];
                const isLocalized =
                  current != null &&
                  typeof current === 'object' &&
                  !Array.isArray(current);
                return {
                  ...c,
                  settings: {
                    ...c.settings,
                    [key]: isLocalized
                      ? {
                          ...(current as Record<string, unknown>),
                          [previewLocale]: value,
                        }
                      : value,
                  },
                };
              }),
            }
          : l
      ),
    };
    pushHistory(next);
  };

  // Phase 3: apply a drag-drop reported by the host — move an existing element or
  // insert a new one from the palette — then persist + re-render.
  const applyDrop = (payload: {
    dragId?: string;
    type?: string;
    target: { section: string; layoutId: string | null; index: number };
  }) => {
    const { dragId, type, target } = payload;
    let working = page;
    let placing: ComponentElement | null = null;
    // Track a same-layout move so the insertion index can be adjusted for the gap
    // left by the removed element (the host reports `index` against the pre-removal
    // sibling list).
    let removedFromLayoutId: string | null = null;
    let removedIndex = -1;

    if (dragId) {
      const loc = findElementLocation(working, dragId);
      if (loc?.compId) {
        const layout = (working[loc.sectionId] ?? []).find(
          (l) => l.id === loc.layoutId
        );
        removedFromLayoutId = loc.layoutId;
        removedIndex = layout?.children.findIndex((c) => c.id === dragId) ?? -1;
        placing = layout?.children.find((c) => c.id === dragId) ?? null;
        working = {
          ...working,
          [loc.sectionId]: (working[loc.sectionId] ?? []).map((l) =>
            l.id === loc.layoutId
              ? { ...l, children: l.children.filter((c) => c.id !== dragId) }
              : l
          ),
        };
      }
    } else if (type) {
      const def = componentCatalog.find((c) => c.type === type);
      if (def) {
        placing = {
          id: newComponentId(),
          type,
          name: def.name,
          visibility: { mobile: true, tablet: true, desktop: true },
          settings: {},
        };
      }
    }
    if (!placing) return;
    const comp = placing;

    if (target.layoutId) {
      const insertIndex =
        target.layoutId === removedFromLayoutId &&
        removedIndex !== -1 &&
        removedIndex < target.index
          ? target.index - 1
          : target.index;
      working = {
        ...working,
        [target.section]: (working[target.section] ?? []).map((l) =>
          l.id === target.layoutId
            ? {
                ...l,
                children: [
                  ...l.children.slice(0, insertIndex),
                  comp,
                  ...l.children.slice(insertIndex),
                ],
              }
            : l
        ),
      };
    } else {
      const newLayout: LayoutElement = {
        id: newLayoutId(target.section.toLowerCase()),
        kind: 'layout',
        width: '1/1',
        name: { 'en-US': 'Row' },
        visibility: { mobile: true, tablet: true, desktop: true },
        children: [comp],
      };
      const arr = [...(working[target.section] ?? [])];
      arr.splice(target.index, 0, newLayout);
      working = { ...working, [target.section]: arr };
    }
    pushHistory(working);
  };

  // Phase 3: on-render toolbar actions on the current selection.
  const duplicateSelected = () => {
    const compId = selection.compId;
    const layoutId = selection.layoutId;
    if (compId && layoutId) {
      const loc = findElementLocation(page, compId);
      if (!loc) return;
      pushHistory({
        ...page,
        [loc.sectionId]: (page[loc.sectionId] ?? []).map((l) => {
          if (l.id !== loc.layoutId) return l;
          const idx = l.children.findIndex((c) => c.id === compId);
          if (idx === -1) return l;
          const clone = {
            ...l.children[idx],
            id: newComponentId(),
          };
          const children = [...l.children];
          children.splice(idx + 1, 0, clone);
          return { ...l, children };
        }),
      });
    } else if (layoutId) {
      const loc = findElementLocation(page, layoutId);
      if (!loc) return;
      const arr = page[loc.sectionId] ?? [];
      const idx = arr.findIndex((l) => l.id === layoutId);
      if (idx === -1) return;
      const src = arr[idx];
      const clone: LayoutElement = {
        ...src,
        id: newLayoutId(loc.sectionId.toLowerCase()),
        children: src.children.map((c) => ({
          ...c,
          id: newComponentId(),
        })),
      };
      const updated = [...arr];
      updated.splice(idx + 1, 0, clone);
      pushHistory({ ...page, [loc.sectionId]: updated });
    }
  };

  const deleteSelected = () => {
    const compId = selection.compId;
    const layoutId = selection.layoutId;
    if (compId && layoutId) {
      const loc = findElementLocation(page, compId);
      if (!loc) return;
      pushHistory({
        ...page,
        [loc.sectionId]: (page[loc.sectionId] ?? []).map((l) =>
          l.id === loc.layoutId
            ? { ...l, children: l.children.filter((c) => c.id !== compId) }
            : l
        ),
      });
      selection.selectLayout(null);
    } else if (layoutId) {
      const loc = findElementLocation(page, layoutId);
      if (!loc) return;
      pushHistory({
        ...page,
        [loc.sectionId]: (page[loc.sectionId] ?? []).filter(
          (l) => l.id !== layoutId
        ),
      });
      selection.selectLayout(null);
    }
  };

  const handlePaletteDrop = (target: {
    section: string;
    layoutId: string | null;
    index: number;
  }) => {
    if (!draggedType) return;
    applyDrop({ type: draggedType, target });
    setDraggedType(null);
  };

  const handleHostMessage = (msg: HostMessage) => {
    switch (msg.type) {
      case 'rects': {
        const map: Record<string, ElementRect> = {};
        for (const item of msg.payload.items) map[item.id] = item.rect;
        setPreviewRects(map);
        setPreviewDropzones(msg.payload.dropzones ?? []);
        break;
      }
      case 'hover':
        setPreviewHoveredId(msg.payload.id);
        break;
      case 'select': {
        const loc = findElementLocation(page, msg.payload.id);
        if (!loc) break;
        // Selection came from a click inside the iframe: the element is
        // already visible, so don't scroll the preview to it.
        if (loc.compId)
          selection.selectComp(loc.layoutId, loc.compId, { scroll: false });
        else selection.selectLayout(loc.layoutId, { scroll: false });
        break;
      }
      case 'field': {
        // Phase 3: inline text edit committed on the rendered page.
        const loc = findElementLocation(page, msg.payload.id);
        if (!loc?.compId) break;
        applyInlineFieldEdit(loc, msg.payload.key, msg.payload.value);
        break;
      }
      case 'drop':
        applyDrop(msg.payload);
        break;
      default:
        break;
    }
  };

  const {
    connected: bridgeConnected,
    registry: hostRegistry,
    send: bridgeSend,
  } = useVisualBridge({
    iframeRef: previewFrameRef,
    enabled: viewMode === 'preview' && previewEnabled,
    hostOrigin,
    onHostMessage: handleHostMessage,
  });

  // On connect: initialize the bridge and request element geometry.
  useEffect(() => {
    if (!bridgeConnected) return;
    bridgeSend('init', {
      mode: 'preview',
      selectedId: selection.elementId,
      locale: previewLocale,
    });
    bridgeSend('requestRects');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeConnected]);

  // Mirror builder selection onto the rendered page.
  useEffect(() => {
    if (viewMode !== 'preview' || !bridgeConnected) return;
    bridgeSend('highlight', { id: selection.elementId });
    // Scroll the preview to the selection when it was driven from the builder
    // UI (outline/tree/canvas), not from a click inside the iframe.
    if (selection.scrollOnSelect.current && selection.elementId) {
      bridgeSend('scrollTo', { id: selection.elementId });
    }
    selection.scrollOnSelect.current = false;
  }, [
    selection.elementId,
    selection.scrollOnSelect,
    viewMode,
    bridgeConnected,
    bridgeSend,
  ]);

  // Debounced: persist edits and re-render the host preview with fresh data.
  useEffect(() => {
    if (viewMode !== 'preview' || !bridgeConnected || !dirty) return;
    const timer = setTimeout(async () => {
      await doc.save();
      bridgeSend('refresh');
    }, 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, viewMode, bridgeConnected, dirty]);

  // Palette filtered to what the connected host actually implements (its
  // advertised registry); falls back to the full catalog when no host manifest.
  const previewSupportedTypes =
    hostRegistry.length > 0 ? new Set(hostRegistry.map((c) => c.type)) : null;
  const previewPaletteCatalog = previewSupportedTypes
    ? componentCatalog.filter((c) => previewSupportedTypes.has(c.type))
    : componentCatalog;

  return {
    previewFrameRef,
    previewRects,
    previewHoveredId,
    previewDropzones,
    bridgeConnected,
    bridgeSend,
    previewPaletteCatalog,
    duplicateSelected,
    deleteSelected,
    handlePaletteDrop,
  };
};
