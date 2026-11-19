/**
 * An in-memory commercetools for tests and local development: a `fetch`-compatible function
 * that answers the subset of the API the service uses.
 *
 * It is deliberately small but behaves like the real thing where the service depends on it:
 * custom-object versioning (409 on a stale write), price selection on projections, and Product
 * Search compound queries / facets / post filters / sorting. It does NOT prove the service's
 * queries are valid against real commercetools; that needs a live project.
 */

export interface FakeLocalized {
  [locale: string]: string;
}

export interface FakeVariant {
  id: number;
  sku: string;
  images?: Array<{ url: string; label?: string }>;
  attributes?: Array<{ name: string; value: unknown }>;
  prices?: Array<{
    value: { centAmount: number; currencyCode: string };
    country?: string;
    discounted?: { value: { centAmount: number; currencyCode: string } };
    recurrencePolicy?: { id: string };
  }>;
  availability?: { isOnStock: boolean };
}

export interface FakeProduct {
  id: string;
  key?: string;
  name: FakeLocalized;
  slug: FakeLocalized;
  description?: FakeLocalized;
  categories: string[];
  createdAt: string;
  stores?: string[];
  masterVariant: FakeVariant;
  variants?: FakeVariant[];
  reviewRatingStatistics?: { averageRating: number; count: number; ratingsDistribution?: Record<string, number> };
}

export interface FakeCategory {
  id: string;
  key?: string;
  name: FakeLocalized;
  slug: FakeLocalized;
  description?: FakeLocalized;
  parent?: string;
  orderHint?: string;
  image?: string;
}

export interface FakeProductType {
  id: string;
  attributes: Array<Record<string, unknown>>;
}

export interface FakeCustomObject {
  id: string;
  version: number;
  container: string;
  key: string;
  value: unknown;
  lastModifiedAt: string;
}

export interface FakeCt {
  fetch: typeof fetch;
  customObjects: Map<string, FakeCustomObject>;
  categories: FakeCategory[];
  products: FakeProduct[];
  productTypes: FakeProductType[];
  stores: Array<{ id: string; key: string }>;
  /** Every API call in order, for assertions. */
  calls: Array<{ method: string; path: string; query: Record<string, string[]>; body?: unknown }>;
  /** Make the next matching call fail with a status. */
  failNext(match: string | RegExp, status: number, body?: unknown): void;
  /** Convenience: store a custom object value directly. */
  put(container: string, key: string, value: unknown): FakeCustomObject;
  /** The stored value (not the envelope); use `customObjects` for version metadata. */
  get(container: string, key: string): unknown;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const err = (status: number, message: string): Response => json({ statusCode: status, message }, status);

type Expr = Record<string, unknown>;

export function createFakeCt(projectKey = 'us-store'): FakeCt {
  const customObjects = new Map<string, FakeCustomObject>();
  const state = {
    categories: [] as FakeCategory[],
    products: [] as FakeProduct[],
    productTypes: [] as FakeProductType[],
    stores: [] as Array<{ id: string; key: string }>,
  };
  const calls: FakeCt['calls'] = [];
  const failures: Array<{ match: string | RegExp; status: number; body?: unknown }> = [];
  let nextId = 1;
  const newId = (): string => `fake-id-${nextId++}`;
  const objKey = (container: string, key: string): string => `${container}/${key}`;

  function put(container: string, key: string, value: unknown): FakeCustomObject {
    const existing = customObjects.get(objKey(container, key));
    const obj: FakeCustomObject = {
      id: existing?.id ?? newId(),
      version: (existing?.version ?? 0) + 1,
      container,
      key,
      value,
      lastModifiedAt: new Date().toISOString(),
    };
    customObjects.set(objKey(container, key), obj);
    return obj;
  }

  // ── Category helpers ────────────────────────────────────────────────────────────────
  const subTree = (id: string): string[] => {
    const out = [id];
    for (const c of state.categories) if (c.parent === id) out.push(...subTree(c.id));
    return out;
  };

  // ── Projection with price selection ─────────────────────────────────────────────────
  function projectVariant(v: FakeVariant, currency?: string, country?: string): Record<string, unknown> { // NOSONAR: in-memory test double, not deployed code
    const prices = (v.prices ?? []).map((p) => ({
      id: `${v.sku}-price`,
      value: p.value,
      ...(p.country ? { country: p.country } : {}),
      ...(p.discounted ? { discounted: { value: p.discounted.value, discount: { typeId: 'product-discount', id: 'd1' } } } : {}),
      ...(p.recurrencePolicy ? { recurrencePolicy: { typeId: 'recurrence-policy', ...p.recurrencePolicy } } : {}),
    }));
    const out: Record<string, unknown> = {
      id: v.id,
      sku: v.sku,
      images: v.images ?? [],
      attributes: v.attributes ?? [],
      prices,
      ...(v.availability ? { availability: v.availability } : {}),
    };
    if (currency) {
      const match =
        prices.find((p) => p.value.currencyCode === currency && p.country === country) ??
        prices.find((p) => p.value.currencyCode === currency && !p.country);
      if (match) {
        out.price = match;
        out.scopedPrice = {
          value: match.value,
          currentValue: match.discounted?.value ?? match.value,
          ...(match.discounted ? { discounted: match.discounted } : {}),
        };
      }
    }
    return out;
  }

  function projection(p: FakeProduct, q: URLSearchParams): Record<string, unknown> {
    const currency = q.get('priceCurrency') ?? undefined;
    const country = q.get('priceCountry') ?? undefined;
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      slug: p.slug,
      description: p.description,
      categories: p.categories.map((id) => ({ typeId: 'category', id })),
      reviewRatingStatistics: p.reviewRatingStatistics,
      masterVariant: projectVariant(p.masterVariant, currency, country),
      variants: (p.variants ?? []).map((v) => projectVariant(v, currency, country)),
    };
  }

