/**
 * The page-builder render layer (React Server Components), transportable across hosts.
 *
 * The grid itself (row container, cells, device visibility, edit-mode `data-pb-*` markers)
 * is generic. A few things vary per host and are injected via `createSections(config)`:
 * - `componentForType` — the host's registry lookup (`type` → block component).
 * - `sectionBg` — maps a section background to the host's theme class (Tailwind).
 * - `sectionsClassName` — full className for the top-level sections wrapper (spacing/gap
 *   between sections, including `0`). Defaults to `DEFAULT_SECTIONS_CLASSNAME`.
 * - `containerClassName` — full className for each section's max-width/padding container.
 *   Defaults to `DEFAULT_CONTAINER_CLASSNAME`.
 *
 * `sectionsClassName`/`containerClassName` are full overrides, not merged with the default — a
 * host that only wants to change the gap still passes the whole string, e.g.
 * `sectionsClassName: 'my-8 flex flex-col gap-y-0'` to remove the gap entirely. Same as
 * `sectionBg`, the host owns the actual Tailwind class.
 *
 * The dynamic/utility classes emitted here (`col-span-*`, `block/hidden` variants) still need
 * the host's Tailwind `@source` on this package (see the integration skill); a class supplied
 * via `sectionBg`/`sectionsClassName`/`containerClassName` is a literal in the HOST's own
 * source, so Tailwind's scanner picks it up there — no extra safelist entry needed for those.
 */

import type { FC, PropsWithChildren, ReactNode } from 'react';
import { deviceVisibility } from '../device-visibility.js';
import {
  buildBlockResolvers,
  buildManifest,
  type BlockDefinition,
  type RenderableRegistry,
} from '../registry.js';
import type {
  BaseDataSourceContext,
  BlockResolver,
  BlockResolverMap,
  ItemProps,
  LayoutElementConfiguration,
  LayoutItem,
  LayoutSection,
  ResponsiveNumber,
  SectionBackground,
} from '../types.js';
import { PBEditProvider } from './edit-context.js';
import { getPageBuilderConfig } from '../config.js';
import { createPageStore, type CustomObjectReader } from '../page-store.js';
import { resolvePageBuilderRoute } from '../route.js';
import { readSearchParams, type RawSearchParams } from '../preview.js';

export type LayoutItemComponent = (props: ItemProps<never>) => ReactNode | Promise<ReactNode>;

/** Fallback className for the top-level sections wrapper (vertical stack + gap). */
export const DEFAULT_SECTIONS_CLASSNAME = 'my-8 flex flex-col gap-y-8';
/** Fallback className for each section's max-width/padding container. */
export const DEFAULT_CONTAINER_CLASSNAME = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8';

// ── Combined registry ───────────────────────────────────────────────────────────────────

/**
 * Exact component coverage for a block list: one entry per block `type`, no more, no less.
 * A missing or stray key is a COMPILE error — this replaces hosts' `as unknown as` registry
 * casts and the catalog / registry / stored-type three-way drift.
 */
export type ComponentMap<B extends readonly BlockDefinition[]> = {
  [K in B[number]['type']]: LayoutItemComponent;
};

/** The render half of the registry: the framework-agnostic parts plus the component lookup. */
export interface PageBuilderRegistry<Ctx extends BaseDataSourceContext = BaseDataSourceContext>
  extends RenderableRegistry<Ctx> {
  componentForType: (type: string) => LayoutItemComponent | undefined;
}

/**
 * Pair block definitions with their components (and optional resolvers) in one place, from
 * which `createSections`, the manifest, and per-block resolution all derive.
 *
 * - `components` covers palette blocks — coverage is checked at compile time via `ComponentMap`.
 * - `opts.systemComponents` maps route-driven, non-palette types (e.g. `pdp/*`, `category/*`)
 *   to components; they render on the same grid but are NOT advertised in the manifest.
 * - `opts.resolvers` supplies per-block dynamic fills needing host context (merged over any
 *   `resolve` declared on the block definitions themselves).
 */
