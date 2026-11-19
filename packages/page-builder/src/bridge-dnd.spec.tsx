// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VisualEditingBridge } from './bridge.js';
import { BRIDGE_CHANNEL, BRIDGE_VERSION } from './contract.js';

/**
 * On-render reordering and drop-zone geometry. jsdom reports zero for every layout rectangle,
 * so each element's rectangle is stubbed explicitly.
 */

const ORIGIN = 'https://mc.example.test';
let postMessage: ReturnType<typeof vi.fn>;
let originalParent: PropertyDescriptor | undefined;

beforeEach(() => {
  window.history.replaceState({}, '', `/?pb_edit=1&pb_origin=${encodeURIComponent(ORIGIN)}`);
  postMessage = vi.fn();
  originalParent = Object.getOwnPropertyDescriptor(window, 'parent');
  Object.defineProperty(window, 'parent', { configurable: true, value: { postMessage } });
});

afterEach(() => {
  if (originalParent) Object.defineProperty(window, 'parent', originalParent);
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  // @ts-expect-error — test-only cleanup of the jsdom gap we filled
  delete document.elementFromPoint;
});

type Box = { top: number; left?: number; width?: number; height: number };
const boxes: Record<string, Box> = {
  MAIN: { top: 0, left: 0, width: 1000, height: 600 },
  L1: { top: 100, left: 0, width: 1000, height: 200 }, // full-width row 1 (two components inside)
  C1: { top: 100, left: 0, width: 1000, height: 80 },
  C2: { top: 200, left: 0, width: 1000, height: 80 },
  L2: { top: 400, left: 0, width: 500, height: 100 }, // row 2, left half
  L3: { top: 402, left: 500, width: 500, height: 100 }, // row 2, right half (tops within 8px: same row)
  L4: { top: 560, left: 0, width: 1000, height: 40 }, // empty layout further down: row 3
};

function stub(el: Element, id: string): void {
  const b = boxes[id];
  const left = b.left ?? 0;
  const width = b.width ?? 100;
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ top: b.top, left, width, height: b.height, bottom: b.top + b.height, right: left + width, x: left, y: b.top, toJSON: () => ({}) }) as DOMRect;
}

function buildPage(): Record<string, HTMLElement> {
  document.body.innerHTML = `
    <div data-pb-section="MAIN" data-pb-kind="section" data-pb-dropzone='{"section":"MAIN","layoutId":null}' id="MAIN">
      <div data-pb-id="L1" data-pb-kind="layout" data-pb-dropzone='{"section":"MAIN","layoutId":"L1"}' id="L1">
        <div data-pb-id="C1" data-pb-kind="component" data-pb-type="content/hero" id="C1"></div>
        <div data-pb-id="C2" data-pb-kind="component" data-pb-type="content/hero" id="C2"></div>
      </div>
      <div data-pb-id="L2" data-pb-kind="layout" data-pb-dropzone='{"section":"MAIN","layoutId":"L2"}' id="L2"></div>
      <div data-pb-id="L3" data-pb-kind="layout" data-pb-dropzone='{"section":"MAIN","layoutId":"L3"}' id="L3"></div>
      <div data-pb-id="L4" data-pb-kind="layout" data-pb-dropzone='{"section":"MAIN","layoutId":"L4"}' id="L4"></div>
    </div>`;
  const els = Object.fromEntries(Object.keys(boxes).map((id) => [id, document.getElementById(id)!]));
  for (const [id, el] of Object.entries(els)) stub(el, id);
  return els;
}

const mount = () => render(<VisualEditingBridge allowedOrigins={ORIGIN} components={[]} onRefresh={() => {}} />);
const posted = (type: string) => postMessage.mock.calls.filter(([m]) => m?.type === type).map(([m]) => m.payload);

const fromBuilder = (type: string, payload?: unknown) =>
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { origin: ORIGIN, data: { channel: BRIDGE_CHANNEL, v: BRIDGE_VERSION, type, payload } }));
  });

function dragEvent(type: string, target: Element, init: { x?: number; y?: number } = {}): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, {
    clientX: init.x ?? 10,
    clientY: init.y ?? 0,
    dataTransfer: { effectAllowed: '', dropEffect: '', setData: vi.fn() },
  });
  act(() => void target.dispatchEvent(e));
  return e;
}

