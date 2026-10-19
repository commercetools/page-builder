import { describe, expect, it } from 'vitest';
import {
  appendVersion,
  buildCombined,
  copyDraftToPublished,
  draftHead,
  extractPayload,
  sourceHashOf,
  stripMeta,
} from './envelope.js';
import { MAX_VERSIONS } from '../contract.js';

const NOW = '2026-01-15T10:00:00.000Z';
const LATER = '2026-02-15T10:00:00.000Z';

type Payload = { sections: Array<{ id: string }> };
const payload = (...ids: string[]): Payload => ({
  sections: ids.map((id) => ({ id })),
});

describe('sourceHashOf', () => {
  it('is stable for the same content', () => {
    expect(sourceHashOf(payload('a'))).toBe(sourceHashOf(payload('a')));
  });

  it('ignores object key order', () => {
    expect(sourceHashOf({ a: 1, b: 2 })).toBe(sourceHashOf({ b: 2, a: 1 }));
  });

  it('is order-sensitive for arrays', () => {
    expect(sourceHashOf([1, 2])).not.toBe(sourceHashOf([2, 1]));
  });

  it('differs when content differs', () => {
    expect(sourceHashOf(payload('a'))).not.toBe(sourceHashOf(payload('b')));
  });

  it('handles primitives and null', () => {
    expect(sourceHashOf(null)).toEqual(expect.any(String));
    expect(sourceHashOf(1)).not.toBe(sourceHashOf('1'));
  });
});

describe('buildCombined', () => {
  it('starts a fresh object at draft version 1 with nothing published', () => {
    const combined = buildCombined(payload('a'), NOW);
    expect(combined.draft.currentVersion).toBe(1);
    expect(combined.draft.versions).toHaveLength(1);
    expect(combined.published).toBeNull();
  });

  it('stamps the version with its save time and content hash', () => {
    const [version] = buildCombined(payload('a'), NOW).draft.versions;
    expect(version).toMatchObject({
      appVersion: 1,
      savedAt: NOW,
      publishedAt: null,
      sourceHash: sourceHashOf(payload('a')),
    });
  });

  it('inlines the payload alongside the version meta', () => {
    const [version] = buildCombined(payload('a'), NOW).draft.versions;
    expect(version.sections).toEqual([{ id: 'a' }]);
  });
});

describe('draftHead', () => {
  it('returns the newest version', () => {
    const first = buildCombined(payload('a'), NOW);
    const { combined } = appendVersion(first, payload('b'), LATER);
    expect(draftHead(combined)?.appVersion).toBe(2);
  });

  it('returns nothing when there is no history', () => {
    const empty = buildCombined(payload('a'), NOW);
    empty.draft.versions = [];
    expect(draftHead(empty)).toBeNull();
  });
});

describe('appendVersion', () => {
  it('creates the object when there is nothing yet', () => {
    const { combined, changed } = appendVersion(null, payload('a'), NOW);
    expect(changed).toBe(true);
    expect(combined.draft.versions).toHaveLength(1);
  });

  it('appends a version when the content changed', () => {
    const first = buildCombined(payload('a'), NOW);
    const { combined, changed } = appendVersion(first, payload('b'), LATER);
    expect(changed).toBe(true);
    expect(combined.draft.versions).toHaveLength(2);
    expect(draftHead(combined)?.appVersion).toBe(2);
  });

  it('is a no-op when the content is byte-identical', () => {
    const first = buildCombined(payload('a'), NOW);
    const { combined, changed } = appendVersion(first, payload('a'), LATER);
    expect(changed).toBe(false);
    expect(combined).toBe(first);
  });

  it('treats reordered keys as unchanged', () => {
    const first = buildCombined({ a: 1, b: 2 }, NOW);
    expect(appendVersion(first, { b: 2, a: 1 }, LATER).changed).toBe(false);
  });

  it('leaves the published payload untouched — publishing is a separate step', () => {
    const published = copyDraftToPublished(buildCombined(payload('a'), NOW), NOW);
    const { combined } = appendVersion(published, payload('b'), LATER);
    expect(combined.published).toBe(published.published);
  });

  it('caps history at MAX_VERSIONS, dropping the oldest', () => {
    let combined = buildCombined(payload('v0'), NOW);
    for (let i = 1; i <= MAX_VERSIONS + 5; i++) {
      combined = appendVersion(combined, payload(`v${i}`), NOW).combined;
    }
    expect(combined.draft.versions).toHaveLength(MAX_VERSIONS);
    expect(draftHead(combined)?.appVersion).toBe(MAX_VERSIONS + 6);
  });

  it('points currentVersion at the head index, so download tooling can index it', () => {
    let combined = buildCombined(payload('v0'), NOW);
    for (let i = 1; i <= MAX_VERSIONS + 5; i++) {
      combined = appendVersion(combined, payload(`v${i}`), NOW).combined;
    }
    // 1-based index into the retained window, not the monotonic appVersion.
    expect(combined.draft.currentVersion).toBe(combined.draft.versions.length);
    expect(
      combined.draft.versions[combined.draft.currentVersion - 1]
    ).toBe(draftHead(combined));
  });
});

