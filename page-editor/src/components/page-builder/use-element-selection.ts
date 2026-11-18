import { useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';

/**
 * Which layout / component the builder currently has selected, kept in sync with
 * the `layout` and `comp` query parameters so a selection survives a reload and
 * can be deep-linked.
 *
 * `scrollOnSelect` is a flag rather than state on purpose: the preview bridge
 * reads it once, immediately after a selection change, to decide whether to
 * scroll the rendered page to the element. Selections that originate from a
 * click *inside* the iframe pass `{ scroll: false }` so the page does not jump
 * under the user's cursor.
 */
export const useElementSelection = () => {
  const routerHistory = useHistory();
  const location = useLocation();

  // Read once on mount: lazy initialisers, so the URL isn't re-parsed on every
  // render only for React to discard the result.
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(() =>
    new URLSearchParams(location.search).get('layout')
  );
  const [selectedCompId, setSelectedCompId] = useState<string | null>(() =>
    new URLSearchParams(location.search).get('comp')
  );
  const scrollOnSelect = useRef(false);

  const selectLayout = (id: string | null, opts?: { scroll?: boolean }) => {
    scrollOnSelect.current = opts?.scroll !== false;
    setSelectedLayoutId(id);
    setSelectedCompId(null);
    const params = new URLSearchParams(location.search);
    if (id) {
      params.set('layout', id);
      params.delete('comp');
    } else {
      params.delete('layout');
      params.delete('comp');
    }
    routerHistory.replace({ search: params.toString() });
  };

  const selectComp = (
    layoutId: string,
    compId: string,
    opts?: { scroll?: boolean }
  ) => {
    scrollOnSelect.current = opts?.scroll !== false;
    // Keep the parent layout id set so the settings pane can locate the
    // component (it resolves the component via its layout). The layout's
    // visual selection is suppressed in the canvas while a component is
    // selected, see LayoutBlock `selected` in layout-canvas/index.tsx.
    setSelectedLayoutId(layoutId);
    setSelectedCompId(compId);
    const params = new URLSearchParams(location.search);
    params.set('layout', layoutId);
    params.set('comp', compId);
    routerHistory.replace({ search: params.toString() });
  };

  return {
    layoutId: selectedLayoutId,
    compId: selectedCompId,
    /** The component if one is selected, else the layout, else nothing. */
    elementId: selectedCompId ?? selectedLayoutId ?? null,
    scrollOnSelect,
    selectLayout,
    selectComp,
  };
};

export type ElementSelection = ReturnType<typeof useElementSelection>;