const dropLine = (): HTMLElement | undefined =>
  Array.from(document.body.querySelectorAll<HTMLElement>('div')).find((d) => d.style.background === 'rgb(59, 130, 246)' && d.style.position === 'fixed');

describe('drop-zone geometry', () => {
  it('reports a zone above the first row and below each row of the section, and between components', () => {
    buildPage();
    mount();
    fromBuilder('requestRects');
    const { dropzones, items } = posted('rects').at(-1);
    expect(items.map((i: { id: string }) => i.id)).toEqual(['L1', 'C1', 'C2', 'L2', 'L3', 'L4']);

    const main = dropzones.filter((z: { layoutId: string | null }) => z.layoutId === null);
    // rows: [L1], [L2, L3] (same visual row), [L4] → index 0 + cumulative 1, 3, 4
    expect(main.map((z: { index: number }) => z.index)).toEqual([0, 1, 3, 4]);
    expect(main[0].rect).toEqual({ top: 100 - 6, left: 0, width: 1000, height: 12 }); // above the first row
    expect(main[1].rect.top).toBe(300 - 6); // below row 1's bottom (100 + 200)
    expect(main[2].rect.top).toBe(502 - 6); // below the taller of L2/L3 (402 + 100)

    const inL1 = dropzones.filter((z: { layoutId: string | null }) => z.layoutId === 'L1');
    expect(inL1.map((z: { index: number }) => z.index)).toEqual([0, 1, 2]); // before C1, before C2, after C2
    expect(inL1.map((z: { rect: { top: number } }) => z.rect.top + 6)).toEqual([100, 200, 280]);

    const inEmpty = dropzones.filter((z: { layoutId: string | null }) => z.layoutId === 'L2');
    expect(inEmpty).toHaveLength(1); // an empty layout offers one zone, in its middle
    expect(inEmpty[0].rect.top + 6).toBe(400 + 50);
  });

  it('puts the only section zone at the top of an empty section', () => {
    document.body.innerHTML = `<div data-pb-section="MAIN" data-pb-dropzone='{"section":"MAIN","layoutId":null}' id="MAIN"></div>`;
    stub(document.getElementById('MAIN')!, 'MAIN');
    mount();
    fromBuilder('requestRects');
    const main = posted('rects').at(-1).dropzones;
    expect(main).toHaveLength(1);
    expect(main[0]).toMatchObject({ section: 'MAIN', layoutId: null, index: 0 });
  });

  it('skips a drop-zone marker whose metadata is not valid JSON, and defaults the section name', () => {
    document.body.innerHTML = `
      <div data-pb-dropzone="{not json"></div>
      <div data-pb-dropzone='{"layoutId":null}' id="MAIN"></div>`;
    stub(document.getElementById('MAIN')!, 'MAIN');
    mount();
    fromBuilder('requestRects');
    expect(posted('rects').at(-1).dropzones).toEqual([expect.objectContaining({ section: 'MAIN', layoutId: null })]);
  });
});

