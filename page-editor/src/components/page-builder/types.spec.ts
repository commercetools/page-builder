import {
  COMPONENTS_CONTAINER,
  DEFAULT_SECTIONS,
  DRAFT_PAGE_CONTAINER,
  LEGACY_PAGE_CONTAINER,
  MAX_VERSIONS,
  PAGE_SCHEMA_VERSION,
  PAGE_TYPES,
  PUBLISHED_PAGE_CONTAINER,
  componentKey,
  pageKey,
} from './types';

describe('custom-object keys', () => {
  it('prefixes a page key', () => {
    expect(pageKey('home')).toBe('page-home');
  });

  it('prefixes a component key', () => {
    expect(componentKey('abc-123')).toBe('component-abc-123');
  });

  it('produces keys CT accepts', () => {
    // CT custom-object keys allow [A-Za-z0-9_-] only.
    const valid = /^[A-Za-z0-9_-]+$/;
    expect(pageKey('spring-sale-2026')).toMatch(valid);
    expect(componentKey('9f8e7d6c-1234')).toMatch(valid);
  });
});

describe('containers', () => {
  it('keeps draft, published and components in separate containers', () => {
    const containers = [
      DRAFT_PAGE_CONTAINER,
      PUBLISHED_PAGE_CONTAINER,
      COMPONENTS_CONTAINER,
    ];
    expect(new Set(containers).size).toBe(3);
  });

  it('keeps the legacy container distinct from the v3 page containers', () => {
    expect(LEGACY_PAGE_CONTAINER).toBe('page-editor');
    expect(LEGACY_PAGE_CONTAINER).not.toBe(DRAFT_PAGE_CONTAINER);
    expect(LEGACY_PAGE_CONTAINER).not.toBe(PUBLISHED_PAGE_CONTAINER);
  });
});

describe('schema constants', () => {
  it('is on schema v3 — the draft/published/components split', () => {
    expect(PAGE_SCHEMA_VERSION).toBe(3);
  });

  it('caps retained versions', () => {
    expect(MAX_VERSIONS).toBeGreaterThan(0);
    expect(MAX_VERSIONS).toBe(50);
  });
});

describe('PAGE_TYPES', () => {
  it('offers each page type exactly once', () => {
    const ids = PAGE_TYPES.map((t) => t.id);
    expect(ids).toEqual(['all', 'static', 'category', 'pdp', 'dynamic']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every type a label and an icon', () => {
    for (const type of PAGE_TYPES) {
      expect(type.label.trim()).toBeTruthy();
      expect(type.icon.trim()).toBeTruthy();
    }
  });
});

describe('DEFAULT_SECTIONS', () => {
  it('renders head, main and footer in document order', () => {
    expect(DEFAULT_SECTIONS.map((s) => s.id)).toEqual([
      'HEAD',
      'MAIN',
      'FOOTER',
    ]);
  });

  it('shows every default section on all page types', () => {
    for (const section of DEFAULT_SECTIONS) {
      expect(section.pageTypes).toEqual(['all']);
    }
  });

  it('gives every default section a name, description and icon', () => {
    for (const section of DEFAULT_SECTIONS) {
      expect(section.name['en-US']?.trim()).toBeTruthy();
      expect(section.description['en-US']?.trim()).toBeTruthy();
      expect(section.icon.trim()).toBeTruthy();
    }
  });
});