  // ── Product Search ──────────────────────────────────────────────────────────────────
  const allVariants = (p: FakeProduct): FakeVariant[] => [p.masterVariant, ...(p.variants ?? [])];

  /** Values a search `field` takes on a product (arrays: any-of semantics). */
  function fieldValues(p: FakeProduct, field: string, language?: string): unknown[] { // NOSONAR: in-memory test double, not deployed code
    switch (field) {
      case 'id':
        return [p.id];
      case 'key':
        return p.key ? [p.key] : [];
      case 'categories':
        return p.categories;
      case 'categoriesSubTree':
        return p.categories.flatMap((c) => [c, ...state.categories.filter((x) => subTree(x.id).includes(c)).map((x) => x.id)]);
      case 'stores':
        return p.stores ?? [];
      case 'name':
      case 'description': {
        const value = p[field] as FakeLocalized | undefined;
        return language && value?.[language] ? [value[language]] : [];
      }
      case 'variants.sku':
        return allVariants(p).map((v) => v.sku);
      case 'variants.prices.currencyCode':
        return allVariants(p).flatMap((v) => (v.prices ?? []).map((x) => x.value.currencyCode));
      case 'variants.prices.centAmount':
        return allVariants(p).flatMap((v) => (v.prices ?? []).map((x) => x.value.centAmount));
      default: {
        const m = field.match(/^variants\.attributes\.([^.]+)(\.key)?$/);
        if (!m) return [];
        return allVariants(p).flatMap((v) =>
          (v.attributes ?? [])
            .filter((a) => a.name === m[1])
            .flatMap((a) => {
              const val = a.value as unknown;
              const items = Array.isArray(val) ? val : [val];
              return items.map((i) => (i && typeof i === 'object' && 'key' in (i as object) ? (i as { key: unknown }).key : i));
            })
        );
      }
    }
  }

