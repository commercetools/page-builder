/** Pinned items sit at fixed 1-based positions; the rest of the list fills the other slots. */

export interface Pin {
  position: number;
  id: string;
}

/** Normalise stored pins (current `{ position, id }` and legacy `{ position, productId }`). */
export function readPins(value: unknown): Pin[] {
  if (!Array.isArray(value)) return [];
  const pins: Pin[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : typeof r.productId === 'string' ? r.productId : undefined;
    const position = Number(r.position);
    if (id && Number.isFinite(position) && position >= 1) pins.push({ position: Math.floor(position), id });
  }
  return pins.sort((a, b) => a.position - b.position);
}

/**
 * Place `pinned` items (already in pin order) at their positions within `items`, dropping any
 * duplicate of a pinned item from the unpinned run, and cut the result to `limit`.
 */
export function applyPins<T extends { id: string }>(items: T[], pins: Pin[], pinned: T[], limit: number): T[] {
  if (pins.length === 0 || pinned.length === 0) return items.slice(0, limit);
  const byId = new Map(pinned.map((p) => [p.id, p]));
  const placed = pins.filter((p, i) => byId.has(p.id) && pins.findIndex((q) => q.id === p.id) === i);
  const pinnedIds = new Set(placed.map((p) => p.id));
  const result = items.filter((i) => !pinnedIds.has(i.id));
  for (const pin of placed) {
    result.splice(Math.min(pin.position - 1, result.length), 0, byId.get(pin.id) as T);
  }
  return result.slice(0, limit);
}
