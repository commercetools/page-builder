/**
 * Browser-safe versioning envelope for a single component-instance object.
 *
 * Mirrors `packages/page-builder/src/catalog/envelope.ts` but does NOT hash with
 * `node:crypto` (that module can't run in the Merchant Center app). Idempotency is
 * decided by canonical-JSON string equality against the current draft head, so a page
 * save that didn't change a component appends no new version.
 */
import { canonicalize } from '../../components/page-builder/canonicalize';
import {
  MAX_VERSIONS,
  PAGE_SCHEMA_VERSION,
  type CombinedComponent,
  type ComponentAuthored,
  type ComponentDraftVersion,
} from '../../components/page-builder/types';

/** The latest (head) draft version, or null when there is no history. */
export const componentDraftHead = (
  c: CombinedComponent
): ComponentDraftVersion | null =>
  c.draft.versions.length
    ? c.draft.versions[c.draft.versions.length - 1]
    : null;

/** Strip the version meta, leaving just the authored payload. */
const authoredOf = (v: ComponentDraftVersion): ComponentAuthored => ({
  name: v.name,
  visibility: v.visibility,
  ...(v.style !== undefined ? { style: v.style } : {}),
  settings: v.settings,
});

const buildComponent = (
  componentId: string,
  type: string,
  pageId: string,
  payload: ComponentAuthored,
  now: string
): CombinedComponent => ({
  schemaVersion: PAGE_SCHEMA_VERSION,
  type,
  pageId,
  draft: {
    schemaVersion: PAGE_SCHEMA_VERSION,
    currentVersion: 1,
    componentId,
    versions: [{ appVersion: 1, savedAt: now, publishedAt: null, ...payload }],
  },
});

export type AppendComponentResult = {
  combined: CombinedComponent;
  /** false when the payload matched the current draft head (no write needed). */
  changed: boolean;
};

/**
 * Append a new draft version for `payload` unless it is structurally identical to the
 * current draft head (then it's a no-op). Bumps appVersion monotonically and caps history
 * at MAX_VERSIONS (drops oldest).
 */
export const appendComponentVersion = (
  existing: CombinedComponent | null,
  componentId: string,
  type: string,
  pageId: string,
  payload: ComponentAuthored,
  now: string
): AppendComponentResult => {
  if (!existing) {
    return {
      combined: buildComponent(componentId, type, pageId, payload, now),
      changed: true,
    };
  }
  const head = componentDraftHead(existing);
  if (head && canonicalize(authoredOf(head)) === canonicalize(payload)) {
    return { combined: existing, changed: false };
  }
  const nextAppVersion = (head?.appVersion ?? 0) + 1;
  const versions = [
    ...existing.draft.versions,
    { appVersion: nextAppVersion, savedAt: now, publishedAt: null, ...payload },
  ].slice(-MAX_VERSIONS);
  return {
    combined: {
      schemaVersion: PAGE_SCHEMA_VERSION,
      type: existing.type, // immutable
      pageId: existing.pageId, // immutable
      draft: {
        schemaVersion: PAGE_SCHEMA_VERSION,
        currentVersion: nextAppVersion,
        componentId,
        versions,
      },
    },
    changed: true,
  };
};
