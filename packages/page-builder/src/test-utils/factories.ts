/**
 * Fixtures for the render runtime and the page store.
 *
 * These mirror the *authored wire format* the editor writes, not the render shape
 * `transformPageEditorToSections` produces — a transform test wants a realistic input and
 * an explicit expected output, so generating both from one builder would be circular.
 */
import type {
  CombinedComponent,
  ComponentAuthored,
  ComponentDraftVersion,
  ComponentRef,
  PageComponent,
  PageComponentVisibility,
  PageEditorPage,
  PageLayoutElement,
  PagePublishedPayload,
  RefLayoutElement,
  RefPage,
} from '../types.js';
import type {
  ComponentType,
  DataSourceType,
  IconName,
  LocalizedString,
  SavedDataSource,
  SchemaField,
  Section,
} from '../contract.js';
import type { CtEnv } from '../core/env.js';

let seq = 0;
export const nextId = (prefix: string) => `${prefix}-${++seq}`;
export const resetIds = () => {
  seq = 0;
};

export const FIXED_NOW = '2026-01-15T10:00:00.000Z';

export const localized = (
  value = 'Untitled',
  locale = 'en-US'
): LocalizedString => ({ [locale]: value });

export const visible = (
  over: Partial<PageComponentVisibility> = {}
): PageComponentVisibility => ({
  mobile: true,
  tablet: true,
  desktop: true,
  ...over,
});

export const buildComponent = (
  over: Partial<PageComponent> = {}
): PageComponent => ({
  id: nextId('component'),
  type: 'content/hero',
  name: localized('Hero'),
  visibility: visible(),
  settings: {},
  ...over,
});

export const buildLayoutElement = (
  over: Partial<PageLayoutElement> = {}
): PageLayoutElement => ({
  id: nextId('layout'),
  kind: 'layout',
  width: '1/1',
  name: localized('Row'),
  visibility: visible(),
  children: [],
  ...over,
});

/** A page with all three sections present, as the render types require. */
export const buildPage = (over: Partial<PageEditorPage> = {}): PageEditorPage => ({
  HEAD: [],
  MAIN: [buildLayoutElement({ children: [buildComponent()] })],
  FOOTER: [],
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

export const buildRefPage = (over: Partial<RefPage> = {}): RefPage => ({
  HEAD: [],
  MAIN: [buildRefLayoutElement()],
  FOOTER: [],
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

export const buildCombinedComponent = (
  over: Partial<CombinedComponent> = {}
): CombinedComponent => ({
  schemaVersion: 3,
  type: 'content/hero',
  pageId: 'home',
  ...over,
  draft: {
    schemaVersion: 3,
    currentVersion: 1,
    componentId: nextId('component'),
    versions: [buildComponentDraftVersion()],
    ...over.draft,
  },
});

export const buildPublishedPayload = (
  over: Partial<PagePublishedPayload> = {}
): PagePublishedPayload => ({
  schemaVersion: 3,
  appVersion: 1,
  publishedAt: FIXED_NOW,
  pageId: 'home',
  page: buildPage(),
  ...over,
});

const TEST_CREDENTIAL = 'test-secret-value';

export const buildCtEnv = (over: Partial<CtEnv> = {}): CtEnv => ({
  projectKey: 'test-project',
  clientId: 'test-client-id',
  clientSecret: TEST_CREDENTIAL,
  authUrl: 'https://auth.example.test',
  apiUrl: 'https://api.example.test',
  scopes: 'manage_project:test-project',
  ...over,
});

// ── Catalog definitions ──────────────────────────────────────────────────────────────────

export const buildSchemaField = (
  over: Partial<SchemaField> = {}
): SchemaField => ({
  key: 'title',
  label: 'Title',
  kind: 'text',
  ...over,
});

export const buildComponentType = (
  over: Partial<ComponentType> = {}
): ComponentType => ({
  type: 'content/hero',
  name: localized('Hero'),
  icon: 'Image' as IconName,
  groupKey: 'content',
  schema: [buildSchemaField()],
  ...over,
});

export const buildDataSourceType = (
  over: Partial<DataSourceType> = {}
): DataSourceType => ({
  type: 'commerce/product-list',
  name: localized('Product list'),
  icon: 'ShoppingBag' as IconName,
  groupKey: 'commerce',
  schema: [buildSchemaField({ key: 'limit', label: 'Limit', kind: 'number' })],
  ...over,
});

export const buildSection = (over: Partial<Section> = {}): Section => ({
  id: 'MAIN',
  name: localized('Main'),
  description: localized('Primary content'),
  icon: 'ViewAgenda' as IconName,
  pageTypes: ['all'],
  ...over,
});

export const buildSavedDataSource = (
  over: Partial<SavedDataSource> = {}
): SavedDataSource => ({
  id: nextId('ds'),
  type: 'commerce/product-list',
  name: localized('Featured products'),
  config: {},
  savedForReuse: true,
  ...over,
});