describe('copyDraftToPublished', () => {
  it('publishes the draft head', () => {
    const combined = copyDraftToPublished(buildCombined(payload('a'), NOW), LATER);
    expect(combined.published).toMatchObject({
      appVersion: 1,
      publishedAt: LATER,
      sections: [{ id: 'a' }],
    });
  });

  it('strips the version meta from the published payload', () => {
    const published = copyDraftToPublished(
      buildCombined(payload('a'), NOW),
      LATER
    ).published as Record<string, unknown>;
    expect(published.savedAt).toBeUndefined();
    expect(published.sourceHash).toBeUndefined();
  });

  it('stamps publishedAt on the draft version it published', () => {
    const combined = copyDraftToPublished(buildCombined(payload('a'), NOW), LATER);
    expect(draftHead(combined)?.publishedAt).toBe(LATER);
  });

  it('only stamps the head, leaving older versions alone', () => {
    const first = buildCombined(payload('a'), NOW);
    const { combined } = appendVersion(first, payload('b'), LATER);
    const published = copyDraftToPublished(combined, LATER);

    expect(published.draft.versions[0].publishedAt).toBeNull();
    expect(published.draft.versions[1].publishedAt).toBe(LATER);
  });

  it('restamps harmlessly when republishing unchanged content', () => {
    const once = copyDraftToPublished(buildCombined(payload('a'), NOW), NOW);
    const twice = copyDraftToPublished(once, LATER);
    expect(twice.published?.publishedAt).toBe(LATER);
  });

  it('refuses to publish an empty draft', () => {
    const empty = buildCombined(payload('a'), NOW);
    empty.draft.versions = [];
    expect(() => copyDraftToPublished(empty, NOW)).toThrow(/nothing to publish/);
  });
});

describe('extractPayload', () => {
  it('prefers the published payload', () => {
    const first = buildCombined(payload('published'), NOW);
    const published = copyDraftToPublished(first, NOW);
    const { combined } = appendVersion(published, payload('newer-draft'), LATER);

    expect(extractPayload(combined)).toEqual(payload('published'));
  });

  it('strips the published meta keys', () => {
    const combined = copyDraftToPublished(buildCombined(payload('a'), NOW), NOW);
    const out = extractPayload(combined) as Record<string, unknown>;
    expect(out.schemaVersion).toBeUndefined();
    expect(out.appVersion).toBeUndefined();
    expect(out.publishedAt).toBeUndefined();
  });

  it('falls back to the draft head when nothing is published', () => {
    expect(extractPayload(buildCombined(payload('a'), NOW))).toEqual(payload('a'));
  });

  it('returns nothing when there is neither', () => {
    const empty = buildCombined(payload('a'), NOW);
    empty.draft.versions = [];
    expect(extractPayload(empty)).toBeNull();
  });
});

describe('stripMeta', () => {
  it('leaves only the payload', () => {
    const [version] = buildCombined(payload('a'), NOW).draft.versions;
    expect(stripMeta(version)).toEqual(payload('a'));
  });
});
