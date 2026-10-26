'use client';

import { useEffect } from 'react';
import { BRIDGE_CHANNEL, BRIDGE_VERSION, type RegistryManifestEntry } from './contract.js';

/**
 * Visual-editing bridge — host side of the page-editor `postMessage` contract
 * (docs/sdd/preview-contract.md §6-9). Cross-origin: the builder (Merchant Center) embeds
 * this storefront in an iframe and drives editing via messages; the host emits `data-pb-*`
 * markers server-side (see the grid render layer).
 *
 * Inert unless `pb_edit=1` is in the URL AND `pb_origin` is in the `allowedOrigins`
 * allowlist — so nothing runs for real shoppers.
 *
 * Framework-agnostic: the host injects `onRefresh` (e.g. Next's `router.refresh`) so the
 * builder's `refresh` message can re-pull the server render. No framework import here.
 */

const CHANNEL = BRIDGE_CHANNEL;
const PROTOCOL_VERSION = BRIDGE_VERSION;

const CAPABILITIES = {
  select: true,
  refresh: true,
  inlineText: true,
  dnd: true,
  dropzones: true,
} as const;

interface BridgeMessage {
  channel: typeof CHANNEL;
  v: number;
  type: string;
  payload?: unknown;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type VisualEditingBridgeProps = {
  /** Comma-separated Merchant Center origins allowed to drive the bridge. */
  allowedOrigins: string;
  /** Registry manifest computed on the server, advertised in `ready`. */
  components?: RegistryManifestEntry[];
  /** Re-pull the server render (e.g. Next's `router.refresh`). */
  onRefresh: () => void;
};

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

// Shared empty default: a fresh `[]` per render would change the prop identity on
// every parent render.
const NO_COMPONENTS: RegistryManifestEntry[] = [];

export function VisualEditingBridge({
  allowedOrigins,
  components = NO_COMPONENTS,
  onRefresh,
}: VisualEditingBridgeProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    if (params.get('pb_edit') !== '1') return; // inert outside edit mode
    if (window.parent === window) return; // not embedded

    const allowed = (allowedOrigins ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const pbOrigin = params.get('pb_origin');
    // Only ever post to a validated builder origin — never '*'.
    const targetOrigin = pbOrigin && allowed.includes(pbOrigin) ? pbOrigin : null;
    if (!targetOrigin) return;

    let hoveredId: string | null = null;
    let rafPending = false;
    let disposed = false;
    let highlightEl: HTMLElement | null = null;
    let dropLineEl: HTMLElement | null = null;

    // Inline-text editing state (one field focused at a time).
    let editingEl: HTMLElement | null = null;
    let editingInitial = '';
    let editingEscaped = false;

    // On-render drag state.
    let dragId: string | null = null;
    let dragKind: string | null = null;

    const post = (type: string, payload?: unknown) => {
      const msg: BridgeMessage = { channel: CHANNEL, v: PROTOCOL_VERSION, type, payload };
      window.parent.postMessage(msg, targetOrigin);
    };

    const idFromTarget = (target: EventTarget | null): string | null => {
      if (!(target instanceof Element)) return null;
      return target.closest('[data-pb-id]')?.getAttribute('data-pb-id') ?? null;
    };

    // ── geometry ──────────────────────────────────────────────────────────────
    /** A hittable band (~12px) centred on an insertion line. */
    const band = (left: number, centerY: number, width: number): Rect => ({
      top: centerY - 6,
      left,
      width,
      height: 12,
    });

    /** Group MAIN's flat layout list into visual rows (siblings share a top). */
    const groupRows = (layouts: HTMLElement[]): HTMLElement[][] => {
      const rows: HTMLElement[][] = [];
      let current: HTMLElement[] = [];
      let rowTop: number | null = null;
      for (const el of layouts) {
        const top = el.getBoundingClientRect().top;
        if (rowTop === null || Math.abs(top - rowTop) < 8) {
          current.push(el);
          if (rowTop === null) rowTop = top;
        } else {
          rows.push(current);
          current = [el];
          rowTop = top;
        }
      }
      if (current.length) rows.push(current);
      return rows;
    };

    type Dropzone = { section: string; layoutId: string | null; index: number; rect: Rect };

    const collectDropzones = (): Dropzone[] => {
      const zones: Dropzone[] = [];
      const markers = Array.from(document.querySelectorAll<HTMLElement>('[data-pb-dropzone]'));
      for (const marker of markers) {
        let meta: { section?: string; layoutId?: string | null };
        try {
          meta = JSON.parse(marker.getAttribute('data-pb-dropzone') || '{}');
        } catch {
          continue;
        }
        const section = meta.section || 'MAIN';

        if (meta.layoutId == null) {
          // MAIN container → new full-width row between each row.
          const mr = marker.getBoundingClientRect();
          const layouts = Array.from(
            marker.querySelectorAll<HTMLElement>('[data-pb-kind="layout"]')
          );
          const rows = groupRows(layouts);
          const top = rows.length
            ? Math.min(...rows[0].map((el) => el.getBoundingClientRect().top))
            : mr.top;
          zones.push({ section, layoutId: null, index: 0, rect: band(mr.left, top, mr.width) });
          let cumulative = 0;
          for (const row of rows) {
            cumulative += row.length;
            const bottom = Math.max(...row.map((el) => el.getBoundingClientRect().bottom));
            zones.push({
              section,
              layoutId: null,
              index: cumulative,
              rect: band(mr.left, bottom, mr.width),
            });
          }
        } else {
          // Layout (cell) → between each of its components.
          const layoutId = meta.layoutId;
          const cr = marker.getBoundingClientRect();
          const comps = Array.from(
            marker.querySelectorAll<HTMLElement>('[data-pb-kind="component"]')
          );
          for (let index = 0; index <= comps.length; index++) {
            let y: number;
            if (comps.length === 0) y = cr.top + cr.height / 2;
            else if (index >= comps.length)
              y = comps[comps.length - 1].getBoundingClientRect().bottom;
            else y = comps[index].getBoundingClientRect().top;
            zones.push({ section, layoutId, index, rect: band(cr.left, y, cr.width) });
          }
        }
      }
      return zones;
    };

    const collectRects = (ids?: string[]) => {
      // Built once per call: this scans every marked node on the page and runs on each
      // scroll/resize/selection, so a per-node linear scan of `ids` adds up.
      const wanted = ids ? new Set(ids) : null;
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-pb-id]'));
      const items = nodes.flatMap((el) => {
        const id = el.getAttribute('data-pb-id');
        if (!id) return [];
        if (wanted && !wanted.has(id)) return [];
        return [{ id, rect: rectOf(el) }];
      });
      return { items, dropzones: collectDropzones() };
    };

    const postRects = (ids?: string[]) => post('rects', collectRects(ids));
    const postDocSize = () =>
      post('docsize', {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      });

    const scheduleGeometry = () => {
      if (rafPending || disposed) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        if (disposed) return;
        postRects();
        postDocSize();
      });
    };

    // ── overlays ────────────────────────────────────────────────────────────
    const makeOverlay = (): HTMLElement => {
      const el = document.createElement('div');
      Object.assign(el.style, {
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: '2147483647',
        display: 'none',
      } satisfies Partial<CSSStyleDeclaration>);
      document.body.appendChild(el);
      return el;
    };

    const highlight = (id: string | null) => {
      if (!highlightEl) {
        highlightEl = makeOverlay();
        Object.assign(highlightEl.style, {
          border: '2px solid #3b82f6',
          borderRadius: '2px',
          background: 'rgba(59,130,246,0.08)',
          transition: 'all 60ms ease',
        } satisfies Partial<CSSStyleDeclaration>);
      }
      const el = id ? document.querySelector<HTMLElement>(`[data-pb-id="${cssEscape(id)}"]`) : null;
      if (!el) {
        highlightEl.style.display = 'none';
        return;
      }
      const r = el.getBoundingClientRect();
      Object.assign(highlightEl.style, {
        display: 'block',
        top: `${r.top}px`,
        left: `${r.left}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      } satisfies Partial<CSSStyleDeclaration>);
    };

    const showDropLine = (rect: Rect | null) => {
      if (!dropLineEl) {
        dropLineEl = makeOverlay();
        Object.assign(dropLineEl.style, {
          background: '#3b82f6',
          borderRadius: '2px',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.6)',
        } satisfies Partial<CSSStyleDeclaration>);
      }
      if (!rect) {
        dropLineEl.style.display = 'none';
        return;
      }
      Object.assign(dropLineEl.style, {
        display: 'block',
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${Math.max(rect.height, 3)}px`,
      } satisfies Partial<CSSStyleDeclaration>);
    };

    // ── editing affordances (idempotent; re-applied after each re-render) ─────
    const applyEditingAffordances = () => {
      document.querySelectorAll<HTMLElement>('[data-pb-field]').forEach((el) => {
        if (el.contentEditable !== 'true') el.contentEditable = 'true';
        el.setAttribute('draggable', 'false');
        el.spellcheck = false;
      });
      document
        .querySelectorAll<HTMLElement>('[data-pb-kind="component"],[data-pb-kind="layout"]')
        .forEach((el) => el.setAttribute('draggable', 'true'));
    };

    // ── selection / hover ─────────────────────────────────────────────────────
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-pb-field]')) return;
      const id = idFromTarget(e.target);
      if (!id) return;
      const anchor =
        e.target instanceof Element
          ? (e.target.closest('a[href]') as HTMLAnchorElement | null)
          : null;
      if (anchor) {
        e.preventDefault();
        post('navigate', { href: anchor.href });
      }
      post('select', { id });
    };

    const onPointerOver = (e: PointerEvent) => {
      const id = idFromTarget(e.target);
      if (id !== hoveredId) {
        hoveredId = id;
        post('hover', { id });
      }
    };

    // ── inline text (capability: inlineText) ──────────────────────────────────
    const fieldFrom = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element)) return null;
      return target.closest<HTMLElement>('[data-pb-field]');
    };

    const onFocusIn = (e: FocusEvent) => {
      const field = fieldFrom(e.target);
      if (!field) return;
      editingEl = field;
      editingInitial = field.textContent ?? '';
      editingEscaped = false;
      field.closest<HTMLElement>('[data-pb-id]')?.setAttribute('draggable', 'false');
    };

    const onFocusOut = (e: FocusEvent) => {
      const field = fieldFrom(e.target);
      if (!field || field !== editingEl) return;
      const value = field.textContent ?? '';
      if (!editingEscaped && value !== editingInitial) {
        post('field', { id: idFromTarget(field), key: field.getAttribute('data-pb-field'), value });
      }
      field.closest<HTMLElement>('[data-pb-id]')?.setAttribute('draggable', 'true');
      editingEl = null;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const field = fieldFrom(e.target);
      if (!field) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        field.blur();
      } else if (e.key === 'Escape') {
        editingEscaped = true;
        field.textContent = editingInitial;
        field.blur();
      }
    };

    // ── on-render reorder (capability: dnd) ───────────────────────────────────
    const insertIndex = (siblings: Element[], y: number): number => {
      let i = 0;
      for (const el of siblings) {
        const r = el.getBoundingClientRect();
        if (y > r.top + r.height / 2) i++;
      }
      return i;
    };

    const lineForList = (siblings: Element[], index: number, container: Element): Rect => {
      const cr = container.getBoundingClientRect();
      if (siblings.length === 0) return { top: cr.top, left: cr.left, width: cr.width, height: 3 };
      if (index >= siblings.length) {
        const last = siblings[siblings.length - 1].getBoundingClientRect();
        return { top: last.bottom - 1, left: last.left, width: last.width, height: 3 };
      }
      const at = siblings[index].getBoundingClientRect();
      return { top: at.top - 1, left: at.left, width: at.width, height: 3 };
    };

    type DropTarget = { section: string; layoutId: string | null; index: number };

    const computeDrop = (x: number, y: number): { target: DropTarget; line: Rect } | null => {
      const mainEl = document.querySelector<HTMLElement>('[data-pb-section]');
      if (!mainEl) return null;
      const section = mainEl.getAttribute('data-pb-section') || 'MAIN';
      const layouts = Array.from(mainEl.querySelectorAll<HTMLElement>('[data-pb-kind="layout"]'));

      if (dragKind === 'layout') {
        const index = insertIndex(layouts, y);
        return {
          target: { section, layoutId: null, index },
          line: lineForList(layouts, index, mainEl),
        };
      }

      const over = document.elementFromPoint(x, y);
      const layoutEl = over?.closest<HTMLElement>('[data-pb-kind="layout"]');
      if (layoutEl) {
        const layoutId = layoutEl.getAttribute('data-pb-id');
        const comps = Array.from(
          layoutEl.querySelectorAll<HTMLElement>('[data-pb-kind="component"]')
        );
        const index = insertIndex(comps, y);
        return { target: { section, layoutId, index }, line: lineForList(comps, index, layoutEl) };
      }
      const index = insertIndex(layouts, y);
      return {
        target: { section, layoutId: null, index },
        line: lineForList(layouts, index, mainEl),
      };
    };

    const clearDrag = () => {
      dragId = null;
      dragKind = null;
      showDropLine(null);
    };

    const onDragStart = (e: DragEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-pb-field]')) return;
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-pb-id]') : null;
      const kind = el?.getAttribute('data-pb-kind');
      if (!el || (kind !== 'component' && kind !== 'layout')) return;
      dragId = el.getAttribute('data-pb-id');
      dragKind = kind;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragId ?? '');
      }
      e.stopPropagation();
    };

    const onDragOver = (e: DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      const result = computeDrop(e.clientX, e.clientY);
      showDropLine(result?.line ?? null);
    };

    const onDrop = (e: DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      try {
        const result = computeDrop(e.clientX, e.clientY);
        if (result) post('drop', { dragId, target: result.target });
      } catch (err) {
        post('error', { message: `drop failed: ${(err as Error).message}` });
      } finally {
        clearDrag();
      }
    };

    const onDragEnd = () => clearDrag();

    // ── incoming (builder → host) ──────────────────────────────────────────────
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== targetOrigin) return; // strict origin check
      const data = e.data as BridgeMessage | undefined;
      if (!data || data.channel !== CHANNEL) return;
      const payload = (data.payload ?? {}) as Record<string, unknown>;
      switch (data.type) {
        case 'init':
          applyEditingAffordances();
          postRects();
          postDocSize();
          break;
        case 'requestRects':
          postRects(Array.isArray(payload.ids) ? (payload.ids as string[]) : undefined);
          break;
        case 'highlight':
          highlight(typeof payload.id === 'string' ? payload.id : null);
          break;
        case 'scrollTo': {
          if (typeof payload.id !== 'string') break;
          document
            .querySelector<HTMLElement>(`[data-pb-id="${cssEscape(payload.id)}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        }
        case 'refresh':
          onRefresh();
          break;
        case 'setMode':
          break; // reserved
        case 'commitField': {
          const { id, key, value } = payload as { id?: string; key?: string; value?: string };
          if (typeof id === 'string' && typeof key === 'string' && typeof value === 'string') {
            const el = document.querySelector<HTMLElement>(
              `[data-pb-id="${cssEscape(id)}"] [data-pb-field="${cssEscape(key)}"]`
            );
            if (el && el !== editingEl) el.textContent = value;
          }
          break;
        }
        default:
          break;
      }
    };

    // ── wiring ────────────────────────────────────────────────────────────────
    const resizeObserver = new ResizeObserver(scheduleGeometry);
    resizeObserver.observe(document.documentElement);
    const mutationObserver = new MutationObserver(() => {
      applyEditingAffordances();
      scheduleGeometry();
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    document.addEventListener('dragend', onDragEnd);
    window.addEventListener('scroll', scheduleGeometry, true);
    window.addEventListener('resize', scheduleGeometry);
    window.addEventListener('message', onMessage);

    // Handshake: announce readiness + capabilities, enable editing, seed geometry.
    applyEditingAffordances();
    post('ready', {
      v: PROTOCOL_VERSION,
      capabilities: CAPABILITIES,
      components,
    });
    postRects();
    postDocSize();

    return () => {
      disposed = true;
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('dragstart', onDragStart, true);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDrop);
      document.removeEventListener('dragend', onDragEnd);
      window.removeEventListener('scroll', scheduleGeometry, true);
      window.removeEventListener('resize', scheduleGeometry);
      window.removeEventListener('message', onMessage);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      highlightEl?.remove();
      dropLineEl?.remove();
      highlightEl = null;
      dropLineEl = null;
    };
  }, [allowedOrigins, onRefresh, components]);

  return null;
}

export default VisualEditingBridge;
