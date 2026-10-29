/**
 * What to call an uploaded file on screen. The service stores each file as
 * `{13-digit sort stamp}-{8-hex id}-{original name}.{ext}`; the first two parts exist to order and
 * de-duplicate the bucket, and mean nothing to an editor, so they are dropped. Anything that does
 * not look like that (a URL pasted into an older page, say) keeps its last path segment as it is.
 */

const STORED_PREFIX = /^\d{13}-[0-9a-f]{8}-/;

const decode = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

export const displayNameOfFile = (name: string): string =>
  name.replace(STORED_PREFIX, '') || name;

/** The display name for a URL; an empty string when it has no file name (a bare origin, or a `data:` URL). */
export function displayNameOfUrl(url: string): string {
  if (!url || url.startsWith('data:')) return '';
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    // Not absolute (a site-relative path): drop the query and fragment by hand.
    path = url.split(/[?#]/)[0] ?? '';
  }
  const segment = path.split('/').filter(Boolean).pop();
  return segment ? displayNameOfFile(decode(segment)) : '';
}