export function buildRegistry<
  const B extends readonly BlockDefinition[],
  Ctx extends BaseDataSourceContext = BaseDataSourceContext,
>(
  blocks: B,
  components: ComponentMap<B>,
  opts?: {
    resolvers?: Partial<Record<B[number]['type'], BlockResolver<Ctx>>>;
    systemComponents?: Record<string, LayoutItemComponent>;
  }
): PageBuilderRegistry<Ctx> {
  const palette = components as Record<string, LayoutItemComponent>;
  const system = opts?.systemComponents ?? {};

  const resolversByType: BlockResolverMap<Ctx> = buildBlockResolvers<Ctx>(blocks);
  if (opts?.resolvers) {
    for (const [type, resolver] of Object.entries(opts.resolvers)) {
      if (resolver) resolversByType[type] = resolver as BlockResolver<Ctx>;
    }
  }

  return {
    blocks,
    manifest: buildManifest(blocks),
    resolversByType,
    componentForType: (type: string) => palette[type] ?? system[type],
  };
}

// ── Grid (row container) ────────────────────────────────────────────────────────────────

const Grid: FC<PropsWithChildren<{ containerClassName: string }>> = ({
  containerClassName,
  children,
}) => (
  <div className={containerClassName}>
    <div className="grid grid-cols-12 gap-6 md:gap-8">{children}</div>
  </div>
);

// ── Cell (one column) ───────────────────────────────────────────────────────────────────

function resolveColSpan(size?: ResponsiveNumber): string {
  if (!size) return 'col-span-12';
  if (typeof size === 'number') return `col-span-${size}`;
  const base = size.mobile ? `col-span-${size.mobile}` : 'col-span-12';
  const md = size.tablet ? ` md:col-span-${size.tablet}` : '';
  const lg = size.desktop ? ` lg:col-span-${size.desktop}` : '';
  return base + md + lg;
}

type CellProps = PropsWithChildren<{
  configuration?: LayoutElementConfiguration;
  layoutElementId?: string;
  editMode?: boolean;
}>;

const Cell: FC<CellProps> = ({ configuration, layoutElementId, editMode = false, children }) => {
  const className = [
    deviceVisibility(configuration),
    resolveColSpan(configuration?.size),
    'flex flex-col gap-2 md:gap-4',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      className={className}
      data-pb-id={editMode ? layoutElementId : undefined}
      data-pb-kind={editMode ? 'layout' : undefined}
      data-pb-dropzone={
        editMode && layoutElementId
          ? JSON.stringify({ section: 'MAIN', layoutId: layoutElementId })
          : undefined
      }
    >
      {children}
    </div>
  );
};

// ── MissingItem (unknown type) ──────────────────────────────────────────────────────────

const MissingItem: FC<{ layoutItemType: string }> = ({ layoutItemType }) => {
  if (process.env.NODE_ENV === 'production') return null;
  return (
    <div className="my-2 rounded-md border border-dashed border-orange-500 bg-orange-50 px-4 py-3 text-sm text-orange-700">
      Unknown block type <b className="font-mono">{layoutItemType || '(empty)'}</b> — no component
      is registered for it in the host registry.
    </div>
  );
};

/**
 * Build the render tree bound to a host's registry + theme. Returns the `Sections`
 * component the host mounts in its routes.
 */
