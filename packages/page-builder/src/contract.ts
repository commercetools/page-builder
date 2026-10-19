/**
 * Shared host <-> page-builder contract types — the single source of truth for this
 * package (both the render runtime and the sync CLI import from here). Implements the
 * normative spec in `docs/sdd/definitions-contract.md`.
 */

// ── Schema model ────────────────────────────────────────────────────────────────────────

export type LocalizedString = Record<string, string>;

export type PageTypeId = 'all' | 'static' | 'category' | 'pdp' | 'dynamic';

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

export const LOCALIZABLE_KINDS: readonly SchemaFieldKind[] = [
  'text',
  'richtext',
  'select',
] as const;

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

// ── Definition types ────────────────────────────────────────────────────────────────────

/**
 * An export name from `@commercetools/nimbus-icons`, in that package's exact PascalCase
 * spelling (`MarkEmailRead`, `GridView`). The editor looks the name up verbatim — there is
 * no normalization — so anything it does not export renders no icon at all.
 */
export type IconName = string;

export type ComponentType = {
  type: string;
  name: LocalizedString;
  icon: IconName;
  groupKey: string;
  pageTypes?: PageTypeId[];
  description?: LocalizedString;
  schema: SchemaField[];
};

export type ComponentGroup = { key: string; name: string | LocalizedString };

export type DataSourceType = {
  type: string;
  name: LocalizedString;
  icon: IconName;
  groupKey: string;
  description?: LocalizedString;
  schema: SchemaField[];
};

export type DataSourceGroup = { key: string; name: string };

export type Section = {
  id: string;
  name: LocalizedString;
  description: LocalizedString;
  icon: IconName;
  pageTypes: PageTypeId[];
};

export type SavedDataSource = {
  id: string;
  type: string;
  name: LocalizedString;
  config: Record<string, unknown>;
  savedForReuse: boolean;
};

// ── Catalog payloads + envelope ─────────────────────────────────────────────────────────

export type ComponentsPayload = {
  groups: ComponentGroup[];
  components: ComponentType[];
};
export type DataSourcesPayload = {
  groups: DataSourceGroup[];
  sources: DataSourceType[];
};
export type SectionsPayload = { sections: Section[] };

export type CatalogBundle = {
  components: ComponentsPayload;
  'data-sources': DataSourcesPayload;
  sections: SectionsPayload;
};

// ── Manifest / visual-editing bridge ────────────────────────────────────────────────────

export const BRIDGE_CHANNEL = 'pb-visual-editing' as const;
export const BRIDGE_VERSION = 1 as const;

export type RegistryManifestEntry = {
  type: string;
  inlineTextFields: string[];
};

export type BridgeCapabilities = {
  select?: boolean;
  refresh?: boolean;
  dnd?: boolean;
  dropzones?: boolean;
  inlineText?: boolean;
};

export type BridgeMessage = {
  channel: typeof BRIDGE_CHANNEL;
  v: typeof BRIDGE_VERSION;
  type: string;
  payload?: unknown;
};

// ── CT persistence envelope (used by the sync CLI) ──────────────────────────────────────

export const CATALOG_SCHEMA_VERSION = 2 as const;
export const MAX_VERSIONS = 50 as const;

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

export const CATALOG_CONTAINER = 'page-editor' as const;

// ── Split page storage (schema v3) ──────────────────────────────────────────
// Pages are split by lifecycle across two containers; component instances live
// in their own container. Catalogs (above) stay in CATALOG_CONTAINER.
export const PAGE_SCHEMA_VERSION = 3 as const;
export const DRAFT_PAGE_CONTAINER = 'page-editor-draft' as const;
export const PUBLISHED_PAGE_CONTAINER = 'page-editor-published' as const;
export const COMPONENTS_CONTAINER = 'page-editor-components' as const;
/** Pre-v3 combined page objects lived here (host reads it as a legacy fallback). */
export const LEGACY_PAGE_CONTAINER = CATALOG_CONTAINER;

export const CATALOG_KEYS = {
  components: 'components',
  'data-sources': 'data-sources',
  sections: 'sections',
} as const;

export type CatalogKey = keyof typeof CATALOG_KEYS;

/** Maps a catalog key to its payload type. */
export type CatalogPayload<K extends CatalogKey> = K extends 'components'
  ? ComponentsPayload
  : K extends 'data-sources'
    ? DataSourcesPayload
    : SectionsPayload;
