/**
 * Page-object storage contract + loader.
 *
 * Pages are split by lifecycle across two CT custom-object containers:
 *  - `page-editor-published` — the self-contained, frozen inline published snapshot the
 *    storefront reads (one object, no component fan-out; the render transform is unchanged).
 *  - `page-editor-draft` — the draft, whose layout children are *references* to
 *    component-instance objects in `page-editor-components`; the loader hydrates them for
 *    preview.
 * The pre-split combined object (container `page-editor`, `LEGACY_PAGE_CONTAINER`) is still
 * read as a fallback so pages that haven't been migrated yet keep rendering.
 *
 * `createPageStore` is framework- and client-agnostic: the host injects a
 * `getCustomObjectValue` reader (and, for preview hydration, an optional
 * `getComponentsByIds` batch reader) bound to its own CT client.
 */

import {
  DRAFT_PAGE_CONTAINER,
  LEGACY_PAGE_CONTAINER,
  PUBLISHED_PAGE_CONTAINER,
} from './contract.js';
import { pickPage } from './transform.js';
import type {
  CombinedComponent,
  CombinedObject,
  ComponentDraftVersion,
  PageComponent,
  PageEditorPage,
  PageLayoutElement,
  PagePublishedPayload,
} from './types.js';

/** The custom-object key for a page id (e.g. `home` → `page-home`). */
export function pageKey(pageId: string): string {
  return `page-${pageId}`;
}

/** Kept for back-compat with hosts importing it; published pages live here now. */
export const PAGE_CONTAINER = PUBLISHED_PAGE_CONTAINER;

/** The render snapshot, plus the envelope's optional page-type hint. */
export type PagePayload = PagePublishedPayload & { pageType?: string };

/**
 * Injected CT reader — the host binds its own client. Returns the custom object's `value`,
 * or `null`/`undefined` when the object does not exist.
 */
export type CustomObjectReader = (container: string, key: string) => Promise<unknown>;

/**
 * Injected batch reader for preview hydration — resolves component-instance objects by their
 * CT ids. Optional: without it, preview falls back to the published snapshot.
 */
export type ComponentsByIdsReader = (
  ids: string[]
) => Promise<Array<{ id: string; value: unknown }>>;

export interface PageStore {
  /** Resolve a page's render snapshot, or `null` when nothing renderable exists. */
  loadPage(pageId: string, opts: { preview: boolean }): Promise<PagePayload | null>;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object';

// ── v3 published (self-contained inline) ─────────────────────────────────────────────────

/** A `page-editor-published` object's value is the inline snapshot itself. */
function publishedToPayload(value: unknown, pageId: string): PagePayload | null {
  if (!isRecord(value)) return null;
  if (!('page' in value) || 'draft' in value || 'versions' in value) return null;
  if (!isRecord(value.page)) return null;
  return {
    schemaVersion: typeof value.schemaVersion === 'number' ? value.schemaVersion : 3,
    appVersion: typeof value.appVersion === 'number' ? value.appVersion : 1,
    publishedAt: typeof value.publishedAt === 'string' ? value.publishedAt : '',
    pageId,
    page: value.page as unknown as PageEditorPage,
    ...(typeof value.pageType === 'string' ? { pageType: value.pageType } : {}),
  };
}

// ── v3 draft (references → hydrate) ───────────────────────────────────────────────────────

function collectRefIds(refPage: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const layouts of Object.values(refPage)) {
    if (!Array.isArray(layouts)) continue;
    for (const layout of layouts) {
      const children = isRecord(layout) ? layout.children : null;
      if (!Array.isArray(children)) continue;
      for (const ref of children) {
        if (isRecord(ref) && typeof ref.id === 'string') ids.push(ref.id);
      }
    }
  }
  return ids;
}

const componentHead = (c: CombinedComponent): ComponentDraftVersion | null =>
  c.draft?.versions?.length ? c.draft.versions[c.draft.versions.length - 1] : null;

function inlineRef(
  ref: unknown,
  byId: Map<string, CombinedComponent>
): PageComponent | null {
  if (!isRecord(ref) || typeof ref.id !== 'string') return null;
  const c = byId.get(ref.id);
  const head = c ? componentHead(c) : null;
  // Missing component object → skip (never throw, never render a broken slot).
  if (!c || !head) return null;
  return {
    id: c.draft.componentId,
    type: c.type,
    name: head.name ?? {},
    visibility: head.visibility,
    settings: head.settings ?? {},
  };
}

function hydrateSection(
  layouts: unknown,
  byId: Map<string, CombinedComponent>
): PageLayoutElement[] {
  if (!Array.isArray(layouts)) return [];
  return layouts.map((layout) => ({
    ...(layout as PageLayoutElement),
    children: (isRecord(layout) && Array.isArray(layout.children)
      ? layout.children
      : []
    )
      .map((ref) => inlineRef(ref, byId))
      .filter((c): c is PageComponent => c != null),
  }));
}

