import { describe, expect, it } from 'vitest';
import {
  BRIDGE_CHANNEL,
  BRIDGE_VERSION,
  CATALOG_CONTAINER,
  CATALOG_KEYS,
  CATALOG_SCHEMA_VERSION,
  COMPONENTS_CONTAINER,
  DRAFT_PAGE_CONTAINER,
  LEGACY_PAGE_CONTAINER,
  LOCALIZABLE_KINDS,
  MAX_VERSIONS,
  PAGE_SCHEMA_VERSION,
  PUBLISHED_PAGE_CONTAINER,
} from './contract.js';

describe('storage containers', () => {
  it('keeps draft, published and components in distinct containers', () => {
    const containers = [
      DRAFT_PAGE_CONTAINER,
      PUBLISHED_PAGE_CONTAINER,
      COMPONENTS_CONTAINER,
    ];
    expect(new Set(containers).size).toBe(3);
  });

  it('shares the catalog container with the legacy page container', () => {
    // Everything that is not a v3 page still lives in `page-editor`.
    expect(LEGACY_PAGE_CONTAINER).toBe(CATALOG_CONTAINER);
    expect(CATALOG_CONTAINER).toBe('page-editor');
  });

  it('names a key for each catalog', () => {
    expect(Object.values(CATALOG_KEYS).length).toBeGreaterThan(0);
    expect(new Set(Object.values(CATALOG_KEYS)).size).toBe(
      Object.values(CATALOG_KEYS).length
    );
  });
});

describe('schema versions', () => {
  it('pins pages at v3 — the draft/published/components split', () => {
    expect(PAGE_SCHEMA_VERSION).toBe(3);
  });

  it('pins catalogs at v2', () => {
    expect(CATALOG_SCHEMA_VERSION).toBe(2);
  });

  it('caps retained history', () => {
    expect(MAX_VERSIONS).toBe(50);
  });
});

describe('bridge protocol', () => {
  it('names a versioned channel both sides agree on', () => {
    expect(BRIDGE_CHANNEL).toBe('pb-visual-editing');
    expect(BRIDGE_VERSION).toBe(1);
  });
});

describe('LOCALIZABLE_KINDS', () => {
  it('covers the text-bearing kinds', () => {
    expect(LOCALIZABLE_KINDS).toContain('text');
    expect(LOCALIZABLE_KINDS).toContain('richtext');
  });

  it('excludes kinds with no text to translate', () => {
    for (const kind of ['boolean', 'number', 'product', 'group']) {
      expect(LOCALIZABLE_KINDS).not.toContain(kind);
    }
  });

  it('lists each kind once', () => {
    expect(new Set(LOCALIZABLE_KINDS).size).toBe(LOCALIZABLE_KINDS.length);
  });
});
