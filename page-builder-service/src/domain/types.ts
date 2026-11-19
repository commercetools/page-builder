/**
 * Domain types for page-builder content as stored in commercetools custom objects, and the
 * render shapes the service produces from them.
 *
 * Ported from the host SDK's `contract.ts` + `types.ts`. The storage layout and `schemaVersion`
 * are unchanged (see the `content-storage` spec), so these mirror what the MC app writes.
 */

// ── Storage layout ──────────────────────────────────────────────────────────────────────

/** Catalogs (`components`, `data-sources`, `sections`), settings, instances, comments, workflows. */
export const CATALOG_CONTAINER = 'page-editor' as const;
export const DRAFT_PAGE_CONTAINER = 'page-editor-draft' as const;
export const PUBLISHED_PAGE_CONTAINER = 'page-editor-published' as const;
export const COMPONENTS_CONTAINER = 'page-editor-components' as const;
/** Pre-v3 combined page objects lived in the catalog container; still read as a fallback. */
export const LEGACY_PAGE_CONTAINER = CATALOG_CONTAINER;

export const PAGE_SCHEMA_VERSION = 3 as const;
export const CATALOG_SCHEMA_VERSION = 2 as const;
export const MAX_VERSIONS = 50 as const;

export const CATALOG_KEYS = {
  components: 'components',
  'data-sources': 'data-sources',
  sections: 'sections',
  /** Service-owned: the host catalog's theme tokens. The MC app does not read it. */
  theme: 'theme',
} as const;
export type CatalogKey = keyof typeof CATALOG_KEYS;

export type ThemePayload = { theme: Theme };

export const SETTINGS_KEY = 'settings' as const;
export const DATA_SOURCE_INSTANCES_KEY = 'data-source-instances' as const;

export const pageKey = (pageId: string): string => `page-${pageId}`;

// ── Schema model (catalog) ──────────────────────────────────────────────────────────────

export type LocalizedString = Record<string, string>;
export type PageTypeId = 'all' | 'static' | 'category' | 'pdp' | 'dynamic';

export type SchemaFieldKind =
  | 'text' | 'richtext' | 'number' | 'boolean' | 'select' | 'image' | 'video' | 'link'
  | 'group' | 'dataSource' | 'product' | 'productPicks' | 'productPins'
  | 'category' | 'categoryPicks' | 'categoryPins';

export const LOCALIZABLE_KINDS: readonly SchemaFieldKind[] = ['text', 'richtext', 'select'];

export type SelectOption = { key: string; label: string | LocalizedString };

export type SchemaField = {
  key: string;
  label: string | LocalizedString;
  kind: SchemaFieldKind;
  required?: boolean;
  localized?: boolean;
  options?: SelectOption[];
  dataSourceType?: string;
  children?: SchemaField[];
};

export type ResolverKind =
  | 'product'
  | 'product-list'
  | 'products-by-category'
  | 'product-picks'
  | 'product-pins'
  | 'category'
  | 'category-list'
  | 'category-picks'
  | 'category-pins'
  | 'category-tree'
  | 'related-products';

export type FillKind = 'product-detail' | 'category-listing';

export type ComponentType = {
  type: string;
  name: LocalizedString;
  icon: string;
  groupKey: string;
  pageTypes?: PageTypeId[];
  description?: LocalizedString;
  schema: SchemaField[];
  inlineTextFields?: string[];
  fill?: { kind: FillKind; slice?: string };
};

export type ComponentGroup = { key: string; name: string | LocalizedString };

export type DataSourceType = {
  type: string;
  name: LocalizedString;
  icon: string;
  groupKey: string;
  description?: LocalizedString;
  schema: SchemaField[];
  resolver?: { kind: ResolverKind };
};

export type DataSourceGroup = { key: string; name: string };

export type Section = {
  id: string;
  name: LocalizedString;
  description: LocalizedString;
  icon: string;
  pageTypes: PageTypeId[];
};

export type SectionBackgroundTheme = { background: string; color?: string };

export type Theme = {
  sectionBackgrounds?: Record<string, SectionBackgroundTheme>;
  containerMaxWidth?: string;
  containerPaddingX?: string;
  gap?: { row?: string; column?: string };
};

export type SavedDataSource = {
  id: string;
  type: string;
  name: LocalizedString;
  config: Record<string, unknown>;
  savedForReuse: boolean;
};

