/* eslint-disable testing-library/no-node-access --
 * `.children` here is a field on PageNode / LayoutElement, not a DOM node.
 * These are pure data assertions; nothing renders. */
import { renderHook, act } from '@testing-library/react';
import { usePageMutations } from './use-page-mutations';
import type { ComponentElement, LayoutElement, Page } from '../types';

const ALL = { mobile: true, tablet: true, desktop: true };

const comp = (id: string): ComponentElement => ({
  id,
  type: 'content/text',
  name: {},
  visibility: { ...ALL },
  settings: {},
});

const layout = (
  id: string,
  children: ComponentElement[] = []
): LayoutElement => ({
  id,
  kind: 'layout',
  width: '1/1',
  name: {},
  visibility: { ...ALL },
  children,
});

const basePage = (): Page => ({
  HEAD: [],
  MAIN: [
    layout('l1', [comp('c1'), comp('c2')]),
    layout('l2', [comp('c3')]),
    layout('l3'),
  ],
  FOOTER: [],
});

const setup = (
  over: {
    page?: Page;
    selectedLayoutId?: string | null;
    draggedComponentType?: string | null;
    componentCatalog?: Array<{ type: string; name: Record<string, string> }>;
  } = {}
) => {
  const onPageChange = jest.fn();
  const onSelectLayout = jest.fn();
  const page = over.page ?? basePage();
  const { result } = renderHook(() =>
    usePageMutations({
      page,
      onPageChange,
      componentCatalog: (over.componentCatalog ?? []) as never,
      draggedComponentType: over.draggedComponentType ?? null,
      selectedLayoutId: over.selectedLayoutId ?? null,
      onSelectLayout,
      defaultLocale: 'en-US',
    })
  );
  const nextPage = (): Page => onPageChange.mock.calls.at(-1)![0];
  return { result, onPageChange, onSelectLayout, page, nextPage };
};

const ids = (p: Page, section = 'MAIN') => p[section].map((l) => l.id);

