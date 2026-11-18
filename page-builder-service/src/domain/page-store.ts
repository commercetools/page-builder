/**
 * Page loader: reads a page's render snapshot from the custom-object containers.
 *
 * - Published (storefront hot path): one read of the self-contained `page-editor-published`
 *   snapshot, falling back to a not-yet-migrated legacy combined object.
 * - Preview: the draft head, with its component references hydrated from
 *   `page-editor-components`, then legacy draft, then published.
 *
 * Preview reads bypass the cache; published reads are cached (see `CtStore`).
 */

import type { CtStore } from '../ct/store.js';
import {
  COMPONENTS_CONTAINER,
  DRAFT_PAGE_CONTAINER,
  LEGACY_PAGE_CONTAINER,
  PUBLISHED_PAGE_CONTAINER,
  pageKey,
  type CombinedComponent,
  type CombinedObject,
  type ComponentDraftVersion,
  type PageComponent,
  type PageDraftHistory,
  type PageEditorPage,
  type PageLayoutElement,
  type PagePayload,
  type PagePublishedPayload,
} from './types.js';

export interface PageStore {
  /** Resolve a page's render snapshot, or `null` when nothing renderable exists. */
  loadPage(pageId: string, opts: { preview: boolean }): Promise<PagePayload | null>;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/**
 * Pick the draft (preview) or published payload of a pre-v3 combined object.
 * Draft is a versioned history; the current page is its last version.
 */
export function pickPage(
  obj: CombinedObject<PagePublishedPayload> | null | undefined,
  preview: boolean
): PagePublishedPayload | null {
  if (!obj) return null;
  if (preview) {
    const draft = obj.draft as unknown as PageDraftHistory | PagePublishedPayload | null;
    const versions = (draft as PageDraftHistory | null)?.versions;
    if (Array.isArray(versions) && versions.length > 0) {
      const latest = versions[versions.length - 1];
      if (latest?.page) {
        return {
          schemaVersion: (draft as PageDraftHistory).schemaVersion,
          appVersion: latest.appVersion,
          publishedAt: latest.publishedAt ?? '',
          pageId: (draft as PageDraftHistory).pageId,
          page: latest.page,
        };
      }
    }
    if ((draft as PagePublishedPayload | null)?.page) return draft as PagePublishedPayload;
  }
  return obj.published?.page ? obj.published : null;
}

// ── v3 published (self-contained inline) ─────────────────────────────────────────────────

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

// ── v3 draft (references → hydrate) ──────────────────────────────────────────────────────

function layoutRefIds(layout: unknown): string[] {
  const children = isRecord(layout) ? layout.children : null;
  if (!Array.isArray(children)) return [];
  return children.flatMap((ref) => (isRecord(ref) && typeof ref.id === 'string' ? [ref.id] : []));
}

function sectionRefIds(layouts: unknown): string[] {
  if (!Array.isArray(layouts)) return [];
  return layouts.flatMap((layout) => layoutRefIds(layout));
}

function collectRefIds(refPage: Record<string, unknown>): string[] {
  return Object.values(refPage).flatMap((layouts) => sectionRefIds(layouts));
}

const componentHead = (c: CombinedComponent): ComponentDraftVersion | null =>
  c.draft?.versions?.length ? c.draft.versions[c.draft.versions.length - 1] : null;

function inlineRef(ref: unknown, byId: Map<string, CombinedComponent>): PageComponent | null {
  if (!isRecord(ref) || typeof ref.id !== 'string') return null;
  const c = byId.get(ref.id);
  const head = c ? componentHead(c) : null;
  // A missing component object is skipped — never throw, never render a broken slot.
  if (!c || !head) return null;
  return {
    id: c.draft.componentId,
    type: c.type,
    name: head.name ?? {},
    visibility: head.visibility,
    settings: head.settings ?? {},
  };
}

function hydrateSection(layouts: unknown, byId: Map<string, CombinedComponent>): PageLayoutElement[] {
  if (!Array.isArray(layouts)) return [];
  return layouts.map((layout) => ({
    ...(layout as PageLayoutElement),
    children: (isRecord(layout) && Array.isArray(layout.children) ? layout.children : [])
      .map((ref) => inlineRef(ref, byId))
      .filter((c): c is PageComponent => c != null),
  }));
}

type ComponentsByIds = (ids: string[]) => Promise<Array<{ id: string; value: unknown }>>;

/** The draft head version and its reference page, or null when the draft has no usable head. */
function draftHead(
  value: Record<string, unknown>
): { head: Record<string, unknown>; refPage: Record<string, unknown> } | null {
  if (!isRecord(value.draft)) return null;
  const versions = value.draft.versions;
  if (!Array.isArray(versions) || versions.length === 0) return null;
  const head = versions[versions.length - 1];
  if (!isRecord(head) || !isRecord(head.page)) return null;
  return { head, refPage: head.page };
}

async function loadComponentMap(
  ids: string[],
  getComponentsByIds: ComponentsByIds
): Promise<Map<string, CombinedComponent>> {
  const byId = new Map<string, CombinedComponent>();
  if (ids.length === 0) return byId;
  for (const row of await getComponentsByIds(ids)) {
    if (isRecord(row.value)) byId.set(row.id, row.value as unknown as CombinedComponent);
  }
  return byId;
}

async function draftToPayload(
  value: unknown,
  pageId: string,
  getComponentsByIds: ComponentsByIds
): Promise<PagePayload | null> {
  if (!isRecord(value)) return null;
  const draft = draftHead(value);
  if (!draft) return null;
  const { head, refPage } = draft;

  const byId = await loadComponentMap(collectRefIds(refPage), getComponentsByIds);

  return {
    schemaVersion: 3,
    appVersion: typeof head.appVersion === 'number' ? head.appVersion : 1,
    publishedAt: typeof head.publishedAt === 'string' ? head.publishedAt : '',
    pageId,
    page: {
      HEAD: hydrateSection(refPage.HEAD, byId),
      MAIN: hydrateSection(refPage.MAIN, byId),
      FOOTER: hydrateSection(refPage.FOOTER, byId),
    },
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
interface LegacyVersion {
  v?: number;
  savedAt?: string;
  published?: boolean;
  state?: { MAIN?: LegacyElement[] };
}
interface LegacyValue {
  versions?: LegacyVersion[];
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

function envelopeToPayload(value: Record<string, unknown>, preview: boolean): PagePayload | null {
  const picked = pickPage(value as unknown as CombinedObject<PagePublishedPayload>, preview);
  if (!picked) return null;
  const pageType = typeof value.pageType === 'string' ? value.pageType : undefined;
  return pageType ? { ...picked, pageType } : picked;
}

/** The newest published version by `savedAt`, else the first version. */
function chooseLegacyVersion(versions: LegacyVersion[]): LegacyVersion {
  const publishedVersions = versions.filter((x) => x.published);
  return publishedVersions.length
    ? publishedVersions.reduce((a, b) => ((a.savedAt ?? '') >= (b.savedAt ?? '') ? a : b))
    : versions[0];
}

function seedShapeToPayload(value: Record<string, unknown>, pageId: string): PagePayload | null {
  const versions = (value as LegacyValue).versions;
  if (!Array.isArray(versions) || versions.length === 0) return null;
  const chosen = chooseLegacyVersion(versions);
  return {
    schemaVersion: 2,
    appVersion: chosen.v ?? 1,
    publishedAt: chosen.savedAt ?? '',
    pageId,
    page: { HEAD: [], MAIN: (chosen.state?.MAIN ?? []).map(toEditorElement), FOOTER: [] },
  };
}

function normalizeLegacy(value: unknown, pageId: string, preview: boolean): PagePayload | null {
  if (!isRecord(value)) return null;

  // Pre-v3 combined envelope ({ draft: { versions: [{ page }] }, published }).
  if ('draft' in value || 'published' in value) return envelopeToPayload(value, preview);

  // Legacy seed shape.
  return seedShapeToPayload(value, pageId);
}

// ── Store ───────────────────────────────────────────────────────────────────────────────

export function createPageStore(store: CtStore): PageStore {
  const read = async (container: string, key: string, bypass: boolean): Promise<unknown> =>
    (await store.get(container, key, { bypass }))?.value ?? null;

  const componentsByIds = async (ids: string[]) =>
    (await store.getByIds(COMPONENTS_CONTAINER, ids)).map((o) => ({ id: o.id, value: o.value }));

  return {
    async loadPage(pageId, { preview }) {
      const key = pageKey(pageId);

      if (!preview) {
        const published = await read(PUBLISHED_PAGE_CONTAINER, key, false);
        const fromPublished = publishedToPayload(published, pageId);
        if (fromPublished) return fromPublished;
        return normalizeLegacy(await read(LEGACY_PAGE_CONTAINER, key, false), pageId, false);
      }

      // Preview: every read bypasses the cache so authors see their edits immediately.
      const draft = await read(DRAFT_PAGE_CONTAINER, key, true);
      const fromDraft = await draftToPayload(draft, pageId, componentsByIds);
      if (fromDraft) return fromDraft;
      const fromLegacy = normalizeLegacy(await read(LEGACY_PAGE_CONTAINER, key, true), pageId, true);
      if (fromLegacy) return fromLegacy;
      return publishedToPayload(await read(PUBLISHED_PAGE_CONTAINER, key, true), pageId);
    },
  };
}