  function matches(p: FakeProduct, e: Expr): boolean {
    if (Array.isArray(e.and)) return e.and.every((x) => matches(p, x as Expr));
    if (Array.isArray(e.filter)) return e.filter.every((x) => matches(p, x as Expr));
    if (Array.isArray(e.or)) return e.or.some((x) => matches(p, x as Expr));
    if (Array.isArray(e.not)) return !e.not.some((x) => matches(p, x as Expr));
    if (e.exact) {
      const x = e.exact as { field: string; value?: unknown; values?: unknown[]; language?: string; caseInsensitive?: boolean };
      const wanted = x.values ?? [x.value];
      const have = fieldValues(p, x.field, x.language);
      return have.some((h) => wanted.some((w) => (x.caseInsensitive ? String(h).toLowerCase() === String(w).toLowerCase() : h === w)));
    }
    if (e.fullText) {
      const x = e.fullText as { field: string; language?: string; value: string };
      const have = fieldValues(p, x.field, x.language).map((v) => String(v).toLowerCase());
      const terms = x.value.toLowerCase().split(/\s+/).filter(Boolean);
      return have.some((h) => terms.every((t) => h.includes(t)));
    }
    return true;
  }

  const minPrice = (p: FakeProduct, currency?: string): number =>
    Math.min(...allVariants(p).flatMap((v) => (v.prices ?? []).filter((x) => !currency || x.value.currencyCode === currency).map((x) => x.value.centAmount)), Infinity);
  const maxPrice = (p: FakeProduct, currency?: string): number =>
    Math.max(...allVariants(p).flatMap((v) => (v.prices ?? []).filter((x) => !currency || x.value.currencyCode === currency).map((x) => x.value.centAmount)), -Infinity);

  function search(body: Record<string, unknown>): unknown { // NOSONAR: in-memory test double, not deployed code
    let hits = state.products.filter((p) => (body.query ? matches(p, body.query as Expr) : true));

    const facets = ((body.facets as Array<{ distinct: { name: string; field: string; limit?: number } }>) ?? []).map(({ distinct }) => {
      const counts = new Map<string, number>();
      for (const p of hits) {
        for (const v of new Set(fieldValues(p, distinct.field).map(String))) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      return {
        name: distinct.name,
        buckets: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, distinct.limit ?? 10).map(([key, count]) => ({ key, count })),
      };
    });

    if (body.postFilter) hits = hits.filter((p) => matches(p, body.postFilter as Expr));

    const sort = ((body.sort as Array<Record<string, unknown>>) ?? [])[0];
    if (sort) {
      const dir = sort.order === 'desc' ? -1 : 1;
      const currency = ((sort.filter as { exact?: { value?: string } } | undefined)?.exact?.value) as string | undefined;
      const keyOf = (p: FakeProduct): string | number => {
        if (sort.field === 'createdAt') return p.createdAt;
        if (sort.field === 'name') return (p.name[sort.language as string] ?? '').toLowerCase();
        if (sort.field === 'variants.prices.centAmount') return sort.mode === 'max' ? maxPrice(p, currency) : minPrice(p, currency);
        return 0;
      };
      hits = [...hits].sort((a, b) => (keyOf(a) < keyOf(b) ? -dir : keyOf(a) > keyOf(b) ? dir : 0));
    }

    const offset = Number(body.offset ?? 0);
    const limit = Number(body.limit ?? 20);
    return {
      total: hits.length,
      offset,
      limit,
      results: hits.slice(offset, offset + limit).map((p) => ({ id: p.id })),
      ...(facets.length ? { facets } : {}),
    };
  }

