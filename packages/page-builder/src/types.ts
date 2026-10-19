/**
 * Runtime types for rendering page-builder content.
 *
 * Two type families:
 * - The **authored wire format** (component/layout/page as stored by the editor) — imported
 *   from the shared contract, plus the page-object envelope shapes the host reads from CT.
 * - The **render shape** (`LayoutSection`/`LayoutElement`/`LayoutItem`/…) produced by
 *   `transformPageEditorToSections` and consumed by the host's grid components. These match
 *   the shapes a host already uses, so a host can re-export them from its own `lib/types`.
 */

import type { LocalizedString, SavedDataSource } from './contract.js';

// ── Authored page input (the render-side view of the editor's wire format) ───────────────
//
// Deliberately looser than the contract's strict authored types — in particular `style` is
// a plain string, because the host maps it to a render background and the built-in
// fallbacks use render-background values directly. The host reads whatever the editor
// wrote; strictness lives in the editor + the sync contract, not at the render boundary.

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

// ── Split page storage (schema v3): component refs + per-component objects ───────────────
//
// A draft page's layout children are references to component-instance objects (container
// `page-editor-components`); the host hydrates them for preview. A published page keeps its
// children inline (frozen), so the render types above are used unchanged for published.

/** Reference from a page layout to a component-instance custom object. */
export interface ComponentRef {
  typeId: 'key-value-document';
  /** CT-assigned id of the component custom object. */
  id: string;
}

/** Layout row whose children are references (stored draft shape). */
export interface RefLayoutElement extends Omit<PageLayoutElement, 'children'> {
  children: ComponentRef[];
}

/** Page tree whose layout children are references (stored draft shape). */
export interface RefPage {
  HEAD: RefLayoutElement[];
  MAIN: RefLayoutElement[];
  FOOTER: RefLayoutElement[];
}

/** Authored payload of a single component instance. */
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

// ── Page-object envelopes (what the host reads from CT container `page-editor`) ──────────

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

/** The page object's `draft` is a versioned history; the current page is the last version. */
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

// ── Render shape (transform output) ─────────────────────────────────────────────────────

export type SectionBackground = 'Dark' | 'Slate' | 'Blue' | 'Charcoal' | 'Sage';

export type ResponsiveNumber =
  | number
  | { mobile?: number; tablet?: number; desktop?: number };

export interface Configuration {
  mobile?: boolean;
  tablet?: boolean;
  desktop?: boolean;
}

export interface LayoutSection {
  sectionId: string;
  configuration?: { background?: SectionBackground };
  layoutElements: LayoutElement[];
}

export interface LayoutElementConfiguration extends Configuration {
  size?: ResponsiveNumber;
}

export interface LayoutElement {
  layoutElementId?: string;
  configuration?: LayoutElementConfiguration;
  items: LayoutItem[];
}

export type LayoutItemConfiguration = Configuration & {
  name?: string;
} & Record<string, unknown>;

export interface LayoutItem {
  layoutItemId?: string;
  layoutItemType: string;
  configuration: LayoutItemConfiguration;
}

/** Props for a page-editor block component (`data` = resolved settings). */
export interface ItemProps<T = object> {
  data: T;
  editMode?: boolean;
}

// ── Data-source resolution ──────────────────────────────────────────────────────────────

/**
 * The minimal context the engine needs. A host extends this with its own fields (brand,
 * store key, route params, etc.) and its resolvers read the extended shape — the engine is
 * generic over `Ctx` and only reads `locale`.
 */
export interface BaseDataSourceContext {
  locale: string;
}

export type DataSourceResolver<Ctx extends BaseDataSourceContext = BaseDataSourceContext> = (
  config: Record<string, unknown>,
  context: Ctx
) => Promise<unknown>;

export type ResolverMap<Ctx extends BaseDataSourceContext = BaseDataSourceContext> = Record<
  string,
  DataSourceResolver<Ctx>
>;

// ── Per-block dynamic resolution ─────────────────────────────────────────────────────────

/**
 * A block-level resolver: given a block's (already localized) settings and the render
 * context, return extra settings to merge in (e.g. fetched products/categories). Runs inside
 * the transform so hosts no longer switch on block type in a post-transform pass.
 */
export type BlockResolver<Ctx extends BaseDataSourceContext = BaseDataSourceContext> = (
  config: Record<string, unknown>,
  context: Ctx
) => Promise<Record<string, unknown>>;

export type BlockResolverMap<Ctx extends BaseDataSourceContext = BaseDataSourceContext> = Record<
  string,
  BlockResolver<Ctx>
>;