describe('reorderLayout', () => {
  it('moves a layout to the target position', () => {
    const { result, nextPage } = setup();
    act(() => result.current.reorderLayout('MAIN', 'l3', 'l1'));
    expect(ids(nextPage())).toEqual(['l3', 'l1', 'l2']);
  });

  it('does nothing when source and target are the same', () => {
    const { result, onPageChange } = setup();
    act(() => result.current.reorderLayout('MAIN', 'l1', 'l1'));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('does nothing when an id is not in the section', () => {
    const { result, onPageChange } = setup();
    act(() => result.current.reorderLayout('MAIN', 'l1', 'nope'));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('leaves other sections untouched', () => {
    const { result, nextPage, page } = setup();
    act(() => result.current.reorderLayout('MAIN', 'l3', 'l1'));
    expect(nextPage().HEAD).toBe(page.HEAD);
  });
});

describe('duplicateLayout', () => {
  it('inserts the clone directly after the source', () => {
    const { result, nextPage } = setup();
    act(() => result.current.duplicateLayout('MAIN', 'l1'));
    const after = nextPage().MAIN;
    expect(after).toHaveLength(4);
    expect(after[0].id).toBe('l1');
    expect(after[2].id).toBe('l2');
  });

  // A clone that reused ids would collide with the original once saved.
  it('gives the clone and all its children fresh ids', () => {
    const { result, nextPage } = setup();
    act(() => result.current.duplicateLayout('MAIN', 'l1'));
    const [orig, clone] = nextPage().MAIN;
    expect(clone.id).not.toBe(orig.id);
    expect(clone.children.map((c) => c.id)).toHaveLength(2);
    for (const child of clone.children) {
      expect(orig.children.map((c) => c.id)).not.toContain(child.id);
    }
  });

  it('does nothing for an unknown layout', () => {
    const { result, onPageChange } = setup();
    act(() => result.current.duplicateLayout('MAIN', 'nope'));
    expect(onPageChange).not.toHaveBeenCalled();
  });
});

describe('duplicateComp', () => {
  it('inserts the copy after the source with a fresh id', () => {
    const { result, nextPage } = setup();
    act(() => result.current.duplicateComp('MAIN', 'l1', 'c1'));
    const children = nextPage().MAIN[0].children;
    expect(children.map((c) => c.id)[0]).toBe('c1');
    expect(children).toHaveLength(3);
    expect(children[1].id).not.toBe('c1');
    expect(children[2].id).toBe('c2');
  });

  it('does nothing for an unknown component', () => {
    const { result, onPageChange } = setup();
    act(() => result.current.duplicateComp('MAIN', 'l1', 'nope'));
    expect(onPageChange).not.toHaveBeenCalled();
  });
});

describe('deleteLayout', () => {
  it('removes the layout', () => {
    const { result, nextPage } = setup();
    act(() => result.current.deleteLayout('MAIN', 'l2'));
    expect(ids(nextPage())).toEqual(['l1', 'l3']);
  });

  // Otherwise the settings pane keeps editing something that is gone.
  it('clears the selection when the deleted layout was selected', () => {
    const { result, onSelectLayout } = setup({ selectedLayoutId: 'l2' });
    act(() => result.current.deleteLayout('MAIN', 'l2'));
    expect(onSelectLayout).toHaveBeenCalledWith(null);
  });

  it('leaves the selection alone when a different layout is deleted', () => {
    const { result, onSelectLayout } = setup({ selectedLayoutId: 'l1' });
    act(() => result.current.deleteLayout('MAIN', 'l2'));
    expect(onSelectLayout).not.toHaveBeenCalled();
  });
});

describe('deleteComp', () => {
  it('removes only that component from only that layout', () => {
    const { result, nextPage } = setup();
    act(() => result.current.deleteComp('MAIN', 'l1', 'c1'));
    const after = nextPage().MAIN;
    expect(after[0].children.map((c) => c.id)).toEqual(['c2']);
    expect(after[1].children.map((c) => c.id)).toEqual(['c3']);
  });
});

describe('toggleSection', () => {
  it('flips a section between collapsed and expanded', () => {
    const { result } = setup();
    expect(result.current.collapsedSections.MAIN).toBeUndefined();
    act(() => result.current.toggleSection('MAIN'));
    expect(result.current.collapsedSections.MAIN).toBe(true);
    act(() => result.current.toggleSection('MAIN'));
    expect(result.current.collapsedSections.MAIN).toBe(false);
  });

  it('tracks sections independently', () => {
    const { result } = setup();
    act(() => result.current.toggleSection('MAIN'));
    expect(result.current.collapsedSections.HEAD).toBeUndefined();
  });
});

describe('immutability', () => {
  it('never mutates the page it was given', () => {
    const page = basePage();
    const snapshot = structuredClone(page);
    const { result } = setup({ page });
    act(() => result.current.reorderLayout('MAIN', 'l3', 'l1'));
    act(() => result.current.duplicateLayout('MAIN', 'l1'));
    act(() => result.current.deleteComp('MAIN', 'l1', 'c1'));
    expect(page).toEqual(snapshot);
  });
});

// ── Component reordering and palette drops ──────────────────────────────────

const CATALOG = [{ type: 'content/hero', name: { 'en-US': 'Hero' } }];

/** `updateComponents` defers its write to a microtask so a burst coalesces. */
const flushMicrotasks = () => act(async () => undefined);

describe('updateComponents', () => {
  it('writes the reordered children of a layout', async () => {
    const { result, nextPage } = setup();
    act(() =>
      result.current.updateComponents('MAIN', 'l1', [comp('c2'), comp('c1')])
    );
    await flushMicrotasks();

    expect(nextPage().MAIN[0].children.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('does nothing when the order is unchanged', async () => {
    const { result, onPageChange } = setup();
    act(() =>
      result.current.updateComponents('MAIN', 'l1', [comp('c1'), comp('c2')])
    );
    await flushMicrotasks();

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('writes when a component is removed from the list', async () => {
    const { result, nextPage } = setup();
    act(() => result.current.updateComponents('MAIN', 'l1', [comp('c1')]));
    await flushMicrotasks();

    expect(nextPage().MAIN[0].children.map((c) => c.id)).toEqual(['c1']);
  });

  it('coalesces a burst of updates into one page change', async () => {
    const { result, onPageChange, nextPage } = setup();
    act(() => {
      result.current.updateComponents('MAIN', 'l1', [comp('c2'), comp('c1')]);
      result.current.updateComponents('MAIN', 'l2', []);
    });
    await flushMicrotasks();

    expect(onPageChange).toHaveBeenCalledTimes(1);
    const next = nextPage();
    expect(next.MAIN[0].children.map((c) => c.id)).toEqual(['c2', 'c1']);
    expect(next.MAIN[1].children).toEqual([]);
  });

  it('leaves other layouts untouched', async () => {
    const { result, nextPage } = setup();
    act(() =>
      result.current.updateComponents('MAIN', 'l1', [comp('c2'), comp('c1')])
    );
    await flushMicrotasks();

    expect(nextPage().MAIN[1].children.map((c) => c.id)).toEqual(['c3']);
  });

  it('ignores a layout that is not in the section', async () => {
    const { result, onPageChange, page } = setup();
    act(() => result.current.updateComponents('MAIN', 'ghost', [comp('c9')]));
    await flushMicrotasks();

    // The layout id matched nothing, so the page is rewritten unchanged rather
    // than losing a row.
    const next = onPageChange.mock.calls.at(-1)?.[0] ?? page;
    expect(ids(next)).toEqual(['l1', 'l2', 'l3']);
  });
});

describe('dropNewComp', () => {
  it('appends the dragged component to the target layout', () => {
    const { result, nextPage } = setup({
      draggedComponentType: 'content/hero',
      componentCatalog: CATALOG,
    });
    act(() => result.current.dropNewComp('MAIN', 'l3'));

    const dropped = nextPage().MAIN[2].children;
    expect(dropped).toHaveLength(1);
    expect(dropped[0].type).toBe('content/hero');
    expect(dropped[0].name).toEqual({ 'en-US': 'Hero' });
    expect(dropped[0].visibility).toEqual(ALL);
  });

  it('keeps the components already in the layout', () => {
    const { result, nextPage } = setup({
      draggedComponentType: 'content/hero',
      componentCatalog: CATALOG,
    });
    act(() => result.current.dropNewComp('MAIN', 'l1'));

    expect(
      nextPage()
        .MAIN[0].children.map((c) => c.id)
        .slice(0, 2)
    ).toEqual(['c1', 'c2']);
  });

  it('does nothing when nothing is being dragged', () => {
    const { result, onPageChange } = setup({ componentCatalog: CATALOG });
    act(() => result.current.dropNewComp('MAIN', 'l3'));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('does nothing for a type the catalog does not know', () => {
    const { result, onPageChange } = setup({
      draggedComponentType: 'unknown/thing',
      componentCatalog: CATALOG,
    });
    act(() => result.current.dropNewComp('MAIN', 'l3'));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('gives each dropped component a distinct id', () => {
    const { result, onPageChange } = setup({
      draggedComponentType: 'content/hero',
      componentCatalog: CATALOG,
    });
    act(() => result.current.dropNewComp('MAIN', 'l3'));
    act(() => result.current.dropNewComp('MAIN', 'l3'));

    const first = onPageChange.mock.calls[0][0] as Page;
    const second = onPageChange.mock.calls[1][0] as Page;
    expect(first.MAIN[2].children[0].id).not.toBe(
      second.MAIN[2].children[0].id
    );
  });
});

describe('dropNewComponentIntoEmptySection', () => {
  it('creates a full-width row holding the dropped component', () => {
    const { result, nextPage } = setup({
      page: { HEAD: [], MAIN: [], FOOTER: [] },
      draggedComponentType: 'content/hero',
      componentCatalog: CATALOG,
    });
    act(() => result.current.dropNewComponentIntoEmptySection('MAIN'));

    const rows = nextPage().MAIN;
    expect(rows).toHaveLength(1);
    expect(rows[0].width).toBe('1/1');
    expect(rows[0].children[0].type).toBe('content/hero');
  });

  it('names the row in the project default locale', () => {
    const { result, nextPage } = setup({
      page: { HEAD: [], MAIN: [], FOOTER: [] },
      draggedComponentType: 'content/hero',
      componentCatalog: CATALOG,
    });
    act(() => result.current.dropNewComponentIntoEmptySection('MAIN'));

    expect(nextPage().MAIN[0].name).toEqual({ 'en-US': 'New 1/1 layout' });
  });

  it('derives the row id from the section', () => {
    const { result, nextPage } = setup({
      page: { HEAD: [], MAIN: [], FOOTER: [] },
      draggedComponentType: 'content/hero',
      componentCatalog: CATALOG,
    });
    act(() => result.current.dropNewComponentIntoEmptySection('FOOTER'));

    expect(nextPage().FOOTER[0].id).toContain('footer');
  });

  it('appends to a section that already has rows', () => {
    const { result, nextPage } = setup({
      draggedComponentType: 'content/hero',
      componentCatalog: CATALOG,
    });
    act(() => result.current.dropNewComponentIntoEmptySection('MAIN'));

    expect(nextPage().MAIN).toHaveLength(4);
  });

  it('does nothing when nothing is being dragged', () => {
    const { result, onPageChange } = setup({ componentCatalog: CATALOG });
    act(() => result.current.dropNewComponentIntoEmptySection('MAIN'));
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('does nothing for an unknown component type', () => {
    const { result, onPageChange } = setup({
      draggedComponentType: 'unknown/thing',
      componentCatalog: CATALOG,
    });
    act(() => result.current.dropNewComponentIntoEmptySection('MAIN'));
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