async function draftToPayload(
  value: unknown,
  pageId: string,
  getComponentsByIds?: ComponentsByIdsReader
): Promise<PagePayload | null> {
  if (!isRecord(value) || !isRecord(value.draft)) return null;
  const versions = (value.draft as Record<string, unknown>).versions;
  if (!Array.isArray(versions) || versions.length === 0) return null;
  const head = versions[versions.length - 1];
  const refPage = isRecord(head) ? head.page : null;
  if (!isRecord(refPage)) return null;

  const ids = collectRefIds(refPage);
  const byId = new Map<string, CombinedComponent>();
  if (ids.length > 0) {
    if (!getComponentsByIds) return null; // can't hydrate → caller falls back to published
    const rows = await getComponentsByIds(ids);
    for (const r of rows) {
      if (isRecord(r.value)) byId.set(r.id, r.value as unknown as CombinedComponent);
    }
  }

  const page: PageEditorPage = {
    HEAD: hydrateSection(refPage.HEAD, byId),
    MAIN: hydrateSection(refPage.MAIN, byId),
    FOOTER: hydrateSection(refPage.FOOTER, byId),
  };
  return {
    schemaVersion: 3,
    appVersion:
      isRecord(head) && typeof head.appVersion === 'number' ? head.appVersion : 1,
    publishedAt:
      isRecord(head) && typeof head.publishedAt === 'string' ? head.publishedAt : '',
    pageId,
    page,
    ...(typeof value.pageType === 'string' ? { pageType: value.pageType } : {}),
  };
}

// ── Legacy (pre-v3 combined object + seed shape) ─────────────────────────────────────────

const ALL_VISIBLE = { mobile: true, tablet: true, desktop: true } as const;

interface LegacyComponent {
  id: string;
  componentType: string;
  name?: Record<string, string>;
  visibility?: { mobile: boolean; tablet: boolean; desktop: boolean };
  settings?: Record<string, unknown>;
}
interface LegacyElement {
  id: string;
  width?: string;
  name?: Record<string, string>;
  visibility?: { mobile: boolean; tablet: boolean; desktop: boolean };
  backgroundStyle?: string;
  children?: LegacyComponent[];
}
interface LegacyValue {
  versions?: Array<{
    v?: number;
    savedAt?: string;
    published?: boolean;
    state?: { MAIN?: LegacyElement[] };
  }>;
}

function toEditorElement(el: LegacyElement): PageLayoutElement {
  return {
    id: el.id,
    kind: 'layout',
    width: (el.width as PageLayoutElement['width']) ?? '1/1',
    name: el.name ?? {},
    visibility: el.visibility ?? { ...ALL_VISIBLE },
    style: el.backgroundStyle,
    children: (el.children ?? []).map((c) => ({
      id: c.id,
      type: c.componentType,
      name: c.name ?? {},
      visibility: c.visibility ?? { ...ALL_VISIBLE },
      settings: c.settings ?? {},
    })),
  };
}

/** Normalize either legacy storage shape into a single `PagePayload` (or `null`). */
function normalizeLegacy(
  value: unknown,
  pageId: string,
  preview: boolean
): PagePayload | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;

  // Pre-v3 combined envelope ({ draft: { versions: [{ page }] }, published }).
  if ('draft' in v || 'published' in v) {
    const picked = pickPage(
      v as unknown as CombinedObject<PagePublishedPayload>,
      preview
    );
    if (!picked) return null;
    const pageType = typeof v.pageType === 'string' ? v.pageType : undefined;
    return pageType ? { ...picked, pageType } : picked;
  }

  // Legacy seed shape.
  const versions = (v as LegacyValue).versions;
  if (Array.isArray(versions) && versions.length > 0) {
    const publishedVersions = versions.filter((x) => x.published);
    const chosen = publishedVersions.length
      ? publishedVersions.reduce((a, b) => ((a.savedAt ?? '') >= (b.savedAt ?? '') ? a : b))
      : versions[0];
    const main = (chosen.state?.MAIN ?? []).map(toEditorElement);
    return {
      schemaVersion: 2,
      appVersion: chosen.v ?? 1,
      publishedAt: chosen.savedAt ?? '',
      pageId,
      page: { HEAD: [], MAIN: main, FOOTER: [] },
    };
  }

  return null;
}

// ── Store ────────────────────────────────────────────────────────────────────────────────

/** Bind a page loader to host-provided CT readers. */
export function createPageStore(deps: {
  getCustomObjectValue: CustomObjectReader;
  getComponentsByIds?: ComponentsByIdsReader;
}): PageStore {
  const { getCustomObjectValue, getComponentsByIds } = deps;
  const key = (id: string) => pageKey(id);

  return {
    async loadPage(pageId, { preview }) {
      if (!preview) {
        // Storefront hot path: one read of the self-contained published snapshot.
        const published = await getCustomObjectValue(
          PUBLISHED_PAGE_CONTAINER,
          key(pageId)
        );
        const fromPublished = publishedToPayload(published, pageId);
        if (fromPublished) return fromPublished;
        // Fallback: a not-yet-migrated legacy combined object.
        const legacy = await getCustomObjectValue(LEGACY_PAGE_CONTAINER, key(pageId));
        return normalizeLegacy(legacy, pageId, false);
      }

      // Preview: hydrate the draft's component references.
      const draft = await getCustomObjectValue(DRAFT_PAGE_CONTAINER, key(pageId));
      const fromDraft = await draftToPayload(draft, pageId, getComponentsByIds);
      if (fromDraft) return fromDraft;
      // Fallbacks: legacy draft (embedded), then published.
      const legacy = await getCustomObjectValue(LEGACY_PAGE_CONTAINER, key(pageId));
      const fromLegacy = normalizeLegacy(legacy, pageId, true);
      if (fromLegacy) return fromLegacy;
      const published = await getCustomObjectValue(
        PUBLISHED_PAGE_CONTAINER,
        key(pageId)
      );
      return publishedToPayload(published, pageId);
    },
  };
}
