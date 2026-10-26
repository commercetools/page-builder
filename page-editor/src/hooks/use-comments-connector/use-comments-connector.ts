/// <reference path="../../../@types-extensions/graphql-ctp/index.d.ts" />

import { type ApolloCache, type ApolloError } from '@apollo/client';
import { GRAPHQL_TARGETS } from '@commercetools-frontend/constants';
import { extractErrorFromGraphQlResponse } from '../../helpers';
import type {
  CommentAuthor,
  CommentsPayload,
  CommentTarget,
  CommentThread,
} from '../../components/page-builder/comments/types';
import {
  appendComment,
  deleteCommentInPayload,
  editCommentInPayload,
  emptyPayload,
  setThreadResolvedInPayload,
} from '../../components/page-builder/comments/operations';
import FetchQuery from './fetch-comments.ctp.graphql';
import UpsertMutation from './upsert-comments.ctp.graphql';
import {
  useCtClient,
  useCtMutation,
  useCtQuery,
} from '../../service/transport';

const CONTAINER = 'page-editor';
const commentsKey = (pageId: string) => `comments-${pageId}`;
const EMPTY_THREADS: CommentThread[] = [];

type RawCustomObject<T = unknown> = {
  id: string;
  key: string;
  container: string;
  version: number;
  value: T;
  lastModifiedAt: string;
};
type FetchResult<T = unknown> = { customObject?: RawCustomObject<T> | null };
type FetchVars = { container: string; key: string };
type UpsertResult<T = unknown> = {
  createOrUpdateCustomObject?: RawCustomObject<T> | null;
};
type UpsertVars = {
  draft: {
    container: string;
    key: string;
    value: string;
    version?: number | null;
  };
};

export type CommentsFetcherResult = {
  threads: CommentThread[];
  ctVersion: number | null;
  loading: boolean;
  error?: ApolloError;
  refetch: () => void;
};

/**
 * Reads all comment threads for a page. Pass a `pollInterval` (ms) to keep a
 * drawer/modal fresh while open — there is no websocket, so freshness is poll
 * based. One instance in page-builder.tsx feeds the dialog, drawer, and badge.
 */
export const useCommentsFetcher = (
  pageId: string,
  opts?: { pollInterval?: number }
): CommentsFetcherResult => {
  const { data, error, loading, refetch } = useCtQuery<
    FetchResult<CommentsPayload>,
    FetchVars
  >('comments', FetchQuery, {
    variables: { container: CONTAINER, key: commentsKey(pageId) },
    context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
    fetchPolicy: 'cache-and-network',
    pollInterval: opts?.pollInterval,
  });

  return {
    threads: data?.customObject?.value?.threads ?? EMPTY_THREADS,
    ctVersion: data?.customObject?.version ?? null,
    loading,
    error,
    refetch: () => {
      void refetch();
    },
  };
};

/**
 * Mutating ops. Each is a read-modify-write: it fetches the freshest object,
 * applies an id-scoped patch, and upserts with the current CT `version`. On a
 * version conflict it re-reads and re-applies (bounded retries), so concurrent
 * commenters merge without clobbering each other.
 */
export const useCommentsUpdater = (pageId: string) => {
  const client = useCtClient('comments');
  const [upsert, { loading }] = useCtMutation<UpsertResult, UpsertVars>(
    'comments',
    UpsertMutation
  );
  const key = commentsKey(pageId);

  const readLatest = async (): Promise<{
    payload: CommentsPayload;
    ctVersion: number | null;
  }> => {
    const { data } = await client.query<
      FetchResult<CommentsPayload>,
      FetchVars
    >({
      query: FetchQuery,
      variables: { container: CONTAINER, key },
      context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
      fetchPolicy: 'network-only',
    });
    const co = data?.customObject ?? null;
    return {
      payload: co?.value ?? emptyPayload(pageId),
      ctVersion: co?.version ?? null,
    };
  };

  const write = (payload: CommentsPayload, ctVersion: number | null) =>
    upsert({
      context: { target: GRAPHQL_TARGETS.COMMERCETOOLS_PLATFORM },
      variables: {
        draft: {
          container: CONTAINER,
          key,
          value: JSON.stringify(payload),
          ...(ctVersion !== null ? { version: ctVersion } : {}),
        },
      },
      update: (
        cache: ApolloCache<unknown>,
        { data }: { data?: UpsertResult<CommentsPayload> | null }
      ) => {
        const obj = data?.createOrUpdateCustomObject;
        if (!obj) return;
        cache.writeQuery<FetchResult<CommentsPayload>, FetchVars>({
          query: FetchQuery,
          variables: { container: CONTAINER, key },
          data: { customObject: obj },
        });
      },
    });

  const mutateWithRetry = async (
    apply: (p: CommentsPayload) => CommentsPayload,
    attempts = 3
  ): Promise<void> => {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      const { payload, ctVersion } = await readLatest();
      try {
        await write(apply(payload), ctVersion);
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    throw extractErrorFromGraphQlResponse(lastErr);
  };

  return {
    loading,
    addComment: (target: CommentTarget, body: string, author: CommentAuthor) =>
      mutateWithRetry((p) => appendComment(p, target, body, author)),
    editComment: (threadId: string, commentId: string, body: string) =>
      mutateWithRetry((p) =>
        editCommentInPayload(p, threadId, commentId, body)
      ),
    deleteComment: (threadId: string, commentId: string) =>
      mutateWithRetry((p) => deleteCommentInPayload(p, threadId, commentId)),
    resolveThread: (threadId: string, resolved: boolean) =>
      mutateWithRetry((p) => setThreadResolvedInPayload(p, threadId, resolved)),
  };
};

export type CommentsUpdater = ReturnType<typeof useCommentsUpdater>;
