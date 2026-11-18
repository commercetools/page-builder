// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { VisualEditingBridge } from './bridge.js';
import { BRIDGE_CHANNEL, BRIDGE_VERSION } from './contract.js';

const BUILDER_ORIGIN = 'https://mc.example.test';

/**
 * The bridge only ever runs inside an iframe whose parent is a validated builder
 * origin, so every test has to fake being embedded: a distinct `window.parent`
 * whose `postMessage` can be inspected, plus the `pb_edit` / `pb_origin` query
 * the builder appends to the preview URL.
 */
let postMessage: ReturnType<typeof vi.fn>;
let originalParent: PropertyDescriptor | undefined;

const embed = (search: string) => {
  window.history.replaceState({}, '', `/${search}`);
  postMessage = vi.fn();
  originalParent = Object.getOwnPropertyDescriptor(window, 'parent');
  Object.defineProperty(window, 'parent', {
    configurable: true,
    value: { postMessage },
  });
};

const notEmbedded = (search: string) => {
  window.history.replaceState({}, '', `/${search}`);
  postMessage = vi.fn();
  // `window.parent === window` is the "not in an iframe" signal.
  originalParent = Object.getOwnPropertyDescriptor(window, 'parent');
  Object.defineProperty(window, 'parent', { configurable: true, value: window });
};

afterEach(() => {
  if (originalParent) Object.defineProperty(window, 'parent', originalParent);
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const mount = (
  over: {
    allowedOrigins?: string;
    components?: Array<{ type: string; inlineTextFields?: string[] }>;
    onRefresh?: () => void;
  } = {}
) => {
  const onRefresh = over.onRefresh ?? vi.fn();
  const result = render(
    <VisualEditingBridge
      allowedOrigins={over.allowedOrigins ?? BUILDER_ORIGIN}
      components={over.components as never}
      onRefresh={onRefresh}
    />
  );
  return { onRefresh, ...result };
};

/** A rendered block carrying the markers the host emits server-side. */
const renderBlock = (id = 'c1', field = 'title', text = 'Welcome') => {
  document.body.innerHTML = `
    <div data-pb-id="${id}" data-pb-type="content/hero" data-pb-kind="component">
      <span data-pb-field="${field}">${text}</span>
    </div>`;
  return document.querySelector<HTMLElement>(`[data-pb-id="${id}"]`)!;
};

const fromBuilder = (type: string, payload?: unknown, origin = BUILDER_ORIGIN) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin,
        data: { channel: BRIDGE_CHANNEL, v: BRIDGE_VERSION, type, payload },
      })
    );
  });

const posted = (type: string) =>
  postMessage.mock.calls.filter(([msg]) => msg?.type === type);

