/** A media failure the route renders as `{ error: { code, message } }` with `status`. */

export type MediaErrorCode =
  | 'media_not_configured'
  | 'file_required'
  | 'invalid_upload'
  | 'file_too_large'
  | 'type_not_allowed'
  | 'type_mismatch'
  | 'invalid_cursor'
  | 'storage_unavailable';

export class MediaError extends Error {
  constructor(
    readonly status: number,
    readonly code: MediaErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'MediaError';
  }
}
