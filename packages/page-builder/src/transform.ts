/**
 * The layout transform + data-source resolution engine.
 *
 * Pure and framework-agnostic: no React, no CT client, no brand logic. The host injects its
 * resolvers and default locale; storage and orchestration live in the host (see
 * `createLayoutEngine`). Behaviour is identical to the reference host's original
 * `lib/layout.ts` — only the injected dependencies changed.
 */

import type { SavedDataSource } from './contract.js';
import type {
  BaseDataSourceContext,
  BlockResolverMap,
  LayoutSection,
  PageDraftHistory,
  PagePublishedPayload,
  CombinedObject,
  ResolverMap,
  ResponsiveNumber,
  SectionBackground,
} from './types.js';

export const WIDTH_TO_COLS: Record<string, number> = {
  '1/1': 12,
  '1/2': 6,
  '1/3': 4,
  '2/3': 8,
  '1/4': 3,
  '3/4': 9,
};

/** Columns stack full-width on mobile, then take their fraction on tablet/desktop. */
export function responsiveSize(cols: number): ResponsiveNumber {
  return cols >= 12 ? 12 : { mobile: 12, tablet: cols, desktop: cols };
}

/**
 * Pick the draft (in preview) or the published payload — but only when the chosen payload is
 * valid for its use, else fall back to published so the host never renders a malformed one.
 */
export function pickValid<T>(
  obj: CombinedObject<T> | null | undefined,
  preview: boolean,
  isValid: (payload: T | null) => boolean
): T | null {
  if (!obj) return null;
  if (preview) {
    if (isValid(obj.draft)) return obj.draft;
    if (obj.draft && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[page-editor] preview draft not renderable; falling back to published');
    }
  }
  return isValid(obj.published) ? obj.published : null;
}

/**
 * Resolve the page payload to render: in preview the latest **draft** version (the draft is
 * a versioned history), otherwise the published snapshot.
 */
export function pickPage(
  obj: CombinedObject<PagePublishedPayload> | null | undefined,
  preview: boolean
): PagePublishedPayload | null {
  if (!obj) return null;
  if (preview) {
    const draft = obj.draft as unknown as
      | PageDraftHistory
      | PagePublishedPayload
      | null;
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
    if ((draft as PagePublishedPayload | null)?.page) {
      return draft as PagePublishedPayload;
    }
    if (obj.draft && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[page-editor] preview draft not renderable; falling back to published');
    }
  }
  return obj.published?.page ? obj.published : null;
}

/** Recursively resolve locale maps (`{ 'en-US': '...' }`) to plain strings. */
export function localizeConfig<T>(value: T, locale: string, defaultLocale: string): T {
  if (Array.isArray(value)) {
    return value.map((item) => localizeConfig(item, locale, defaultLocale)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as object);
    const isLocaleMap =
      keys.length > 0 &&
      keys.every((k) => /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(k)) &&
      Object.values(value as Record<string, unknown>).every((v) => typeof v === 'string');
    if (isLocaleMap) {
      const map = value as Record<string, string>;
      return (map[locale] ?? map[defaultLocale] ?? Object.values(map)[0]) as unknown as T;
    }
    return Object.fromEntries(
      Object.entries(value as object).map(([k, v]) => [k, localizeConfig(v, locale, defaultLocale)])
    ) as unknown as T;
  }
  return value;
}

/** Swap any settings value that is a saved-data-source id for its resolved data. */
export async function resolveDataSources<Ctx extends BaseDataSourceContext>(
  settings: Record<string, unknown>,
  dsMap: Map<string, SavedDataSource>,
  context: Ctx,
  resolvers: ResolverMap<Ctx>,
  defaultLocale: string
): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    Object.entries(settings).map(async ([k, v]) => {
      if (typeof v === 'string' && dsMap.has(v)) {
        const ds = dsMap.get(v)!;
        const localizedConfig = localizeConfig(ds.config, context.locale, defaultLocale) as Record<
          string,
          unknown
        >;
        const resolver = resolvers[ds.type];
        if (resolver) {
          return [k, await resolver(localizedConfig, context)];
        }
        return [k, { type: ds.type, ...localizedConfig }];
      }
      return [k, v];
    })
  );
  return Object.fromEntries(entries);
}

export type TransformDeps<Ctx extends BaseDataSourceContext> = {
  resolvers: ResolverMap<Ctx>;
  defaultLocale: string;
  /** Per-block dynamic fills, keyed by block `type`; merged after data-source resolution. */
  blockResolvers?: BlockResolverMap<Ctx>;
};

/** Transform a page payload's MAIN into 12-column render sections, resolving data sources. */
export async function transformPageEditorToSections<Ctx extends BaseDataSourceContext>(
  payload: PagePublishedPayload,
  dsMap: Map<string, SavedDataSource>,
  context: Ctx,
  deps: TransformDeps<Ctx>
): Promise<LayoutSection[]> {
  const { locale } = context;
  const { resolvers, defaultLocale, blockResolvers } = deps;
  const elements = payload.page?.MAIN ?? [];

  // Group consecutive elements into rows of 12 columns.
  const rows: (typeof elements)[] = [];
  let currentRow: typeof elements = [];
  let currentColSum = 0;
  for (const element of elements) {
    const cols = WIDTH_TO_COLS[element.width] ?? 12;
    if (currentColSum + cols > 12 && currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [];
      currentColSum = 0;
    }
    currentRow.push(element);
    currentColSum += cols;
    if (currentColSum >= 12) {
      rows.push(currentRow);
      currentRow = [];
      currentColSum = 0;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  return Promise.all(
    rows.map(async (row) => {
      const layoutElements = await Promise.all(
        row.map(async (element) => {
          const cols = WIDTH_TO_COLS[element.width] ?? 12;
          const items = await Promise.all(
            element.children.map(async (child) => {
              const localizedSettings = localizeConfig(
                child.settings,
                locale,
                defaultLocale
              ) as Record<string, unknown>;
              const resolvedSettings = await resolveDataSources(
                localizedSettings,
                dsMap,
                context,
                resolvers,
                defaultLocale
              );
              // Per-block dynamic fill (e.g. fetch products) — co-located with the block
              // definition, run here instead of a host post-transform switch.
              const fill = blockResolvers?.[child.type];
              const dynamic = fill ? await fill(resolvedSettings, context) : undefined;
              return {
                layoutItemId: child.id,
                layoutItemType: child.type,
                configuration: {
                  mobile: child.visibility.mobile,
                  tablet: child.visibility.tablet,
                  desktop: child.visibility.desktop,
                  ...resolvedSettings,
                  ...(dynamic ?? {}),
                },
              };
            })
          );
          return {
            layoutElementId: element.id,
            configuration: {
              mobile: element.visibility.mobile,
              tablet: element.visibility.tablet,
              desktop: element.visibility.desktop,
              size: responsiveSize(cols),
            },
            items,
          };
        })
      );

      const rowStyle = row[0].style;
      return {
        sectionId: row.map((e) => e.id).join('-'),
        configuration: rowStyle
          ? { background: rowStyle as SectionBackground }
          : undefined,
        layoutElements,
      } satisfies LayoutSection;
    })
  );
}
