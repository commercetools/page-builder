import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Visual-editing bridge (phases 2–3) — the MC-app side of the cross-origin
 * postMessage protocol defined in docs/sdd/preview-contract.md §6–9.
 *
 * The host renders the page in the iframe, emits `data-pb-*` markers, and runs a
 * small client that reports interactions/geometry and re-renders on request. The
 * builder (this side) listens, maps element ids back to the page model, draws the
 * selection overlay, and drives edits.
 */

export const BRIDGE_CHANNEL = 'pb-visual-editing';
export const BRIDGE_VERSION = 1;

export type BridgeCapabilities = {
  select?: boolean;
  refresh?: boolean;
  /** On-render reorder: host owns the pointer and posts `drop`. */
  dnd?: boolean;
  /** Host reports `rects.dropzones` so the builder can drive palette→render drops. */
  dropzones?: boolean;
  /** Host annotates `data-pb-field` text nodes and posts `field`. */
  inlineText?: boolean;
};

/** One entry of the host's advertised component registry (from `ready`). */
export type HostComponentInfo = {
  type: string;
  /** Settings keys the host offers for inline text editing on the render. */
  inlineTextFields?: string[];
};

export type ElementRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/** A palette-drop insertion slot reported by the host (phase 3). */
export type Dropzone = {
  section: string;
  layoutId: string | null;
  index: number;
  rect: ElementRect;
};

/** Messages the host posts to the builder. */
export type HostMessage =
  | {
      type: 'ready';
      payload: {
        v: number;
        capabilities: BridgeCapabilities;
        components?: HostComponentInfo[];
      };
    }
  | { type: 'select'; payload: { id: string } }
  | { type: 'hover'; payload: { id: string | null } }
  | {
      type: 'rects';
      payload: {
        items: Array<{ id: string; rect: ElementRect }>;
        dropzones?: Dropzone[];
      };
    }
  | {
      type: 'drop';
      payload: {
        dragId?: string;
        type?: string;
        target: { section: string; layoutId: string | null; index: number };
      };
    }
  | { type: 'docsize'; payload: { width: number; height: number } }
  | { type: 'navigate'; payload: { href: string } }
  | { type: 'field'; payload: { id: string; key: string; value: string } }
  | { type: 'error'; payload: { message: string } };

/** Message types the builder posts to the host. */
export type BuilderMessageType =
  | 'init'
  | 'requestRects'
  | 'highlight'
  | 'scrollTo'
  | 'refresh'
  | 'setMode'
  | 'drop'
  | 'commitField';

export type VisualBridge = {
  connected: boolean;
  capabilities: BridgeCapabilities;
  /** Component registry the connected host advertised (empty until `ready`). */
  registry: HostComponentInfo[];
  send: (type: BuilderMessageType, payload?: unknown) => void;
};

type UseVisualBridgeOptions = {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  /** Only listen/post while preview edit mode is active. */
  enabled: boolean;
  /** Expected host origin (from the configured base URL). */
  hostOrigin: string | null;
  onHostMessage: (msg: HostMessage) => void;
};

/** Derive the origin of a base URL, or null if it can't be parsed. */
export const originOf = (baseUrl: string | undefined | null): string | null => {
  if (!baseUrl) return null;
  try {
    return new URL(baseUrl).origin;
  } catch {
    return null;
  }
};

export function useVisualBridge({
  iframeRef,
  enabled,
  hostOrigin,
  onHostMessage,
}: UseVisualBridgeOptions): VisualBridge {
  const [connected, setConnected] = useState(false);
  const [capabilities, setCapabilities] = useState<BridgeCapabilities>({});
  const [registry, setRegistry] = useState<HostComponentInfo[]>([]);

  // Keep the latest handler without re-subscribing the listener each render.
  // Written after commit, not during render: React may render and then discard a
  // tree, and the ref is only read from the async `message` handler below, which
  // never runs before the commit that set it.
  const onHostMessageRef = useRef(onHostMessage);
  useEffect(() => {
    onHostMessageRef.current = onHostMessage;
  });

  const send = useCallback(
    (type: BuilderMessageType, payload?: unknown) => {
      const frame = iframeRef.current;
      if (!frame?.contentWindow || !hostOrigin) return;
      frame.contentWindow.postMessage(
        { channel: BRIDGE_CHANNEL, v: BRIDGE_VERSION, type, payload },
        hostOrigin
      );
    },
    [iframeRef, hostOrigin]
  );

  useEffect(() => {
    if (!enabled || !hostOrigin) {
      setConnected(false);
      setCapabilities({});
      setRegistry([]);
      return;
    }
    const handler = (event: MessageEvent) => {
      if (event.origin !== hostOrigin) return;
      const data = event.data as {
        channel?: string;
        type?: string;
        payload?: unknown;
      } | null;
      if (!data || data.channel !== BRIDGE_CHANNEL || !data.type) return;
      const msg = { type: data.type, payload: data.payload } as HostMessage;
      if (msg.type === 'ready') {
        setConnected(true);
        setCapabilities(msg.payload?.capabilities ?? {});
        setRegistry(msg.payload?.components ?? []);
      }
      onHostMessageRef.current(msg);
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      setConnected(false);
      setCapabilities({});
      setRegistry([]);
    };
  }, [enabled, hostOrigin]);

  return { connected, capabilities, registry, send };
}
