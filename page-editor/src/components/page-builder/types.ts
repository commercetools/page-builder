export type LocalizedString = Record<string, string>;

export type Visibility = { mobile: boolean; tablet: boolean; desktop: boolean };

export type ElementStyle =
  | ''
  | 'light'
  | 'dark'
  | 'accent'
  | 'muted'
  | 'charcoal'
  | 'sage';

export type ComponentElement = {
  id: string;
  type: string;
  name: LocalizedString;
  visibility: Visibility;
  style?: ElementStyle;
  settings: Record<string, unknown>;
};

export type LayoutElement = {
  id: string;
  kind: 'layout';
  width: '1/1' | '1/2' | '1/3' | '2/3' | '1/4' | '3/4';
  name: LocalizedString;
  visibility: Visibility;
  style?: ElementStyle;
  children: ComponentElement[];
};

export type Page = Record<string, LayoutElement[]>;

export type Section = {
  id: string;
  name: LocalizedString;
  description: LocalizedString;
  icon: string;
  pageTypes: PageTypeId[];
};

export type PageNode = {
  id: string;
  key?: string;
  title: string;
  type?: 'dynamic' | 'template' | 'category' | 'folder';
  icon?: string;
  children?: PageNode[];
  /** Real storefront slug (categories only) — falls back to `id` when absent. */
  slug?: string;
};

export type SchemaFieldKind =
  | 'text'
  | 'richtext'
  | 'number'
  | 'boolean'
  | 'select'
  | 'image'
  | 'video'
  | 'link'
  | 'group'
  | 'dataSource'
  | 'product'
  | 'productPicks'
  | 'productPins'
  | 'category'
  | 'categoryPicks'
  | 'categoryPins';

export type SelectOption = {
  key: string;
  label: string | LocalizedString;
};

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

export type PageTypeId = 'all' | 'static' | 'category' | 'pdp' | 'dynamic';

export type PageTypeOption = {
  id: PageTypeId;
  label: string;
  icon: string;
};

export const PAGE_TYPES: PageTypeOption[] = [
  { id: 'all', label: 'All pages', icon: 'SelectAll' },
  { id: 'static', label: 'Static pages', icon: 'Description' },
  { id: 'category', label: 'Category pages', icon: 'Category' },
  { id: 'pdp', label: 'Product detail', icon: 'ShoppingBag' },
  { id: 'dynamic', label: 'Dynamic pages', icon: 'DynamicFeed' },
];

export const DEFAULT_SECTIONS: Section[] = [
  {
    id: 'HEAD',
    name: { 'en-US': 'Head' },
    description: {
      'en-US':
        'Announcement bars, global notices. Shown at the very top of every page render.',
    },
    icon: 'VerticalAlignTop',
    pageTypes: ['all'],
  },
  {
    id: 'MAIN',
    name: { 'en-US': 'Main' },
    description: {
      'en-US':
        'The primary content of the page. Most layout elements and components live here.',
    },
    icon: 'ViewAgenda',
    pageTypes: ['all'],
  },
  {
    id: 'FOOTER',
    name: { 'en-US': 'Footer' },
    description: {
      'en-US': 'Global footer content — newsletter, links, store info.',
    },
    icon: 'VerticalAlignBottom',
    pageTypes: ['all'],
  },
];

export type ComponentType = {
  type: string;
  name: LocalizedString;
  icon: string;
  groupKey: string;
  pageTypes?: PageTypeId[];
  description?: LocalizedString;
  schema: SchemaField[];
};

export type ComponentGroup = {
  key: string;
  name: string | LocalizedString;
};

export type DataSourceType = {
  type: string;
  name: LocalizedString;
  icon: string;
  groupKey: string;
  description?: LocalizedString;
  schema: SchemaField[];
};

export type DataSourceGroup = {
  key: string;
  name: string;
};

export type SavedDataSource = {
  id: string;
  type: string;
  name: LocalizedString;
  config: Record<string, unknown>;
  savedForReuse: boolean;
};

/**
 * Storefront preview (see openspec/specs/storefront-preview/spec.md).
 * Per-project config for embedding a host-rendered preview of the page being
 * edited. Stored as a single custom object `page-editor/settings`.
 */
export type PreviewPageType = 'home' | 'category' | 'pdp' | 'content';

export type PreviewRouteTemplates = {
  /** e.g. "/{locale}" */
  home: string;
  /** e.g. "/{locale}/category/{slug}" */
  category: string;
  /** e.g. "/{locale}/{slug}/p/{sku}" */
  pdp: string;
  /** Arbitrary single-segment pages, e.g. "/{locale}/{slug}" (no prefix). */
  content: string;
};

/** Per-environment host binding — only the base URL + token differ. */
export type PreviewEnvUrl = { baseUrl: string; token?: string };

/** The environments stored in the custom object. `local` lives in localStorage. */
export type PreviewEnvironments = {
  production: PreviewEnvUrl;
  staging: PreviewEnvUrl;
};

