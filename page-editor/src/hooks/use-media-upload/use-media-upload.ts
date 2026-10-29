import { useCallback, useState } from 'react';
import {
  toMediaFailure,
  type MediaFailure,
  type MediaFile,
} from '../../service/media';
import { useMediaClient } from '../../service/use-media-client';

export type MediaUpload = {
  /** Resolves with the stored file, or `null` after setting `error`. Never rejects. */
  upload: (file: File) => Promise<MediaFile | null>;
  uploading: boolean;
  error: MediaFailure | null;
  clearError: () => void;
};

/** Uploads one file to the page-builder service's media bucket. */
export function useMediaUpload(): MediaUpload {
  const client = useMediaClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<MediaFailure | null>(null);

  const upload = useCallback(
    async (file: File) => {
      if (!client) return null;
      setUploading(true);
      setError(null);
      try {
        return await client.upload(file);
      } catch (err) {
        setError(toMediaFailure(err));
        return null;
      } finally {
        setUploading(false);
      }
    },
    [client]
  );

  const clearError = useCallback(() => setError(null), []);
  return { upload, uploading, error, clearError };
}
