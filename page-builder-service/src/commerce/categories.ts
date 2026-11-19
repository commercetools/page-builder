/**
 * Category access over the full category list, loaded once per cache window and indexed in
 * memory. Trees, slug lookup, breadcrumbs and "top-level"/"children of" listings are all cheap
 * derivations of that list, so a category-heavy page costs one (cached) fetch.
 */

import type { TtlCache } from '../cache.js';
import type { ApiRoot } from '../ct/client.js';
import { loc, mapCategory, type CtCategory } from './mappers.js';
import type { Breadcrumb, CategoryNode, CommerceContext } from './shapes.js';

const PAGE_SIZE = 500;

export interface CategoryIndex {
  all: CtCategory[];
  byId: Map<string, CtCategory>;
  byKey: Map<string, CtCategory>;
  children: Map<string | undefined, CtCategory[]>;
}

function buildIndex(all: CtCategory[]): CategoryIndex {
  const byId = new Map(all.map((c) => [c.id, c]));
  const byKey = new Map(all.filter((c) => c.key).map((c) => [c.key as string, c]));
  const children = new Map<string | undefined, CtCategory[]>();
  for (const c of all) {
    const parent = c.parent && byId.has(c.parent.id) ? c.parent.id : undefined;
    const siblings = children.get(parent) ?? [];
    siblings.push(c);
    children.set(parent, siblings);
  }
  // CT's orderHint is a lexicographically sortable string; categories without one sort last.
  for (const list of children.values()) {
    list.sort((a, b) => (a.orderHint ?? '￿').localeCompare(b.orderHint ?? '￿'));
  }
  return { all, byId, byKey, children };
}

export interface Categories {
  index(ctx: CommerceContext): Promise<CategoryIndex>;
  /** The nested tree (optionally limited to `depth` levels below the roots). */
  tree(ctx: CommerceContext, depth?: number): Promise<CategoryNode[]>;
  /** A category by id or key, with its direct children. */
  get(idOrKey: string, ctx: CommerceContext): Promise<CategoryNode | null>;
  bySlug(slug: string, ctx: CommerceContext): Promise<CategoryNode | null>;
  /** Root → category trail. */
  breadcrumb(categoryId: string, ctx: CommerceContext): Promise<Breadcrumb>;
  /** Id of the category plus every descendant. */
  subTreeIds(categoryId: string, ctx: CommerceContext): Promise<string[]>;
  /** Categories matching a data-source `where` (`parent is not defined`, `parent(id="…")`). */
  list(where: string | undefined, ctx: CommerceContext): Promise<CategoryNode[]>;
}

export function createCategories(client: ApiRoot, cache: TtlCache): Categories {
  async function index(ctx: CommerceContext): Promise<CategoryIndex> {
    return cache.read(
      'categories:all',
      async () => {
        const all: CtCategory[] = [];
        for (let offset = 0; ; offset += PAGE_SIZE) {
          // Sequential by necessity: the next offset depends on the previous page's total.
          const { body: page } = await client
            .categories()
            .get({ queryArgs: { limit: PAGE_SIZE, offset, withTotal: true } })
            .execute();
          all.push(...page.results);
          if (all.length >= (page.total ?? 0) || page.results.length === 0) break;
        }
        return buildIndex(all);
      },
      { bypass: ctx.bypassCache }
    );
  }

  const node = (c: CtCategory, ctx: CommerceContext, idx: CategoryIndex, depth: number): CategoryNode => {
    const base = mapCategory(c, ctx.locale);
    const kids = idx.children.get(c.id) ?? [];
    return depth > 0 && kids.length
      ? { ...base, children: kids.map((k) => node(k, ctx, idx, depth - 1)) }
      : base;
  };

  return {
    index,

    async tree(ctx, depth = Infinity) {
      const idx = await index(ctx);
      return (idx.children.get(undefined) ?? []).map((c) => node(c, ctx, idx, depth - 1));
    },

    async get(idOrKey, ctx) {
      const idx = await index(ctx);
      const c = idx.byId.get(idOrKey) ?? idx.byKey.get(idOrKey);
      return c ? node(c, ctx, idx, 1) : null;
    },

    async bySlug(slug, ctx) {
      const idx = await index(ctx);
      // Prefer a match in the request locale; fall back to a slug in any locale.
      const c =
        idx.all.find((x) => x.slug?.[ctx.locale] === slug) ??
        idx.all.find((x) => Object.values(x.slug ?? {}).includes(slug));
      return c ? node(c, ctx, idx, 1) : null;
    },

    async breadcrumb(categoryId, ctx) {
      const idx = await index(ctx);
      const trail: Breadcrumb = [];
      const seen = new Set<string>();
      for (let c = idx.byId.get(categoryId); c && !seen.has(c.id); c = c.parent ? idx.byId.get(c.parent.id) : undefined) {
        seen.add(c.id);
        trail.unshift({ name: loc(c.name, ctx.locale) ?? '', slug: loc(c.slug, ctx.locale) ?? '' });
      }
      return trail;
    },

    async subTreeIds(categoryId, ctx) {
      const idx = await index(ctx);
      const ids: string[] = [];
      const walk = (id: string): void => {
        if (ids.includes(id)) return;
        ids.push(id);
        for (const k of idx.children.get(id) ?? []) walk(k.id);
      };
      if (idx.byId.has(categoryId)) walk(categoryId);
      return ids;
    },

    async list(where, ctx) {
      const idx = await index(ctx);
      const expr = where?.trim();
      let rows: CtCategory[];
      const parentMatch = expr?.match(/^parent\s*\(\s*id\s*=\s*"([^"]+)"\s*\)$/);
      if (expr === 'parent is not defined') rows = idx.children.get(undefined) ?? [];
      else if (parentMatch) rows = idx.children.get(parentMatch[1]) ?? [];
      else rows = [...idx.all];
      return rows.map((c) => node(c, ctx, idx, 0));
    },
  };
}
