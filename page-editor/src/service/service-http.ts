/** The parts of a service call that do not depend on how it travels: the URL, the body, the reply. */

import type { ServiceEndpoint } from './config';

export const serviceUrl = (
  config: Pick<ServiceEndpoint, 'origin' | 'basePath'>,
  path: string,
  query?: Record<string, string | number | undefined>
): URL => {
  const url = new URL(`${config.basePath}${path}`, config.origin);
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  return url;
};

/**
 * JSON for any body but `FormData`, which goes as it is with no content type of ours: the browser
 * writes the multipart boundary into the header itself.
 */
export const encodeBody = (
  body: unknown
): { body: BodyInit | undefined; headers: Record<string, string> } => {
  if (body === undefined || body instanceof FormData) {
    return { body: body as FormData | undefined, headers: {} };
  }
  return {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  };
};

/** The JSON of a reply; `undefined` for an empty or non-JSON one (a gateway's HTML error page). */
export const readJson = async (
  res: Pick<Response, 'text'>
): Promise<unknown> => {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
};