export type ComponentsPayload = { groups: ComponentGroup[]; components: ComponentType[] };
export type DataSourcesPayload = { groups: DataSourceGroup[]; sources: DataSourceType[] };
export type SectionsPayload = { sections: Section[] };

/** The host-owned catalog document (see `catalog.schema.json`). */
export type Catalog = {
  components: ComponentsPayload;
  'data-sources': DataSourcesPayload;
  sections: SectionsPayload;
  theme?: Theme;
};

// ── Versioned catalog envelope ──────────────────────────────────────────────────────────

export type Version<T> = {
  appVersion: number;
  savedAt: string;
  publishedAt: string | null;
  /** Idempotency key: a stable hash of the payload `T`. */
  sourceHash?: string;
} & T;

export type Published<T> = {
  schemaVersion: 2;
  appVersion: number;
  publishedAt: string;
} & T;

export type CombinedCatalog<T> = {
  schemaVersion: 2;
  draft: { schemaVersion: 2; currentVersion: number; versions: Version<T>[] };
  published: Published<T> | null;
};

// ── Authored page input ─────────────────────────────────────────────────────────────────

export interface PageComponentVisibility {
  mobile: boolean;
  tablet: boolean;
  desktop: boolean;
}

export interface PageComponent {
  id: string;
  type: string;
  name: LocalizedString;
  visibility: PageComponentVisibility;
  settings: Record<string, unknown>;
}

export interface PageLayoutElement {
  id: string;
  kind: 'layout';
  width: '1/1' | '1/2' | '1/3' | '2/3' | '1/4' | '3/4';
  name: LocalizedString;
  visibility: PageComponentVisibility;
  style?: string;
  children: PageComponent[];
}

export interface PageEditorPage {
  HEAD: PageLayoutElement[];
  MAIN: PageLayoutElement[];
  FOOTER: PageLayoutElement[];
}

export interface ComponentAuthored {
  name: LocalizedString;
  visibility: PageComponentVisibility;
  style?: string;
  settings: Record<string, unknown>;
}

export interface ComponentDraftVersion extends ComponentAuthored {
  appVersion: number;
  savedAt: string;
  publishedAt: string | null;
}

/** Value of a component-instance custom object (`page-editor-components`). Draft-only. */
export interface CombinedComponent {
  schemaVersion: number;
  type: string;
  pageId: string;
  draft: {
    schemaVersion: number;
    currentVersion: number;
    componentId: string;
    versions: ComponentDraftVersion[];
  };
}

export interface PagePublishedPayload {
  schemaVersion: number;
  appVersion: number;
  publishedAt: string;
  pageId: string;
  page: PageEditorPage;
}

export interface PageDraftVersion {
  appVersion: number;
  savedAt: string;
  publishedAt: string | null;
  page: PageEditorPage;
}

export interface PageDraftHistory {
  schemaVersion: number;
  currentVersion: number;
  pageId: string;
  versions: PageDraftVersion[];
}

export interface DataSourceInstancesPayload {
  schemaVersion: number;
  instances: SavedDataSource[];
}

export interface CombinedObject<T> {
  draft: T;
  published: T | null;
}

/** The render snapshot, plus the envelope's optional page-type hint. */
export type PagePayload = PagePublishedPayload & { pageType?: string };

// ── Preview settings (operator configuration, stored in `settings`) ─────────────────────

export type PreviewRouteTemplates = {
  home?: string;
  category?: string;
  pdp?: string;
  content?: string;
};

export type PreviewSettings = {
  enabled?: boolean;
  routes?: PreviewRouteTemplates;
  homePageId?: string;
  vars?: Record<string, string>;
  defaultLocale?: string;
};

export type PreviewSettingsPayload = { schemaVersion: number; preview: PreviewSettings };

// ── Render shape (transform output; matches `LayoutSection` in openapi.yaml) ────────────

export type ResponsiveNumber = number | { mobile?: number; tablet?: number; desktop?: number };

export interface LayoutItem {
  layoutItemId?: string;
  layoutItemType: string;
  configuration: { name?: string; mobile?: boolean; tablet?: boolean; desktop?: boolean } & Record<
    string,
    unknown
  >;
}

export interface LayoutElement {
  layoutElementId?: string;
  configuration?: { mobile?: boolean; tablet?: boolean; desktop?: boolean; size?: ResponsiveNumber };
  items: LayoutItem[];
}

export interface LayoutSection {
  sectionId: string;
  configuration?: { background?: string };
  layoutElements: LayoutElement[];
}
