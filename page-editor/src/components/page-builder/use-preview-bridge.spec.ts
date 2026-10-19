import { usePreviewBridge } from './use-preview-bridge';
import { BRIDGE_CHANNEL, BRIDGE_VERSION } from './preview/preview-bridge';
import type { Page } from './types';
import { act, renderHookWithProviders, waitFor } from '../../test-utils/render';
import { installMockServer } from '../../test-utils/msw';
import {
  buildComponentElement,
  buildComponentType,
  buildLayoutElement,
  localized,
} from '../../test-utils/factories';
import type { PageDocument } from './use-page-document';
import type { ElementSelection } from './use-element-selection';

installMockServer();

const HOST_ORIGIN = 'https://shop.example.test';

const page = (): Page => ({
  HEAD: [],
  MAIN: [
    buildLayoutElement({
      id: 'layout-1',
      children: [
        buildComponentElement({ id: 'c1', settings: { title: 'One' } }),
        buildComponentElement({ id: 'c2', settings: { title: 'Two' } }),
      ],
    }),
    buildLayoutElement({ id: 'layout-2', children: [] }),
  ],
  FOOTER: [],
});

/** A stand-in PageDocument exposing only what the bridge reads. */
const fakeDoc = (over: Partial<PageDocument> = {}) =>
  ({
    page: page(),
    pushHistory: jest.fn(),
    dirty: false,
    save: jest.fn(async () => undefined),
    ...over,
  } as unknown as PageDocument);

const fakeSelection = (over: Partial<ElementSelection> = {}) =>
  ({
    layoutId: null,
    compId: null,
    elementId: null,
    scrollOnSelect: { current: false },
    selectLayout: jest.fn(),
    selectComp: jest.fn(),
    ...over,
  } as unknown as ElementSelection);

const setup = (
  over: {
    doc?: PageDocument;
    selection?: ElementSelection;
    draggedType?: string | null;
    viewMode?: 'edit' | 'preview';
    previewEnabled?: boolean;
    hostOrigin?: string | null;
  } = {}
) => {
  const doc = over.doc ?? fakeDoc();
  const selection = over.selection ?? fakeSelection();
  const setDraggedType = jest.fn();
  const rendered = renderHookWithProviders(() =>
    usePreviewBridge({
      doc,
      selection,
      componentCatalog: [
        buildComponentType({ type: 'content/hero', name: localized('Hero') }),
      ],
      draggedType: over.draggedType ?? null,
      setDraggedType,
      viewMode: over.viewMode ?? 'preview',
      previewEnabled: over.previewEnabled ?? true,
      previewLocale: 'en-US',
      hostOrigin: over.hostOrigin === undefined ? HOST_ORIGIN : over.hostOrigin,
    })
  );
  return { doc, selection, setDraggedType, ...rendered };
};

/** Attach a fake iframe and announce the host, so the bridge is connected. */
const connect = async (
  rendered: ReturnType<typeof setup>,
  components?: Array<{ type: string }>
) => {
  const postMessage = jest.fn();
  act(() => {
    (rendered.result.current.previewFrameRef as { current: unknown }).current =
      { contentWindow: { postMessage } };
  });
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: HOST_ORIGIN,
        data: {
          channel: BRIDGE_CHANNEL,
          v: BRIDGE_VERSION,
          type: 'ready',
          payload: { v: 1, capabilities: {}, components },
        },
      })
    );
  });
  await waitFor(() =>
    expect(rendered.result.current.bridgeConnected).toBe(true)
  );
  return postMessage;
};

const hostSays = (type: string, payload: unknown) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: HOST_ORIGIN,
        data: { channel: BRIDGE_CHANNEL, v: BRIDGE_VERSION, type, payload },
      })
    );
  });

describe('usePreviewBridge connection', () => {
  it('starts disconnected with no geometry', () => {
    const { result } = setup();
    expect(result.current.bridgeConnected).toBe(false);
    expect(result.current.previewRects).toEqual({});
    expect(result.current.previewDropzones).toEqual([]);
    expect(result.current.previewHoveredId).toBeNull();
  });

  it('does not connect while the builder is in edit mode', async () => {
    const rendered = setup({ viewMode: 'edit' });
    hostSays('ready', { v: 1, capabilities: {} });
    expect(rendered.result.current.bridgeConnected).toBe(false);
  });

  it('does not connect when preview is disabled for the project', () => {
    const rendered = setup({ previewEnabled: false });
    hostSays('ready', { v: 1, capabilities: {} });
    expect(rendered.result.current.bridgeConnected).toBe(false);
  });

  it('initializes the host and asks for geometry once connected', async () => {
    const rendered = setup();
    const postMessage = await connect(rendered);

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'init',
        payload: { mode: 'preview', selectedId: null, locale: 'en-US' },
      }),
      HOST_ORIGIN
    );
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'requestRects' }),
      HOST_ORIGIN
    );
  });
});