export function createSections<Ctx extends BaseDataSourceContext = BaseDataSourceContext>(
  registry: PageBuilderRegistry<Ctx>,
  options?: {
    sectionBg?: (background?: SectionBackground) => string | undefined;
    /** Full override for the sections wrapper. Defaults to `DEFAULT_SECTIONS_CLASSNAME`. */
    sectionsClassName?: string;
    /** Full override for each section's container. Defaults to `DEFAULT_CONTAINER_CLASSNAME`. */
    containerClassName?: string;
  }
): FC<{
  sections: LayoutSection[];
  editMode?: boolean;
}> {
  const { componentForType } = registry;
  const sectionBg = options?.sectionBg;
  const sectionsClassName = options?.sectionsClassName ?? DEFAULT_SECTIONS_CLASSNAME;
  const containerClassName = options?.containerClassName ?? DEFAULT_CONTAINER_CLASSNAME;

  const Item: FC<LayoutItem & { editMode?: boolean }> = ({
    layoutItemId,
    layoutItemType,
    configuration,
    editMode = false,
  }) => {
    const SelectedComponent = componentForType(layoutItemType);
    return (
      <div
        className={deviceVisibility(configuration) ?? undefined}
        data-pb-id={editMode ? layoutItemId : undefined}
        data-pb-type={editMode ? layoutItemType : undefined}
        data-pb-kind={editMode ? 'component' : undefined}
      >
        {SelectedComponent ? (
          <PBEditProvider editMode={editMode}>
            <SelectedComponent data={configuration as never} editMode={editMode} />
          </PBEditProvider>
        ) : (
          <MissingItem layoutItemType={layoutItemType} />
        )}
      </div>
    );
  };

  const Sections: FC<{ sections: LayoutSection[]; editMode?: boolean }> = ({
    sections,
    editMode = false,
  }) => (
    <div
      className={sectionsClassName}
      data-pb-section={editMode ? 'MAIN' : undefined}
      data-pb-kind={editMode ? 'section' : undefined}
      data-pb-dropzone={editMode ? JSON.stringify({ section: 'MAIN', layoutId: null }) : undefined}
    >
      {sections.map((section) => {
        const withItems = section.layoutElements.filter((el) => el.items.length > 0);
        if (withItems.length === 0) return null;

        const mobile = withItems.some((el) => el.configuration?.mobile ?? true);
        const tablet = withItems.some((el) => el.configuration?.tablet ?? true);
        const desktop = withItems.some((el) => el.configuration?.desktop ?? true);
        const visibility = deviceVisibility({ mobile, tablet, desktop });
        const containerBackground = sectionBg?.(section.configuration?.background);
        const className = [visibility, containerBackground].filter(Boolean).join(' ') || undefined;

        return (
          <div
            key={section.sectionId}
            className={className}
            data-section-id={section.sectionId}
          >
            <Grid containerClassName={containerClassName}>
              {section.layoutElements.map((layoutElement, layoutElementIndex) => (
                <Cell
                  key={layoutElement.layoutElementId || layoutElementIndex}
                  configuration={layoutElement.configuration}
                  layoutElementId={layoutElement.layoutElementId}
                  editMode={editMode}
                >
                  {layoutElement.items.map((item, itemIndex) => (
                    <Item key={item.layoutItemId || itemIndex} {...item} editMode={editMode} />
                  ))}
                </Cell>
              ))}
            </Grid>
          </div>
        );
      })}
    </div>
  );

  return Sections;
}

// ── Full request → render pipeline, as one component ───────────────────────────────────

/** A route's `params`/`searchParams` prop shape — accepted either awaited or not. */
export type RouteParams = Record<string, string | string[] | undefined>;

export interface CreatePageBuilderSectionsOptions<
  Ctx extends BaseDataSourceContext = BaseDataSourceContext,
> {
  /** Reads a CT custom object's `value` for this project (the host's own CT client). */
  getCustomObjectValue: CustomObjectReader;
  /**
   * Batch-resolves component-instance objects by CT id, for hydrating a draft page's
   * component references in PREVIEW. Optional — without it, preview falls back to the
   * published snapshot. Wire it to `getCustomObjectsByIds(env, token, ids, COMPONENTS_CONTAINER)`.
   */
  getComponentsByIds?: (
    ids: string[]
  ) => Promise<Array<{ id: string; value: unknown }>>;
  /** Maps a section background to the host's Tailwind theme class. */
  sectionBg?: (background?: SectionBackground) => string | undefined;
  /** Full className override for the sections wrapper. Defaults to `DEFAULT_SECTIONS_CLASSNAME`. */
  sectionsClassName?: string;
  /** Full className override for each section's container. Defaults to `DEFAULT_CONTAINER_CLASSNAME`. */
  containerClassName?: string;
}