describe('on-render reordering', () => {
  it('drags a layout and drops it at the row index under the cursor', () => {
    const els = buildPage();
    mount();
    dragEvent('dragstart', els.L2);
    // Cursor below L1's midpoint (200) and above L2's (450): index 1.
    const over = dragEvent('dragover', els.MAIN, { y: 300 });
    expect(over.defaultPrevented).toBe(true);
    expect(dropLine()?.style.display).toBe('block');
    dragEvent('drop', els.MAIN, { y: 300 });
    expect(posted('drop')).toEqual([{ dragId: 'L2', target: { section: 'MAIN', layoutId: null, index: 1 } }]);
    expect(dropLine()?.style.display).toBe('none'); // cleared after the drop
  });

  it('computes index 0 above everything and the list length below everything for layouts', () => {
    const els = buildPage();
    mount();
    dragEvent('dragstart', els.L4);
    dragEvent('drop', els.MAIN, { y: 0 });
    dragEvent('dragstart', els.L4);
    dragEvent('drop', els.MAIN, { y: 9999 });
    expect(posted('drop').map((p) => p.target.index)).toEqual([0, 4]);
  });

  it('drags a component into the cell under the pointer, at the right position', () => {
    const els = buildPage();
    mount();
    document.elementFromPoint = vi.fn(() => els.C1);
    dragEvent('dragstart', els.C2);
    dragEvent('drop', els.C1, { y: 150 }); // above C1's midpoint (140)? 150 > 140, so after C1
    expect(posted('drop')).toEqual([{ dragId: 'C2', target: { section: 'MAIN', layoutId: 'L1', index: 1 } }]);
  });

  it('lines up with the first component when dropping above it', () => {
    const els = buildPage();
    mount();
    document.elementFromPoint = vi.fn(() => els.C1);
    dragEvent('dragstart', els.C2);
    dragEvent('dragover', els.C1, { y: 101 });
    expect(dropLine()?.style.top).toBe('99px'); // at.top - 1
    expect(dropLine()?.style.height).toBe('3px');
    dragEvent('dragover', els.C1, { y: 290 });
    expect(dropLine()?.style.top).toBe(`${280 - 1}px`); // after the last component: bottom - 1
  });

  it('shows the line at the container top for an empty cell', () => {
    const els = buildPage();
    mount();
    document.elementFromPoint = vi.fn(() => els.L2);
    dragEvent('dragstart', els.C1);
    dragEvent('dragover', els.L2, { y: 420 });
    expect(dropLine()?.style.top).toBe('400px');
  });

  it('falls back to a new row when a component is dropped outside any layout', () => {
    const els = buildPage();
    mount();
    document.elementFromPoint = vi.fn(() => document.body);
    dragEvent('dragstart', els.C1);
    dragEvent('drop', els.MAIN, { y: 9999 });
    expect(posted('drop')).toEqual([{ dragId: 'C1', target: { section: 'MAIN', layoutId: null, index: 4 } }]);
  });

  it('does nothing without a section marker', () => {
    document.body.innerHTML = `<div data-pb-id="C1" data-pb-kind="component" id="C1"></div>`;
    mount();
    dragEvent('dragstart', document.getElementById('C1')!);
    dragEvent('drop', document.body, { y: 5 });
    expect(posted('drop')).toEqual([]);
  });

  it('ignores drag events that did not start from a marked component or layout', () => {
    const els = buildPage();
    mount();
    dragEvent('dragstart', document.body); // not a marked element
    const over = dragEvent('dragover', els.MAIN, { y: 300 });
    expect(over.defaultPrevented).toBe(false);
    dragEvent('drop', els.MAIN, { y: 300 });
    expect(posted('drop')).toEqual([]);
  });

  it('does not start a drag from an inline-editable field', () => {
    document.body.innerHTML = `<div data-pb-id="C1" data-pb-kind="component"><span data-pb-field="title" id="f">t</span></div>`;
    mount();
    dragEvent('dragstart', document.getElementById('f')!);
    dragEvent('drop', document.body, { y: 5 });
    expect(posted('drop')).toEqual([]);
  });

  it('cancels a drag on dragend and hides the line', () => {
    const els = buildPage();
    mount();
    dragEvent('dragstart', els.L2);
    dragEvent('dragover', els.MAIN, { y: 300 });
    dragEvent('dragend', els.L2);
    expect(dropLine()?.style.display).toBe('none');
    dragEvent('drop', els.MAIN, { y: 300 });
    expect(posted('drop')).toEqual([]);
  });

  it('reports an error instead of throwing when computing a drop fails', () => {
    const els = buildPage();
    mount();
    document.elementFromPoint = vi.fn(() => {
      throw new Error('elementFromPoint blew up');
    });
    dragEvent('dragstart', els.C1);
    dragEvent('drop', els.C1, { y: 120 });
    expect(posted('error')).toEqual([{ message: 'drop failed: elementFromPoint blew up' }]);
  });

  it('survives a drag without dataTransfer', () => {
    const els = buildPage();
    mount();
    const e = new Event('dragstart', { bubbles: true, cancelable: true });
    act(() => void els.L2.dispatchEvent(e));
    dragEvent('drop', els.MAIN, { y: 300 });
    expect(posted('drop')).toHaveLength(1);
  });
});