describe('usePreviewBridge geometry', () => {
  it('records the rects the host reports, keyed by element id', async () => {
    const rendered = setup();
    await connect(rendered);

    hostSays('rects', {
      items: [{ id: 'c1', rect: { top: 1, left: 2, width: 3, height: 4 } }],
    });

    expect(rendered.result.current.previewRects).toEqual({
      c1: { top: 1, left: 2, width: 3, height: 4 },
    });
  });

  it('records reported dropzones', async () => {
    const rendered = setup();
    await connect(rendered);
    const zone = {
      section: 'MAIN',
      layoutId: 'layout-1',
      index: 0,
      rect: { top: 0, left: 0, width: 10, height: 10 },
    };

    hostSays('rects', { items: [], dropzones: [zone] });
    expect(rendered.result.current.previewDropzones).toEqual([zone]);
  });

  it('clears dropzones when the host reports none', async () => {
    const rendered = setup();
    await connect(rendered);
    hostSays('rects', {
      items: [],
      dropzones: [
        {
          section: 'MAIN',
          layoutId: null,
          index: 0,
          rect: { top: 0, left: 0, width: 1, height: 1 },
        },
      ],
    });
    hostSays('rects', { items: [] });
    expect(rendered.result.current.previewDropzones).toEqual([]);
  });

  it('tracks the hovered element', async () => {
    const rendered = setup();
    await connect(rendered);

    hostSays('hover', { id: 'c1' });
    expect(rendered.result.current.previewHoveredId).toBe('c1');

    hostSays('hover', { id: null });
    expect(rendered.result.current.previewHoveredId).toBeNull();
  });
});

describe('usePreviewBridge selection from the rendered page', () => {
  it('selects a component clicked inside the iframe, without scrolling', async () => {
    const selection = fakeSelection();
    const rendered = setup({ selection });
    await connect(rendered);

    hostSays('select', { id: 'c1' });

    // Scrolling would jump the page under the user's cursor.
    expect(selection.selectComp).toHaveBeenCalledWith('layout-1', 'c1', {
      scroll: false,
    });
  });

  it('selects a layout clicked inside the iframe', async () => {
    const selection = fakeSelection();
    const rendered = setup({ selection });
    await connect(rendered);

    hostSays('select', { id: 'layout-1' });
    expect(selection.selectLayout).toHaveBeenCalledWith('layout-1', {
      scroll: false,
    });
  });

  it('ignores a selection for an element that is not on the page', async () => {
    const selection = fakeSelection();
    const rendered = setup({ selection });
    await connect(rendered);

    hostSays('select', { id: 'ghost' });
    expect(selection.selectComp).not.toHaveBeenCalled();
    expect(selection.selectLayout).not.toHaveBeenCalled();
  });

  it('mirrors the builder selection onto the rendered page', async () => {
    const selection = fakeSelection({ elementId: 'c1' });
    const rendered = setup({ selection });
    const postMessage = await connect(rendered);

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'highlight', payload: { id: 'c1' } }),
      HOST_ORIGIN
    );
  });

  it('scrolls the preview when the selection came from the builder UI', async () => {
    const selection = fakeSelection({
      elementId: 'c1',
      scrollOnSelect: { current: true },
    });
    const rendered = setup({ selection });
    const postMessage = await connect(rendered);

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'scrollTo', payload: { id: 'c1' } }),
      HOST_ORIGIN
    );
    // The flag is one-shot.
    expect(selection.scrollOnSelect.current).toBe(false);
  });
});

describe('usePreviewBridge inline text editing', () => {
  it('writes a plain setting value', async () => {
    const doc = fakeDoc();
    const rendered = setup({ doc });
    await connect(rendered);

    hostSays('field', { id: 'c1', key: 'title', value: 'Edited' });

    const next = (doc.pushHistory as jest.Mock).mock.calls[0][0] as Page;
    expect(next.MAIN[0].children[0].settings.title).toBe('Edited');
  });

  it('writes into the active preview locale for a localized setting', async () => {
    const doc = fakeDoc({
      page: {
        HEAD: [],
        MAIN: [
          buildLayoutElement({
            id: 'layout-1',
            children: [
              buildComponentElement({
                id: 'c1',
                settings: { title: { 'en-US': 'One', 'de-DE': 'Eins' } },
              }),
            ],
          }),
        ],
        FOOTER: [],
      },
    });
    const rendered = setup({ doc });
    await connect(rendered);

    hostSays('field', { id: 'c1', key: 'title', value: 'Edited' });

    const next = (doc.pushHistory as jest.Mock).mock.calls[0][0] as Page;
    expect(next.MAIN[0].children[0].settings.title).toEqual({
      'en-US': 'Edited',
      'de-DE': 'Eins',
    });
  });

  it('leaves sibling components untouched', async () => {
    const doc = fakeDoc();
    const rendered = setup({ doc });
    await connect(rendered);

    hostSays('field', { id: 'c1', key: 'title', value: 'Edited' });

    const next = (doc.pushHistory as jest.Mock).mock.calls[0][0] as Page;
    expect(next.MAIN[0].children[1].settings.title).toBe('Two');
  });

  it('ignores a field edit aimed at a layout rather than a component', async () => {
    const doc = fakeDoc();
    const rendered = setup({ doc });
    await connect(rendered);

    hostSays('field', { id: 'layout-1', key: 'title', value: 'Edited' });
    expect(doc.pushHistory).not.toHaveBeenCalled();
  });

  it('ignores a field edit for an unknown element', async () => {
    const doc = fakeDoc();
    const rendered = setup({ doc });
    await connect(rendered);

    hostSays('field', { id: 'ghost', key: 'title', value: 'Edited' });
    expect(doc.pushHistory).not.toHaveBeenCalled();
  });
});