export interface PageSectionsProps<Ctx extends BaseDataSourceContext = BaseDataSourceContext> {
  /** Which shared page-builder template to render — `'home'`, `'category'`, `'pdp'`, or a per-instance id. */
  pageType: string;
  /** The route's `params` prop, passed through as-is (awaited or not). Spread into the resolver context. */
  params: RouteParams | Promise<RouteParams>;
  /** The route's `searchParams` prop, passed through as-is (awaited or not). */
  searchParams: RawSearchParams | Promise<RawSearchParams>;
  /** Extra resolver context not derivable from `params` (currency, session, …) — merged last, so it wins. */
  context?: Partial<Ctx>;
  /** Overrides the locale used for untranslated-field fallback. Defaults to `params.locale`. */
  defaultLocale?: string;
  /** Rendered when `DYNAMIC_PAGES` is off, or no renderable page exists yet for `pageType`. */
  children?: ReactNode;
}

/**
 * Bind the full request → render pipeline — config, `createPageStore`, `dynamicPages` gating,
 * `resolvePageBuilderRoute`, and the render grid — to a host's registry + CT reader, once. The
 * returned `Sections` component is what a route mounts; it only ever needs the three things
 * that vary per request (`pageType`, `params`, `searchParams`), not the project-wide constants
 * (`registry`, `sectionBg`, `getCustomObjectValue`) a route has no business repeating:
 *
 * ```tsx
 * // lib/page-builder/sections.tsx — bind it once
 * export const Sections = createPageBuilderSections(registry, { sectionBg, getCustomObjectValue });
 *
 * // app/[locale]/page.tsx — every route looks like this
 * export default async function HomePage({ params, searchParams }) {
 *   return (
 *     <Sections pageType="home" params={params} searchParams={searchParams}>
 *       <YourFallbackMarkup />
 *     </Sections>
 *   );
 * }
 * ```
 *
 * `children` renders whenever there's nothing to render — the flag is off, or `pageType` isn't
 * seeded yet. That is an expected, common state, not an error: this deliberately returns
 * `children` rather than throwing, so a route never needs a try/catch here to fall back to its
 * own markup (and never risks a broad catch swallowing an unrelated real bug in a resolver).
 */
export function createPageBuilderSections<Ctx extends BaseDataSourceContext = BaseDataSourceContext>(
  registry: PageBuilderRegistry<Ctx>,
  options: CreatePageBuilderSectionsOptions<Ctx>
): (props: PageSectionsProps<Ctx>) => Promise<ReactNode> {
  const store = createPageStore({
    getCustomObjectValue: options.getCustomObjectValue,
    getComponentsByIds: options.getComponentsByIds,
  });
  const Grid = createSections(registry, {
    sectionBg: options.sectionBg,
    sectionsClassName: options.sectionsClassName,
    containerClassName: options.containerClassName,
  });

  return async function Sections({
    pageType,
    params,
    searchParams,
    context,
    defaultLocale,
    children = null,
  }: PageSectionsProps<Ctx>): Promise<ReactNode> {
    const config = getPageBuilderConfig();
    if (!config.dynamicPages) return children;

    const [resolvedParams, rawSearchParams] = await Promise.all([params, searchParams]);
    const localeParam = resolvedParams?.locale;
    const resolvedLocale =
      defaultLocale ?? (Array.isArray(localeParam) ? localeParam[0] : localeParam) ?? '';

    const result = await resolvePageBuilderRoute<Ctx>({
      searchParams: readSearchParams(rawSearchParams),
      pageId: pageType,
      previewToken: config.previewToken,
      store,
      registry,
      context: { ...resolvedParams, searchParams: rawSearchParams, ...context } as unknown as Ctx,
      defaultLocale: resolvedLocale,
    });

    if (!result) return children;
    return <Grid sections={result.sections} editMode={result.editMode} />;
  };
}

// ── Inline-text editing primitives (client) ─────────────────────────────────────────────

export { PBText, Editable, PBEditProvider, usePBEditMode } from './edit-context.js';
export type { PBTextProps } from './edit-context.js';
