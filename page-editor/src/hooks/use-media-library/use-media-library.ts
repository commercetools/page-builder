import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isMediaNotConfigured,
  toMediaFailure,
  type MediaFailure,
  type MediaFile,
  type MediaKind,
} from '../../service/media';
import { useMediaClient } from '../../service/use-media-client';

export type MediaLibrary = {
  files: MediaFile[];
  /** The first page is on its way. */
  loading: boolean;
  /** A further page is on its way. */
  loadingMore: boolean;
  hasMore: boolean;
  /** The service is reachable but has no media bucket: not an error, a set-up step. */
  notConfigured: boolean;
  error: MediaFailure | null;
  loadMore: () => void;
};

type State = Omit<MediaLibrary, 'loadMore'> & { nextCursor: string | null };

const EMPTY: State = {
  files: [],
  loading: false,
  loadingMore: false,
  hasMore: false,
  nextCursor: null,
  notConfigured: false,
  error: null,
};

/**
 * The uploaded media of one kind, newest first, a page at a time. Nothing is fetched until
 * `enabled` (the picker is open), and it starts over each time that turns on or the kind changes.
 */
export function useMediaLibrary(
  kind: MediaKind,
  enabled: boolean
): MediaLibrary {
  const client = useMediaClient();
  const [state, setState] = useState<State>(EMPTY);
  // Only the latest request may write: a slow page for a closed picker must not land in the next one.
  const latest = useRef(0);

  const fetchPage = useCallback(
    async (cursor?: string) => {
      if (!client) return;
      const id = ++latest.current;
      setState((s) => ({
        ...s,
        loading: !cursor,
        loadingMore: !!cursor,
        error: null,
      }));
      try {
        const page = await client.list(kind, { cursor });
        if (id !== latest.current) return;
        setState((s) => ({
          ...EMPTY,
          files: cursor ? [...s.files, ...page.files] : page.files,
          nextCursor: page.nextCursor,
          hasMore: page.nextCursor !== null,
        }));
      } catch (err) {
        if (id !== latest.current) return;
        setState((s) => ({
          ...s,
          loading: false,
          loadingMore: false,
          notConfigured: isMediaNotConfigured(err),
          error: isMediaNotConfigured(err) ? null : toMediaFailure(err),
        }));
      }
    },
    [client, kind]
  );

  const invalidate = useCallback(() => {
    latest.current++;
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    void fetchPage();
    return () => {
      invalidate();
      setState(EMPTY);
    };
  }, [enabled, fetchPage, invalidate]);

  const { nextCursor } = state;
  const loadMore = useCallback(() => {
    if (nextCursor) void fetchPage(nextCursor);
  }, [fetchPage, nextCursor]);

  return {
    files: state.files,
    loading: state.loading,
    loadingMore: state.loadingMore,
    hasMore: state.hasMore,
    notConfigured: state.notConfigured,
    error: state.error,
    loadMore,
  };
}
