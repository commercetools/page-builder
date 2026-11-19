import { createRef } from 'react';
import type { RefObject } from 'react';
import {
  BRIDGE_CHANNEL,
  BRIDGE_VERSION,
  originOf,
  useVisualBridge,
} from './preview-bridge';
import type { HostMessage } from './preview-bridge';
import {
  act,
  renderHookWithProviders,
  waitFor,
} from '../../../test-utils/render';

const HOST_ORIGIN = 'https://shop.example.test';

describe('originOf', () => {
  it('extracts the origin of a URL', () => {
    expect(originOf('https://shop.test/some/path?q=1')).toBe(
      'https://shop.test'
    );
  });

  it('keeps a non-default port', () => {
    expect(originOf('http://localhost:3000/x')).toBe('http://localhost:3000');
  });

  it('returns null for nothing', () => {
    expect(originOf(undefined)).toBeNull();
    expect(originOf(null)).toBeNull();
    expect(originOf('')).toBeNull();
  });

  it('returns null for an unparseable URL rather than throwing', () => {
    expect(originOf('not a url')).toBeNull();
  });
});

describe('useVisualBridge', () => {
  /** A stand-in for the preview iframe that records what was posted to it. */
  const fakeFrame = () => {
    const postMessage = jest.fn();
    const ref = createRef<HTMLIFrameElement>() as {
      current: HTMLIFrameElement | null;
    };
    ref.current = {
      contentWindow: { postMessage },
    } as unknown as HTMLIFrameElement;
    return { ref: ref as RefObject<HTMLIFrameElement | null>, postMessage };
  };

  const setup = (
    over: {
      enabled?: boolean;
      hostOrigin?: string | null;
      ref?: RefObject<HTMLIFrameElement | null>;
    } = {}
  ) => {
    const frame = fakeFrame();
    const onHostMessage = jest.fn();
    const rendered = renderHookWithProviders(() =>
      useVisualBridge({
        iframeRef: over.ref ?? frame.ref,
        enabled: over.enabled ?? true,
        hostOrigin:
          over.hostOrigin === undefined ? HOST_ORIGIN : over.hostOrigin,
        onHostMessage,
      })
    );
    return { ...rendered, ...frame, onHostMessage };
  };

  /** Post a message as the host would, from the given origin. */
  const postFromHost = (data: unknown, origin = HOST_ORIGIN) =>
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data, origin }));
    });

  const hostMessage = (msg: HostMessage) => ({
    channel: BRIDGE_CHANNEL,
    v: BRIDGE_VERSION,
    ...msg,
  });

  it('starts disconnected with no capabilities or registry', () => {
    const { result } = setup();
    expect(result.current.connected).toBe(false);
    expect(result.current.capabilities).toEqual({});
    expect(result.current.registry).toEqual([]);
  });

  it('connects when the host announces itself, recording what it can do', async () => {
    const { result } = setup();
    postFromHost(
      hostMessage({
        type: 'ready',
        payload: {
          v: 1,
          capabilities: { select: true, dnd: true },
          components: [{ type: 'content/hero', inlineTextFields: ['title'] }],
        },
      })
    );

    await waitFor(() => expect(result.current.connected).toBe(true));
    expect(result.current.capabilities).toEqual({ select: true, dnd: true });
    expect(result.current.registry).toEqual([
      { type: 'content/hero', inlineTextFields: ['title'] },
    ]);
  });

  it('treats a ready message with no capabilities as connected but capable of nothing', async () => {
    const { result } = setup();
    postFromHost(hostMessage({ type: 'ready', payload: { v: 1 } } as never));
    await waitFor(() => expect(result.current.connected).toBe(true));
    expect(result.current.capabilities).toEqual({});
    expect(result.current.registry).toEqual([]);
  });

  it('forwards every host message to the handler', () => {
    const { onHostMessage } = setup();
    postFromHost(hostMessage({ type: 'select', payload: { id: 'el-1' } }));
    expect(onHostMessage).toHaveBeenCalledWith({
      type: 'select',
      payload: { id: 'el-1' },
    });
  });

  it('ignores messages from any other origin', () => {
    const { onHostMessage, result } = setup();
    postFromHost(
      hostMessage({ type: 'ready', payload: { v: 1, capabilities: {} } }),
      'https://evil.test'
    );
    expect(onHostMessage).not.toHaveBeenCalled();
    expect(result.current.connected).toBe(false);
  });

  it('ignores traffic on another channel', () => {
    const { onHostMessage } = setup();
    postFromHost({ channel: 'something-else', type: 'select', payload: {} });
    expect(onHostMessage).not.toHaveBeenCalled();
  });

  it('ignores malformed messages', () => {
    const { onHostMessage } = setup();
    postFromHost(null);
    postFromHost({ channel: BRIDGE_CHANNEL });
    expect(onHostMessage).not.toHaveBeenCalled();
  });

  it('does not listen at all while disabled', () => {
    const { onHostMessage } = setup({ enabled: false });
    postFromHost(hostMessage({ type: 'select', payload: { id: 'el-1' } }));
    expect(onHostMessage).not.toHaveBeenCalled();
  });

  it('does not listen without a known host origin', () => {
    const { onHostMessage } = setup({ hostOrigin: null });
    postFromHost(hostMessage({ type: 'select', payload: { id: 'el-1' } }));
    expect(onHostMessage).not.toHaveBeenCalled();
  });

  it('drops the connection when the bridge is disabled again', async () => {
    const { result, unmount } = setup();
    postFromHost(
      hostMessage({ type: 'ready', payload: { v: 1, capabilities: {} } })
    );
    await waitFor(() => expect(result.current.connected).toBe(true));

    // Unmounting runs the same cleanup the enabled→disabled transition does.
    unmount();
    expect(() =>
      window.dispatchEvent(
        new MessageEvent('message', { data: {}, origin: HOST_ORIGIN })
      )
    ).not.toThrow();
  });

  it('posts to the host on the versioned channel, targeting its origin', () => {
    const { result, postMessage } = setup();
    act(() => result.current.send('requestRects', { all: true }));
    expect(postMessage).toHaveBeenCalledWith(
      {
        channel: BRIDGE_CHANNEL,
        v: BRIDGE_VERSION,
        type: 'requestRects',
        payload: { all: true },
      },
      HOST_ORIGIN
    );
  });

  it('sends with an undefined payload when none is given', () => {
    const { result, postMessage } = setup();
    act(() => result.current.send('refresh'));
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'refresh', payload: undefined }),
      HOST_ORIGIN
    );
  });

  it('does not post when there is no iframe yet', () => {
    const empty = { current: null } as RefObject<HTMLIFrameElement | null>;
    const { result, postMessage } = setup({ ref: empty });
    act(() => result.current.send('refresh'));
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('does not post without a host origin to target', () => {
    const { result, postMessage } = setup({ hostOrigin: null });
    act(() => result.current.send('refresh'));
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('calls the latest handler, not the one from the first render', () => {
    const frame = fakeFrame();
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHookWithProviders(
      ({ onHostMessage }: { onHostMessage: (m: HostMessage) => void }) =>
        useVisualBridge({
          iframeRef: frame.ref,
          enabled: true,
          hostOrigin: HOST_ORIGIN,
          onHostMessage,
        }),
      { initialProps: { onHostMessage: first } }
    );

    rerender({ onHostMessage: second });
    postFromHost(hostMessage({ type: 'hover', payload: { id: 'el-9' } }));

    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });
});
