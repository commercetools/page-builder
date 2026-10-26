# The render contract (client-agnostic)

Supports steps 4, 6, 7 and 9. This is what any client, web or native, must speak. The authoritative sources, in this repository, are:

- `page-builder-service/openapi.yaml`: the HTTP surface, including the render response schema.
- `docs/sdd/canonical-shapes.md`: the shapes data arrives in, and the request context.
- `docs/sdd/definitions-contract.md`: the catalog (components, data sources, sections, theme).
- `docs/sdd/preview-contract.md`: preview flags and the visual-editing bridge.

## Request

One call per page view: `GET {service-url}/v1/render`.

| Input | Where | Meaning |
|---|---|---|
| `path` | query, required | The location as the page tree stores it (e.g. `/women/dresses`). The locale prefix is the client's concern |
| `locale`, `currency`, `country` | query, required | BCP-47, ISO 4217, ISO 3166-1; drive localization and price selection |
| `store` | query, optional | commercetools store key; scopes products and availability |
| `search` | query, optional | The client's raw query string, URL-encoded as one value, without `?`. Carries preview/edit flags, `facet.<name>`, `sort`, `offset` |
| `X-PB-Render-Key` | header | The render key |
| `X-PB-Origin` | header | The client's origin (a server-side call has no browser origin); must be on the service allowlist |
| `X-PB-Wire-Version` | header, required | Currently `1` |

Disable client-side HTTP caching for this call; the service caches commercetools reads for a few seconds.

## Response and outcome classification

| Result | Meaning | Client behavior |
|---|---|---|
| 200 with a render tree | A page | Draw it |
| 404 with code `page_not_found` | No page for this path | Show the client's real "not found" |
| 404 with any other code | Wrong service URL or path prefix | **Failure**; log it |
| 401 `invalid_render_key` | Key mismatch | Failure; log |
| 403 `origin_not_allowed` | Origin not on the allowlist | Failure; log |
| 426 | Service does not support the wire version; body lists supported versions | Failure; log "upgrade the client" |
| 5xx, timeout, network error, unparsable body | Service or network problem | Failure |

"No page" and "failure" must lead to different screens. A failure should degrade (keep navigation and frame, say the content is temporarily unavailable), not claim the page does not exist.

## The render tree

Top level: `wireVersion`, `preview`, `editMode`, `sections` (required); `pageId`, `theme`, `allowedOrigins`, `manifest` (optional). Sections contain a packed grid that the service has already localized and in which every data-source field is already resolved into a canonical shape. The client:

- lays the grid out on the contract's 12 columns with breakpoints at tablet (>= 768 px) and desktop (>= 1024 px) on web, and equivalent size classes on other platforms, honoring per-device hiding;
- applies `theme` (container width, gaps, section backgrounds);
- maps each component's type key to its own component.

## Preview and edit flags

Carried inside `search`, which the client forwards untouched:

| Flag | Meaning |
|---|---|
| `pb_preview=<token>` | Draft content, if the token equals the service's preview token. Otherwise ignored |
| `pb_page_id=<id>` | Read exactly that page rather than inferring one from the path |
| `pb_edit=1`, `pb_origin=<origin>` | Edit mode for the visual editor: the tree carries the allowed origins and a component manifest |

The client must never construct or expose these for shoppers.

## Visual editing (web only)

In edit mode the client emits identifying markers on its DOM and mounts a bridge that exchanges versioned `postMessage` messages with the Merchant Center frame. Native clients have no equivalent and support draft preview only.
