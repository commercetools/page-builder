// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_CHANNEL, BRIDGE_VERSION } from './contract.js';
import { BridgeMount } from './bridge-mount.js';

const originalParent = Object.getOwnPropertyDescriptor(window, 'parent');

/** The bridge only runs inside an iframe, so fake an embedding parent. */
function embed(): { postMessage: ReturnType<typeof vi.fn> } {
  const parent = { postMessage: vi.fn() };
  Object.defineProperty(window, 'parent', { configurable: true, value: parent });
  return parent;
}

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
  if (originalParent) Object.defineProperty(window, 'parent', originalParent);
});

describe('BridgeMount', () => {
  it('renders no markup of its own', () => {
    const { container } = render(<BridgeMount allowedOrigins={['https://mc.test']} manifest={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('stays inert outside edit mode: no handshake is posted', () => {
    const parent = embed();
    render(<BridgeMount allowedOrigins={['https://mc.test']} manifest={[]} />);
    expect(parent.postMessage).not.toHaveBeenCalled();
  });

  it('announces the manifest to a validated builder origin in edit mode, inside a frame', () => {
    window.history.replaceState({}, '', '/?pb_edit=1&pb_origin=https%3A%2F%2Fmc.test');
    const fakeParent = embed();
    const manifest = [{ type: 'content/hero', inlineTextFields: ['title'] }];
    render(<BridgeMount allowedOrigins={['https://other.test', 'https://mc.test']} manifest={manifest} />);
    expect(fakeParent.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: BRIDGE_CHANNEL, v: BRIDGE_VERSION, type: 'ready', payload: expect.objectContaining({ components: manifest }) }),
      'https://mc.test'
    );
  });

  it('reloads the page when the builder asks for a refresh', () => {
    window.history.replaceState({}, '', '/?pb_edit=1&pb_origin=https%3A%2F%2Fmc.test');
    embed();
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, search: window.location.search, reload });
    render(<BridgeMount allowedOrigins={['https://mc.test']} manifest={[]} />);
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { origin: 'https://mc.test', data: { channel: BRIDGE_CHANNEL, v: BRIDGE_VERSION, type: 'refresh' } })
      );
    });
    expect(reload).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('refuses an origin that is not in the service-provided list', () => {
    window.history.replaceState({}, '', '/?pb_edit=1&pb_origin=https%3A%2F%2Fevil.test');
    const fakeParent = embed();
    render(<BridgeMount allowedOrigins={['https://mc.test']} manifest={[]} />);
    expect(fakeParent.postMessage).not.toHaveBeenCalled();
  });
});
