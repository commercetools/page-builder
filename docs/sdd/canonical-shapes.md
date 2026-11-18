# SDD — Canonical resolved-data shapes, request context, and theme tokens

> **Status: Implemented** by `page-builder-service` (`src/commerce/shapes.ts`, `src/resolve/`). The
> render wire format is `page-builder-service/openapi.yaml`; these are the shapes inside the
> resolved `data`. Any incompatible change increments the wire version.

Derived from what real PDP/PLP components consume (an audit of an earlier host), but **not** shaped around any
one host. The service resolves commercetools data into these shapes; hosts' components only read
them.

## 1. Request context

Sent by the shim on every render call. The service uses it for price selection, localization and
store scoping.

```ts
type RenderContext = {
  locale: string;     // BCP-47, e.g. "en-US"; falls back to the project default
  store?: string;     // CT store key; scopes product selection/availability
  currency: string;   // ISO 4217, e.g. "USD"; price selection
  country: string;    // ISO 3166-1 alpha-2; price selection
};
```

Route params (`sku`, category slug) are **not** supplied by the host: the service derives them from
the request path via the page tree (see `page-builder-service`, "Render by request path").

## 2. Shapes

All strings are already localized to `locale`. Money is integer minor units.

```ts
type Money = { centAmount: number; currencyCode: string };

type Price = Money & {
  discounted?: Money & { discountName?: string };
  recurrencePolicyId?: string;
};

type Image = { url: string; alt?: string };

type ProductCard = {
  id: string;
  key?: string;
  sku: string;               // the displayed variant's sku
  name: string;
  slug: string;
  image?: Image;
  price?: Price;
  inStock?: boolean;
  rating?: RatingSummary | null;
};

type RatingSummary = {
  average: number;
  count: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
};

type Variant = {
  sku: string;
  images: Image[];
  price?: Price;
  attributes: Array<{ name: string; label?: string; value: string | number | boolean | null }>;
  inStock?: boolean;
};

type ProductDetail = ProductCard & {
  description?: string;
  variants: Variant[];       // index 0 = master
  categoryIds: string[];
  breadcrumb: Breadcrumb;    // primary category trail
  recurrencePolicyIds: string[];
  meta?: { title?: string; description?: string; keywords?: string };
};

type CategoryNode = {
  id: string;
  key?: string;
  slug: string;
  name: string;
  description?: string;
  image?: Image;             // banner/hero from the category's CT assets/images
  parentId?: string;
  children?: CategoryNode[];
};

type Breadcrumb = Array<{ name: string; slug: string }>;

type FacetBucket = { key: string; label?: string; count: number };
type Facet = {
  name: string;              // attribute name (filter key)
  label?: string;            // attribute label, localized
  buckets: FacetBucket[];
};

type SortOption = {
  key: 'relevance' | 'newest' | 'price-asc' | 'price-desc' | 'name'; // value of the `sort` search param
  field: string;
  order: 'asc' | 'desc';
  label?: string;
};

type SearchResult = {
  products: ProductCard[];
  total: number;
  offset: number;
  limit: number;
  facets: Facet[];
  sort: SortOption;
  availableSorts: SortOption[];
};
```

## 3. Resolver kinds (v1)

Referenced from the catalog by `resolver.kind` (data sources) or `fill.kind` (system component
types). The config of a saved data-source instance, or the route context, supplies the parameters.

| Kind | Params | Resolves to |
|---|---|---|
| `product` | product key or sku | `ProductDetail` |
| `product-list` | `source` (`new`/`bestsellers`/`sale`), `count` | `ProductCard[]` |
| `products-by-category` | category (config or route), `limit`, `sort` | `SearchResult` |
| `product-picks` / `product-pins` | product keys | `ProductCard[]` |
| `category` | category key/id, or route | `CategoryNode` |
| `category-picks` / `category-pins` | category keys | `CategoryNode[]` |
| `category-list` | `where` (`parent is not defined` = top level), `categoryPins`, `limit` | `CategoryNode[]` |
| `related-products` | route sku, `limit` | `ProductCard[]` (products sharing a category with the route product, excluding it) |
| `category-tree` | `depth` | `CategoryNode[]` |

System-component `fill` kinds (route-driven; params come from the path and search params):

| `fill.kind` | Slices | Source |
|---|---|---|
| `product-detail` | `product`, `price`, `gallery`, `variants`, `attributes`, `description`, `rating`, `breadcrumb`, `related` | the sku in the route |
| `category-listing` | `category`, `breadcrumb`, `facets`, `sort`, `pagination`, `subcategories`, `products` | the category in the route + `facet.*`, `sort`, `offset` search params |

Each distinct upstream query runs at most once per render; slices are cut from the one result.

### Slice keys (`fill.slice`)

Each slice is a small object spread into the component's `data`. An unknown or omitted slice
returns the whole result (`product`, or `category` + `breadcrumb` + the `SearchResult` fields).

| `fill.kind` | `slice` | `data` receives |
|---|---|---|
| `product-detail` | `product` (default) | `{ product: ProductDetail }` |
| | `price` | `{ price: Price \| null, sku }` |
| | `gallery` | `{ images: Image[], sku }` — the product image, then every variant's, de-duplicated |
| | `variants` | `{ variants: Variant[], sku }` |
| | `attributes` | `{ attributes: Variant['attributes'], sku }` — the master variant's |
| | `description` | `{ description: string }` |
| | `rating` | `{ rating: RatingSummary \| null }` |
| | `breadcrumb` | `{ breadcrumb: Breadcrumb, name }` — also what a title component needs |
| | `related` | `{ related: ProductCard[] }` |
| `category-listing` | `category` | `{ category: CategoryNode }` |
| | `breadcrumb` | `{ breadcrumb: Breadcrumb }` |
| | `facets` | `{ facets: Facet[] }` |
| | `sort` | `{ sort: SortOption, availableSorts: SortOption[] }` |
| | `pagination` | `{ total, offset, limit }` |
| | `subcategories` | `{ subcategories: CategoryNode[] }` |
| | `products` | `{ products: ProductCard[] }` |

A route that matches no product or category yields an empty slice (`{}`), not an error.

### Listing URL parameters

The listing reads these from the request's query string (the host forwards it to the shim):

| Parameter | Meaning |
|---|---|
| `sort` | one of `relevance`, `newest`, `price-asc`, `price-desc`, `name` (anything else is ignored) |
| `offset` | zero-based result offset |
| `facet.<name>` | selected bucket keys for the facet `<name>`, comma separated (`facet.color=red,blue`); repeated parameters accumulate |

## 4. Theme tokens (catalog `theme`)

Replaces the host `sectionBg` callback and Tailwind classes. All values are plain CSS values; the
shim turns them into scoped CSS custom properties.

```ts
type Theme = {
  // keyed by the section background name an author picks; unknown names render with no background
  sectionBackgrounds?: Record<string, { background: string; color?: string }>;
  containerMaxWidth?: string;          // CSS length, default "80rem"
  containerPaddingX?: string;          // CSS length, default "1rem"
  gap?: { row?: string; column?: string }; // grid gaps, default "1.5rem"
};
```

Section background keys keep the existing vocabulary (`Dark`, `Slate`, `Blue`, `Charcoal`, `Sage`)
as defaults the editor offers, but any key present in `sectionBackgrounds` is selectable.

## 5. Open points

- Whether `ProductDetail.variants[].attributes` needs typed values beyond scalars (enums, money).
- Facet filter parameter naming is `facet.<name>=a,b` (implemented); revisit only if a host's URL scheme cannot carry it.
- Review list (individual reviews) is out of v1; only the aggregate `RatingSummary` is included.
