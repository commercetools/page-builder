/**
 * Page-editor preview / visual-editing request detection (server-only, framework-agnostic).
 *
 * The editor loads host pages in an iframe with `?pb_preview=<token>` (and, for editing,
 * `&pb_edit=1&pb_origin=<mcOrigin>`). When the token matches `PB_PREVIEW_TOKEN` the host
 * renders the *draft* layout and mounts the visual-editing bridge. Edit mode is gated on a
 * valid preview, so `pb_edit` alone can never switch a shopper into edit mode.
 */

export const PB_PREVIEW_PARAM = 'pb_preview';
export const PB_EDIT_PARAM = 'pb_edit';
export const PB_ORIGIN_PARAM = 'pb_origin';
export const PB_PAGE_ID_PARAM = 'pb_page_id';

/** The plain shape a framework hands you as its `searchParams` (Next's App Router prop, once awaited). */
export type RawSearchParams = Record<string, string | string[] | undefined> | undefined;

declare const REQUEST_SEARCH_PARAMS: unique symbol;

/**
 * A `RawSearchParams` proven to have come from the real request instead of a hand-built
 * stand-in. `resolvePageBuilderRoute` requires this branded type rather than a plain object:
 * structurally, `{}` (or any object literal) satisfies `RawSearchParams` just fine, which is
 * exactly how a route that forgets to thread the framework's real `searchParams` through went
 * undetected — `tsc --noEmit` passed, and preview/edit mode was silently always off. The only
 * way to produce this type is `readSearchParams`, so that omission is now a compile error.
 */
export type SearchParams =
  | (Record<string, string | string[] | undefined> & { readonly [REQUEST_SEARCH_PARAMS]: true })
  | undefined;

/** Wrap the framework's real `searchParams` (e.g. `await props.searchParams`) for `resolvePageBuilderRoute`. */
export function readSearchParams(raw: RawSearchParams): SearchParams {
  return raw as SearchParams;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** True when the request carries a valid `pb_preview` token (compared to `previewToken`). */
export function isPreviewRequest(searchParams: SearchParams, previewToken: string | undefined): boolean {
  if (!previewToken) return false;
  return firstValue(searchParams?.[PB_PREVIEW_PARAM]) === previewToken;
}

/** True when a valid preview request also asks for edit mode. */
export function isEditRequest(searchParams: SearchParams, previewToken: string | undefined): boolean {
  if (!isPreviewRequest(searchParams, previewToken)) return false;
  return firstValue(searchParams?.[PB_EDIT_PARAM]) === '1';
}

export function previewOrigin(searchParams: SearchParams): string | undefined {
  return firstValue(searchParams?.[PB_ORIGIN_PARAM]);
}

export function previewPageId(searchParams: SearchParams): string | undefined {
  return firstValue(searchParams?.[PB_PAGE_ID_PARAM]);
}
