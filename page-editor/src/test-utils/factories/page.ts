/**
 * Builders for the page domain. Every factory takes a partial override and deep-merges
 * nothing — overrides replace the key outright, which keeps them predictable. Ids default
 * to a stable counter rather than a uuid so failures are reproducible and snapshots of
 * derived state do not churn between runs.
 */
import type {
  ComponentAuthored,
  ComponentDraftVersion,
  ComponentElement,
  ComponentRef,
  CombinedComponent,
  DraftPagePayload,
  DraftPageVersion,
  LayoutElement,
  LocalizedString,
  Page,
  PublishedPagePayload,
  RefLayoutElement,
  RefPage,
  Visibility,
} from '../../components/page-builder/types';
import { PAGE_SCHEMA_VERSION } from '../../components/page-builder/types';

let seq = 0;
/** Deterministic id source. Reset between tests that assert on generated ids. */
export const nextId = (prefix: string) => `${prefix}-${++seq}`;
export const resetIds = () => {
  seq = 0;
};

/** A fixed instant, so anything deriving from `savedAt` is stable across runs. */
export const FIXED_NOW = '2026-01-15T10:00:00.000Z';

export const visible = (over: Partial<Visibility> = {}): Visibility => ({
  mobile: true,
  tablet: true,
  desktop: true,
  ...over,
});

export const localized = (
  value = 'Untitled',
  locale = 'en-US'
): LocalizedString => ({ [locale]: value });

export const buildComponentElement = (
  over: Partial<ComponentElement> = {}
): ComponentElement => ({
  id: nextId('component'),
  type: 'content/hero',
  name: localized('Hero'),
  visibility: visible(),
  settings: {},
  ...over,
});

export const buildLayoutElement = (
  over: Partial<LayoutElement> = {}
): LayoutElement => ({
  id: nextId('layout'),
  kind: 'layout',
  width: '1/1',
  name: localized('Row'),
  visibility: visible(),
  children: [],
  ...over,
});

/** An in-memory page: section id → layout rows. Defaults to one empty MAIN row. */
export const buildPage = (over: Partial<Page> = {}): Page => ({
  MAIN: [buildLayoutElement()],
  ...over,
});

export const buildComponentRef = (
  over: Partial<ComponentRef> = {}
): ComponentRef => ({
  typeId: 'key-value-document',
  id: nextId('co'),
  ...over,
});

export const buildRefLayoutElement = (
  over: Partial<RefLayoutElement> = {}
): RefLayoutElement => ({
  ...buildLayoutElement(),
  children: [],
  ...over,
});

/** The stored draft shape, where layout children are references. */
export const buildRefPage = (over: Partial<RefPage> = {}): RefPage => ({
  MAIN: [buildRefLayoutElement()],
  ...over,
});

export const buildComponentAuthored = (
  over: Partial<ComponentAuthored> = {}
): ComponentAuthored => ({
  name: localized('Hero'),
  visibility: visible(),
  settings: {},
  ...over,
});

export const buildComponentDraftVersion = (
  over: Partial<ComponentDraftVersion> = {}
): ComponentDraftVersion => ({
  ...buildComponentAuthored(),
  appVersion: 1,
  savedAt: FIXED_NOW,
  publishedAt: null,
  ...over,
});

/** Value of a component-instance custom object in COMPONENTS_CONTAINER. */
export const buildCombinedComponent = (
  over: Partial<CombinedComponent> = {}
): CombinedComponent => {
  const componentId = over.draft?.componentId ?? nextId('component');
  return {
    schemaVersion: PAGE_SCHEMA_VERSION,
    type: 'content/hero',
    pageId: 'home',
    ...over,
    draft: {
      schemaVersion: PAGE_SCHEMA_VERSION,
      currentVersion: 1,
      componentId,
      versions: [buildComponentDraftVersion()],
      ...over.draft,
    },
  };
};

export const buildDraftPageVersion = (
  over: Partial<DraftPageVersion> = {}
): DraftPageVersion => ({
  appVersion: 1,
  savedAt: FIXED_NOW,
  publishedAt: null,
  page: buildRefPage(),
  ...over,
});

/** Value of a draft-page custom object in DRAFT_PAGE_CONTAINER (schema v3). */
export const buildDraftPagePayload = (
  over: Partial<DraftPagePayload> = {}
): DraftPagePayload => ({
  schemaVersion: PAGE_SCHEMA_VERSION,
  pageType: 'static',
  title: 'Home',
  path: '/',
  ...over,
  draft: {
    schemaVersion: PAGE_SCHEMA_VERSION,
    currentVersion: 1,
    pageId: 'home',
    versions: [buildDraftPageVersion()],
    ...over.draft,
  },
});

/** Value of a published-page custom object — self-contained, inline tree. */
export const buildPublishedPagePayload = (
  over: Partial<PublishedPagePayload> = {}
): PublishedPagePayload => ({
  schemaVersion: PAGE_SCHEMA_VERSION,
  pageType: 'static',
  title: 'Home',
  path: '/',
  appVersion: 1,
  publishedAt: FIXED_NOW,
  pageId: 'home',
  page: buildPage(),
  ...over,
});