describe('usePreviewBridge drag and drop', () => {
  const droppedPage = (doc: PageDocument) =>
    (doc.pushHistory as jest.Mock).mock.calls[0]?.[0] as Page | undefined;

  it('moves an existing component into another layout', async () => {
    const doc = fakeDoc();
    const rendered = setup({ doc });
    await connect(rendered);

    hostSays('drop', {
      dragId: 'c1',
      target: { section: 'MAIN', layoutId: 'layout-2', index: 0 },
    });

    const next = droppedPage(doc)!;
    expect(next.MAIN[0].children.map((c) => c.id)).toEqual(['c2']);
    expect(next.MAIN[1].children.map((c) => c.id)).toEqual(['c1']);
  });

  it('adjusts the index for a move within the same layout', async () => {
    // The host reports the index against the pre-removal sibling list.
    const doc = fakeDoc();
    const rendered = setup({ doc });
    await connect(rendered);

    hostSays('drop', {
      dragId: 'c1',
      target: { section: 'MAIN', layoutId: 'layout-1', index: 2 },
    });

    const next = droppedPage(doc)!;
    expect(next.MAIN[0].children.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('inserts a new component from the palette', async () => {
    const doc = fakeDoc();
    const rendered = setup({ doc });
    await connect(rendered);

    hostSays('drop', {
      type: 'content/hero',
      target: { section: 'MAIN', layoutId: 'layout-2', index: 0 },
    });

    const next = droppedPage(doc)!;
    expect(next.MAIN[1].children).toHaveLength(1);
    expect(next.MAIN[1].children[0].type).toBe('content/hero');
    expect(next.MAIN[1].children[0].name).toEqual(localized('Hero'));
  });

  it('creates a new row when the drop target names no layout', async () => {
    const doc = fakeDoc();
    const rendered = setup({ doc });
    await connect(rendered);

    hostSays('drop', {
      type: 'content/hero',
      target: { section: 'MAIN', layoutId: null, index: 1 },
    });

    const next = droppedPage(doc)!;
    expect(next.MAIN).toHaveLength(3);
    expect(next.MAIN[1].kind).toBe('layout');
    expect(next.MAIN[1].width).toBe('1/1');
    expect(next.MAIN[1].children[0].type).toBe('content/hero');
  });

  it('ignores a drop of a component type the catalog does not know', async () => {
    const doc = fakeDoc();
    const rendered = setup({ doc });
    await connect(rendered);

    hostSays('drop', {
      type: 'unknown/thing',
      target: { section: 'MAIN', layoutId: 'layout-2', index: 0 },
    });
    expect(doc.pushHistory).not.toHaveBeenCalled();
  });

  it('ignores a drop of an element that is not on the page', async () => {
    const doc = fakeDoc();
    const rendered = setup({ doc });
    await connect(rendered);

    hostSays('drop', {
      dragId: 'ghost',
      target: { section: 'MAIN', layoutId: 'layout-2', index: 0 },
    });
    expect(doc.pushHistory).not.toHaveBeenCalled();
  });

  it('drops the dragged palette type and clears the drag', () => {
    const doc = fakeDoc();
    const { result, setDraggedType } = setup({
      doc,
      draggedType: 'content/hero',
    });

    act(() =>
      result.current.handlePaletteDrop({
        section: 'MAIN',
        layoutId: 'layout-2',
        index: 0,
      })
    );

    expect(doc.pushHistory).toHaveBeenCalled();
    expect(setDraggedType).toHaveBeenCalledWith(null);
  });

  it('ignores a palette drop when nothing is being dragged', () => {
    const doc = fakeDoc();
    const { result, setDraggedType } = setup({ doc, draggedType: null });

    act(() =>
      result.current.handlePaletteDrop({
        section: 'MAIN',
        layoutId: 'layout-2',
        index: 0,
      })
    );

    expect(doc.pushHistory).not.toHaveBeenCalled();
    expect(setDraggedType).not.toHaveBeenCalled();
  });
});

describe('usePreviewBridge selection actions', () => {
  it('duplicates the selected component right after it, with a fresh id', () => {
    const doc = fakeDoc();
    const { result } = setup({
      doc,
      selection: fakeSelection({ layoutId: 'layout-1', compId: 'c1' }),
    });

    act(() => result.current.duplicateSelected());

    const next = (doc.pushHistory as jest.Mock).mock.calls[0][0] as Page;
    const ids = next.MAIN[0].children.map((c) => c.id);
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBe('c1');
    expect(ids[1]).not.toBe('c1');
    expect(ids[2]).toBe('c2');
  });

  it('duplicates the selected layout, re-keying its children', () => {
    const doc = fakeDoc();
    const { result } = setup({
      doc,
      selection: fakeSelection({ layoutId: 'layout-1', compId: null }),
    });

    act(() => result.current.duplicateSelected());

    const next = (doc.pushHistory as jest.Mock).mock.calls[0][0] as Page;
    expect(next.MAIN).toHaveLength(3);
    const clone = next.MAIN[1];
    expect(clone.id).not.toBe('layout-1');
    expect(clone.children.map((c) => c.id)).not.toContain('c1');
  });

  it('does nothing when nothing is selected', () => {
    const doc = fakeDoc();
    const { result } = setup({ doc });
    act(() => result.current.duplicateSelected());
    expect(doc.pushHistory).not.toHaveBeenCalled();
  });

  it('does nothing when the selection points at a missing element', () => {
    const doc = fakeDoc();
    const { result } = setup({
      doc,
      selection: fakeSelection({ layoutId: 'ghost', compId: null }),
    });
    act(() => result.current.duplicateSelected());
    expect(doc.pushHistory).not.toHaveBeenCalled();
  });

  it('deletes the selected component and clears the selection', () => {
    const doc = fakeDoc();
    const selection = fakeSelection({ layoutId: 'layout-1', compId: 'c1' });
    const { result } = setup({ doc, selection });

    act(() => result.current.deleteSelected());

    const next = (doc.pushHistory as jest.Mock).mock.calls[0][0] as Page;
    expect(next.MAIN[0].children.map((c) => c.id)).toEqual(['c2']);
    expect(selection.selectLayout).toHaveBeenCalledWith(null);
  });

  it('deletes the selected layout and clears the selection', () => {
    const doc = fakeDoc();
    const selection = fakeSelection({ layoutId: 'layout-1', compId: null });
    const { result } = setup({ doc, selection });

    act(() => result.current.deleteSelected());

    const next = (doc.pushHistory as jest.Mock).mock.calls[0][0] as Page;
    expect(next.MAIN.map((l) => l.id)).toEqual(['layout-2']);
    expect(selection.selectLayout).toHaveBeenCalledWith(null);
  });

  it('does nothing when deleting with nothing selected', () => {
    const doc = fakeDoc();
    const { result } = setup({ doc });
    act(() => result.current.deleteSelected());
    expect(doc.pushHistory).not.toHaveBeenCalled();
  });
});

describe('usePreviewBridge palette filtering', () => {
  it('offers the whole catalog when the host advertises no registry', async () => {
    const rendered = setup();
    await connect(rendered);
    expect(rendered.result.current.previewPaletteCatalog).toHaveLength(1);
  });

  it('offers only what the connected host can render', async () => {
    const rendered = setup();
    await connect(rendered, [{ type: 'something/else' }]);
    expect(rendered.result.current.previewPaletteCatalog).toEqual([]);
  });

  it('keeps a component the host does advertise', async () => {
    const rendered = setup();
    await connect(rendered, [{ type: 'content/hero' }]);
    expect(
      rendered.result.current.previewPaletteCatalog.map((c) => c.type)
    ).toEqual(['content/hero']);
  });
});

describe('usePreviewBridge auto-save', () => {
  // Real timers: faking them fights the connect handshake, which itself awaits.
  // The debounce is 700ms, so these two tests are deliberately the slow ones.
  it('saves and refreshes the host after edits settle', async () => {
    const doc = fakeDoc({ dirty: true });
    const rendered = setup({ doc });
    const postMessage = await connect(rendered);

    await waitFor(() => expect(doc.save).toHaveBeenCalled(), { timeout: 3000 });
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'refresh' }),
        HOST_ORIGIN
      )
    );
  });

  it('does not save while the page is clean', async () => {
    const doc = fakeDoc({ dirty: false });
    const rendered = setup({ doc });
    await connect(rendered);

    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(doc.save).not.toHaveBeenCalled();
  });
});