export type PreviewSettings = {
  /** Gates the Edit/Preview toggle in the builder. */
  enabled: boolean;
  /**
   * Legacy single origin — retained for back-compat and as the fallback when
   * `environments` is absent. New code resolves the active environment's URL
   * (see `environments` + the `use-preview-environment` hook).
   */
  baseUrl: string;
  /** Legacy shared secret; the active environment's token supersedes it. */
  token?: string;
  /**
   * Per-environment host bindings (base URL + token). `production`/`staging`
   * are stored here; the `local` environment is kept per-browser in
   * localStorage (never persisted to the custom object).
   */
  environments?: PreviewEnvironments;
  /** Host locale slug used by default (e.g. "en-us"). */
  defaultLocale: string;
  /** Host locale slugs offered in the preview locale switcher. */
  locales: string[];
  /** Public URL templates per page type, with {locale}/{slug}/{sku}/{var} tokens. */
  routes: PreviewRouteTemplates;
  /** Sample context for page types with no intrinsic entity (shared PDP template). */
  samples?: {
    pdp?: { sku: string; slug: string };
  };
  /** Extra template tokens, e.g. { brand: "gap" } for a `{brand}` segment. */
  vars?: Record<string, string>;
  /** Builder pageId treated as the storefront home page (default "home"). */
  homePageId?: string;
};

// ---------------------------------------------------------------------------
// Split storage (schema v3): per-component objects + draft/published pages.
//
// The in-memory model above (Page / LayoutElement / ComponentElement) is
// UNCHANGED — the builder keeps editing a fully-embedded Page. The types below
// describe only the STORED shapes: the page tree is split so component
// instances live in their own custom objects (COMPONENTS_CONTAINER) and pages
// carry references to them. See the refactor plan.
// ---------------------------------------------------------------------------

/**
 * Custom-object containers. Only page + component objects use the new
 * containers; every non-page object (catalogs, comments, workflows,
 * data-source-instances, preview settings) stays in LEGACY_PAGE_CONTAINER.
 */
export const DRAFT_PAGE_CONTAINER = 'page-editor-draft';
export const PUBLISHED_PAGE_CONTAINER = 'page-editor-published';
export const COMPONENTS_CONTAINER = 'page-editor-components';
/** Pre-v3 combined page objects lived here; still holds all non-page objects. */
export const LEGACY_PAGE_CONTAINER = 'page-editor';

export const PAGE_SCHEMA_VERSION = 3;
export const MAX_VERSIONS = 50;

/** Key of a page object (in the draft/published/legacy containers). */
export const pageKey = (pageId: string) => `page-${pageId}`;
/** Key of a component-instance object in COMPONENTS_CONTAINER. Always a valid CT key. */
export const componentKey = (componentId: string) => `component-${componentId}`;

/** Reference from a page layout to a component-instance object (CT reference shape). */
export type ComponentRef = {
  typeId: 'key-value-document';
  /** CT-assigned id of the component custom object (read back on upsert). */
  id: string;
};

/** Layout row whose children are component references — the STORED draft shape. */
export type RefLayoutElement = Omit<LayoutElement, 'children'> & {
  children: ComponentRef[];
};

/** A page tree whose layout children are references (STORED draft shape). */
export type RefPage = Record<string, RefLayoutElement[]>;

/** Authored, versioned payload of a single component instance. */
export type ComponentAuthored = {
  name: LocalizedString;
  visibility: Visibility;
  style?: ElementStyle;
  settings: Record<string, unknown>;
};

export type ComponentDraftVersion = {
  appVersion: number;
  savedAt: string;
  publishedAt: string | null;
} & ComponentAuthored;

/** Value of a component-instance custom object (COMPONENTS_CONTAINER). Draft-only:
 * published component content is captured inline in the published page. */
export type CombinedComponent = {
  schemaVersion: number;
  /** Component definition type, e.g. "content/hero". Immutable. */
  type: string;
  /** Owning page id (page-owned instances) — for orphan GC / cascade delete. */
  pageId: string;
  draft: {
    schemaVersion: number;
    currentVersion: number;
    /** Stable uuid; the object key is `component-<componentId>`. */
    componentId: string;
    versions: ComponentDraftVersion[];
  };
};

export type DraftPageVersion = {
  appVersion: number;
  savedAt: string;
  publishedAt: string | null;
  page: RefPage;
};

/** Value of a draft-page custom object (DRAFT_PAGE_CONTAINER), schema v3. */
export type DraftPagePayload = {
  schemaVersion: number;
  pageType?: PageTypeId;
  title?: string;
  path?: string;
  /** Denormalized last-published timestamp, so the pages list can show state
   * without reading PUBLISHED_PAGE_CONTAINER. */
  publishedAt?: string;
  draft: {
    schemaVersion: number;
    currentVersion: number;
    pageId: string;
    versions: DraftPageVersion[];
  };
};

/** Value of a published-page custom object (PUBLISHED_PAGE_CONTAINER), schema v3.
 * Self-contained: `page` is a frozen inline tree (same shape as the in-memory Page). */
export type PublishedPagePayload = {
  schemaVersion: number;
  pageType?: PageTypeId;
  title?: string;
  path?: string;
  appVersion: number;
  publishedAt: string;
  pageId: string;
  page: Page;
};