  // ── Router ──────────────────────────────────────────────────────────────────────────
  function route(method: string, path: string, q: URLSearchParams, body: unknown): Response { // NOSONAR: in-memory test double, not deployed code
    // custom objects
    let m = path.match(/^\/custom-objects\/([^/]+)\/([^/]+)$/);
    if (m && method === 'GET') {
      const o = customObjects.get(objKey(m[1], m[2]));
      return o ? json(o) : err(404, 'not found');
    }
    if (m && method === 'DELETE') {
      const o = customObjects.get(objKey(m[1], m[2]));
      if (!o) return err(404, 'not found');
      customObjects.delete(objKey(m[1], m[2]));
      return json(o);
    }
    m = path.match(/^\/custom-objects(?:\/([^/]+))?$/);
    if (m && method === 'GET') {
      let rows = [...customObjects.values()].filter((o) => !m![1] || o.container === m![1]);
      const where = q.get('where');
      const ids = where?.match(/^id in \((.*)\)$/)?.[1];
      if (ids) {
        const wanted = new Set([...ids.matchAll(/"([^"]+)"/g)].map((x) => x[1]));
        rows = rows.filter((o) => wanted.has(o.id));
      }
      const offset = Number(q.get('offset') ?? 0);
      const limit = Number(q.get('limit') ?? 20);
      return json({ total: rows.length, offset, limit, count: Math.min(limit, rows.length - offset), results: rows.slice(offset, offset + limit) });
    }
    if (path === '/custom-objects' && method === 'POST') {
      const draft = body as { container: string; key: string; value: unknown; version?: number };
      const existing = customObjects.get(objKey(draft.container, draft.key));
      if (typeof draft.version === 'number' && existing && existing.version !== draft.version) {
        return err(409, `Object ${draft.container}/${draft.key} has a different version than expected.`);
      }
      return json(put(draft.container, draft.key, draft.value), existing ? 200 : 201);
    }

    // categories
    if (path === '/categories' && method === 'GET') {
      const offset = Number(q.get('offset') ?? 0);
      const limit = Number(q.get('limit') ?? 20);
      const rows = state.categories.map((c) => ({
        id: c.id,
        key: c.key,
        name: c.name,
        slug: c.slug,
        description: c.description,
        orderHint: c.orderHint,
        ...(c.parent ? { parent: { typeId: 'category', id: c.parent } } : {}),
        ...(c.image ? { assets: [{ sources: [{ uri: c.image }] }] } : {}),
      }));
      return json({ total: rows.length, offset, limit, results: rows.slice(offset, offset + limit) });
    }

    // product types, stores
    if (path === '/product-types' && method === 'GET') {
      const offset = Number(q.get('offset') ?? 0);
      const limit = Number(q.get('limit') ?? 20);
      return json({ total: state.productTypes.length, offset, limit, results: state.productTypes.slice(offset, offset + limit) });
    }
    m = path.match(/^\/stores\/key=(.+)$/);
    if (m && method === 'GET') {
      const s = state.stores.find((x) => x.key === decodeURIComponent(m![1]));
      return s ? json(s) : err(404, 'store not found');
    }

    // product projections + search
    if (path === '/product-projections' && method === 'GET') {
      const where = q.get('where');
      const ids = where?.match(/^id in \((.*)\)$/)?.[1];
      const wanted = ids ? new Set([...ids.matchAll(/"([^"]+)"/g)].map((x) => x[1])) : null;
      const rows = state.products.filter((p) => !wanted || wanted.has(p.id));
      return json({ total: rows.length, offset: 0, limit: Number(q.get('limit') ?? 20), results: rows.map((p) => projection(p, q)) });
    }
    if (path === '/products/search' && method === 'POST') return json(search((body ?? {}) as Record<string, unknown>));

    return err(404, `fake-ct: no route for ${method} ${path}`);
  }

  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.pathname === '/oauth/token') return json({ access_token: 'fake-token', expires_in: 3600, scope: 'x' });

    const prefix = `/${projectKey}`;
    if (!url.pathname.startsWith(prefix)) return err(404, `fake-ct: wrong project in ${url.pathname}`);
    const path = url.pathname.slice(prefix.length);
    const body = typeof init?.body === 'string' && init.body ? JSON.parse(init.body) : undefined;

    const query: Record<string, string[]> = {};
    for (const [k, v] of url.searchParams) (query[k] ??= []).push(v);
    calls.push({ method, path, query, ...(body === undefined ? {} : { body }) });

    const failureIndex = failures.findIndex((f) => (typeof f.match === 'string' ? path.includes(f.match) : f.match.test(path)));
    if (failureIndex >= 0) {
      const [f] = failures.splice(failureIndex, 1);
      return json(f.body ?? { message: 'injected failure' }, f.status);
    }
    return route(method, path, url.searchParams, body);
  }) as typeof fetch;

  return {
    fetch: fakeFetch,
    customObjects,
    get categories() {
      return state.categories;
    },
    get products() {
      return state.products;
    },
    get productTypes() {
      return state.productTypes;
    },
    get stores() {
      return state.stores;
    },
    calls,
    failNext: (match, status, body) => { failures.push({ match, status, body }); },
    put,
    get: (container, key) => customObjects.get(objKey(container, key))?.value,
  };
}