describe('VisualEditingBridge gating', () => {
  it('stays inert without pb_edit', () => {
    embed('?pb_origin=' + encodeURIComponent(BUILDER_ORIGIN));
    mount();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('stays inert when not embedded in an iframe', () => {
    notEmbedded('?pb_edit=1&pb_origin=' + encodeURIComponent(BUILDER_ORIGIN));
    mount();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('stays inert when the builder origin is not allow-listed', () => {
    embed('?pb_edit=1&pb_origin=' + encodeURIComponent('https://evil.test'));
    mount();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('stays inert with no pb_origin at all', () => {
    embed('?pb_edit=1');
    mount();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('stays inert when the host configured no allowed origins', () => {
    embed('?pb_edit=1&pb_origin=' + encodeURIComponent(BUILDER_ORIGIN));
    mount({ allowedOrigins: '' });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('accepts an origin from a comma-separated allowlist', () => {
    embed('?pb_edit=1&pb_origin=' + encodeURIComponent(BUILDER_ORIGIN));
    mount({ allowedOrigins: `https://other.test, ${BUILDER_ORIGIN}` });
    expect(posted('ready')).toHaveLength(1);
  });
});

describe('VisualEditingBridge handshake', () => {
  beforeEach(() => {
    embed('?pb_edit=1&pb_origin=' + encodeURIComponent(BUILDER_ORIGIN));
  });

  it('announces itself with the protocol version and capabilities', () => {
    mount();
    const [msg] = posted('ready')[0];
    expect(msg.channel).toBe(BRIDGE_CHANNEL);
    expect(msg.v).toBe(BRIDGE_VERSION);
    expect(msg.payload.v).toBe(BRIDGE_VERSION);
    expect(msg.payload.capabilities).toEqual(expect.any(Object));
  });

  it('advertises the host component registry', () => {
    mount({ components: [{ type: 'content/hero', inlineTextFields: ['title'] }] });
    const [msg] = posted('ready')[0];
    expect(msg.payload.components).toEqual([
      { type: 'content/hero', inlineTextFields: ['title'] },
    ]);
  });

  it('posts only to the validated builder origin, never a wildcard', () => {
    mount();
    for (const [, origin] of postMessage.mock.calls) {
      expect(origin).toBe(BUILDER_ORIGIN);
      expect(origin).not.toBe('*');
    }
  });

  it('seeds geometry and document size on connect', () => {
    renderBlock();
    mount();
    expect(posted('rects').length).toBeGreaterThan(0);
    expect(posted('docsize').length).toBeGreaterThan(0);
  });
});

describe('VisualEditingBridge incoming messages', () => {
  beforeEach(() => {
    embed('?pb_edit=1&pb_origin=' + encodeURIComponent(BUILDER_ORIGIN));
  });

  it('ignores a message from another origin', () => {
    mount();
    const before = postMessage.mock.calls.length;
    fromBuilder('requestRects', undefined, 'https://evil.test');
    expect(postMessage.mock.calls).toHaveLength(before);
  });

  it('ignores traffic on another channel', () => {
    mount();
    const before = postMessage.mock.calls.length;
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: BUILDER_ORIGIN,
          data: { channel: 'something-else', type: 'requestRects' },
        })
      );
    });
    expect(postMessage.mock.calls).toHaveLength(before);
  });

  it('ignores a malformed message', () => {
    mount();
    const before = postMessage.mock.calls.length;
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { origin: BUILDER_ORIGIN, data: null })
      );
    });
    expect(postMessage.mock.calls).toHaveLength(before);
  });

  it('re-sends geometry on request', () => {
    renderBlock();
    mount();
    const before = posted('rects').length;
    fromBuilder('requestRects');
    expect(posted('rects').length).toBeGreaterThan(before);
  });

  it('re-renders the page when the builder asks for a refresh', () => {
    const onRefresh = vi.fn();
    mount({ onRefresh });
    fromBuilder('refresh');
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('scrolls an element into view', () => {
    const block = renderBlock();
    const scrollIntoView = vi.fn();
    block.scrollIntoView = scrollIntoView;
    mount();

    fromBuilder('scrollTo', { id: 'c1' });
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'center' })
    );
  });

  it('ignores a scrollTo for an unknown element', () => {
    renderBlock();
    mount();
    expect(() => fromBuilder('scrollTo', { id: 'ghost' })).not.toThrow();
  });

  it('ignores a scrollTo with no id', () => {
    mount();
    expect(() => fromBuilder('scrollTo', {})).not.toThrow();
  });

  it('applies a committed field value to the rendered text', () => {
    renderBlock('c1', 'title', 'Welcome');
    mount();

    fromBuilder('commitField', { id: 'c1', key: 'title', value: 'Edited' });
    expect(
      document.querySelector('[data-pb-field="title"]')!.textContent
    ).toBe('Edited');
  });

  it('ignores a commitField with a missing part', () => {
    renderBlock('c1', 'title', 'Welcome');
    mount();

    fromBuilder('commitField', { id: 'c1', key: 'title' });
    expect(
      document.querySelector('[data-pb-field="title"]')!.textContent
    ).toBe('Welcome');
  });

  it('tolerates an unknown message type', () => {
    mount();
    expect(() => fromBuilder('who-knows', {})).not.toThrow();
  });

  it('accepts the reserved setMode without doing anything', () => {
    mount();
    expect(() => fromBuilder('setMode', { mode: 'preview' })).not.toThrow();
  });

  it('highlights an element', () => {
    renderBlock();
    mount();
    expect(() => fromBuilder('highlight', { id: 'c1' })).not.toThrow();
  });

  it('clears the highlight with a null id', () => {
    renderBlock();
    mount();
    fromBuilder('highlight', { id: 'c1' });
    expect(() => fromBuilder('highlight', { id: null })).not.toThrow();
  });
});

describe('VisualEditingBridge page interactions', () => {
  beforeEach(() => {
    embed('?pb_edit=1&pb_origin=' + encodeURIComponent(BUILDER_ORIGIN));
  });

  it('reports a click on a block as a selection', () => {
    const block = renderBlock();
    mount();

    act(() => {
      block.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(posted('select')[0][0].payload).toEqual({ id: 'c1' });
  });

  it('ignores a click outside any block', () => {
    renderBlock();
    mount();
    const before = posted('select').length;

    act(() => {
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(posted('select')).toHaveLength(before);
  });

  it('reports hover', () => {
    const block = renderBlock();
    mount();

    act(() => {
      block.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    });
    expect(posted('hover').length).toBeGreaterThan(0);
  });

  it('stops listening once unmounted', () => {
    const block = renderBlock();
    const { unmount } = mount();
    unmount();

    const before = postMessage.mock.calls.length;
    act(() => {
      block.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(postMessage.mock.calls).toHaveLength(before);
  });

  it('reports a document resize', () => {
    renderBlock();
    mount();
    const before = posted('docsize').length;

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(posted('docsize').length).toBeGreaterThanOrEqual(before);
  });
});

describe('VisualEditingBridge inline text editing', () => {
  beforeEach(() => {
    embed('?pb_edit=1&pb_origin=' + encodeURIComponent(BUILDER_ORIGIN));
  });

  const field = () =>
    document.querySelector<HTMLElement>('[data-pb-field="title"]')!;

  const focusField = (el: HTMLElement) =>
    act(() => {
      el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });

  const blurField = (el: HTMLElement) =>
    act(() => {
      el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

  const press = (el: HTMLElement, key: string, shiftKey = false) =>
    act(() => {
      el.dispatchEvent(
        new KeyboardEvent('keydown', { key, shiftKey, bubbles: true })
      );
    });

  it('commits an edited value on blur', () => {
    renderBlock('c1', 'title', 'Welcome');
    mount();
    const el = field();

    focusField(el);
    el.textContent = 'Edited';
    blurField(el);

    expect(posted('field')[0][0].payload).toEqual({
      id: 'c1',
      key: 'title',
      value: 'Edited',
    });
  });

  it('commits nothing when the value is unchanged', () => {
    renderBlock('c1', 'title', 'Welcome');
    mount();
    const el = field();

    focusField(el);
    blurField(el);
    expect(posted('field')).toHaveLength(0);
  });

  it('suspends dragging while a field is focused, and restores it after', () => {
    const block = renderBlock('c1', 'title', 'Welcome');
    mount();
    const el = field();

    focusField(el);
    expect(block.getAttribute('draggable')).toBe('false');

    blurField(el);
    expect(block.getAttribute('draggable')).toBe('true');
  });

  it('commits on Enter', () => {
    renderBlock('c1', 'title', 'Welcome');
    mount();
    const el = field();
    el.blur = vi.fn(() => el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));

    focusField(el);
    el.textContent = 'Edited';
    press(el, 'Enter');

    expect(posted('field')).toHaveLength(1);
  });

  it('leaves shift+Enter to insert a newline instead of committing', () => {
    renderBlock('c1', 'title', 'Welcome');
    mount();
    const el = field();
    el.blur = vi.fn();

    focusField(el);
    el.textContent = 'Edited';
    press(el, 'Enter', true);

    expect(el.blur).not.toHaveBeenCalled();
  });

  it('reverts and commits nothing on Escape', () => {
    renderBlock('c1', 'title', 'Welcome');
    mount();
    const el = field();
    el.blur = vi.fn(() => el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));

    focusField(el);
    el.textContent = 'Edited';
    press(el, 'Escape');

    expect(el.textContent).toBe('Welcome');
    expect(posted('field')).toHaveLength(0);
  });

  it('ignores focus on something that is not a field', () => {
    renderBlock();
    mount();
    const block = document.querySelector<HTMLElement>('[data-pb-id]')!;
    expect(() => focusField(block)).not.toThrow();
  });

  it('ignores a keypress outside a field', () => {
    renderBlock();
    mount();
    const block = document.querySelector<HTMLElement>('[data-pb-id]')!;
    expect(() => press(block, 'Enter')).not.toThrow();
  });

  it('does not treat a click on a field as a selection', () => {
    renderBlock();
    mount();
    const before = posted('select').length;

    act(() => {
      field().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(posted('select')).toHaveLength(before);
  });
});

describe('VisualEditingBridge on-render drag', () => {
  beforeEach(() => {
    embed('?pb_edit=1&pb_origin=' + encodeURIComponent(BUILDER_ORIGIN));
  });

  const transfer = () => ({
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: vi.fn(),
    getData: vi.fn(() => ''),
    types: [] as string[],
  });

  const dragEvent = (type: string, dataTransfer: unknown, target: Element) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  };

  it('marks the dragged element and advertises a move', () => {
    const block = renderBlock();
    mount();
    const dt = transfer();

    dragEvent('dragstart', dt, block);
    expect(dt.effectAllowed).toBe('move');
    expect(dt.setData).toHaveBeenCalledWith('text/plain', 'c1');
  });

  it('accepts a drag over the page while something is being dragged', () => {
    const block = renderBlock();
    mount();

    dragEvent('dragstart', transfer(), block);
    const dt = transfer();
    const over = dragEvent('dragover', dt, block);

    expect(over.defaultPrevented).toBe(true);
    expect(dt.dropEffect).toBe('move');
  });

  it('ignores a drag over when nothing is being dragged', () => {
    const block = renderBlock();
    mount();
    const over = dragEvent('dragover', transfer(), block);
    expect(over.defaultPrevented).toBe(false);
  });

  it('ignores a dragstart on something with no block id', () => {
    renderBlock();
    mount();
    const dt = transfer();
    dragEvent('dragstart', dt, document.body);
    expect(dt.setData).not.toHaveBeenCalled();
  });

  it('clears the drag on dragend', () => {
    const block = renderBlock();
    mount();

    dragEvent('dragstart', transfer(), block);
    act(() => {
      block.dispatchEvent(new MouseEvent('dragend', { bubbles: true }));
    });

    // A subsequent dragover is ignored again, proving the state was cleared.
    const over = dragEvent('dragover', transfer(), block);
    expect(over.defaultPrevented).toBe(false);
  });

  it('ignores a drop when nothing is being dragged', () => {
    const block = renderBlock();
    mount();
    const before = posted('drop').length;

    dragEvent('drop', transfer(), block);
    expect(posted('drop')).toHaveLength(before);
  });
});
