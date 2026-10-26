import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sampleCatalog } from '../testing/fixtures.js';
import { validateCatalog, validateCatalogDocument } from './catalog-validate.js';
import type { Catalog, SchemaField } from './types.js';

const clone = (): Catalog => structuredClone(sampleCatalog());
const errorsOf = (c: Catalog): string[] => validateCatalog(c).errors;

describe('validateCatalog', () => {
  it('accepts a valid catalog', () => {
    expect(validateCatalog(sampleCatalog())).toEqual({ errors: [], warnings: [] });
  });

  it('reports duplicate component types, data-source types and section ids', () => {
    const c = clone();
    c.components.components.push(c.components.components[0]!);
    c['data-sources'].sources.push(c['data-sources'].sources[0]!);
    c.sections.sections.push(c.sections.sections[0]!);
    expect(errorsOf(c)).toEqual(
      expect.arrayContaining([
        'duplicate component type "hero"',
        'duplicate data-source type "products-by-category"',
        'duplicate section id "hero-section"',
      ])
    );
  });

  it('reports undefined groups', () => {
    const c = clone();
    c.components.components[0]!.groupKey = 'nope';
    c['data-sources'].sources[0]!.groupKey = 'nope';
    expect(errorsOf(c)).toEqual(
      expect.arrayContaining([expect.stringContaining('not a defined component group'), expect.stringContaining('not a defined data-source group')])
    );
  });

  it('reports invalid page types on components and sections', () => {
    const c = clone();
    c.components.components[0]!.pageTypes = ['bogus' as never];
    c.sections.sections[0]!.pageTypes = ['bogus' as never];
    expect(errorsOf(c)).toEqual(
      expect.arrayContaining(['component "hero": invalid pageType "bogus"', 'section "hero-section": invalid pageType "bogus"'])
    );
  });

  it('reports unknown fill kinds', () => {
    const c = clone();
    c.components.components[0]!.fill = { kind: 'nope' as never };
    expect(errorsOf(c)).toContain('component "hero": unknown fill kind "nope"');
  });

  it('reports inlineTextFields that are not schema fields', () => {
    const c = clone();
    c.components.components[0]!.inlineTextFields = ['missing'];
    expect(errorsOf(c)).toContain('component "hero": inlineTextFields entry "missing" is not a schema field');
  });

  it('requires a known resolver on every data source', () => {
    const c = clone();
    delete c['data-sources'].sources[0]!.resolver;
    expect(errorsOf(c)).toEqual([expect.stringContaining('missing "resolver"')]);
    c['data-sources'].sources[0]!.resolver = { kind: 'sql' as never };
    expect(errorsOf(c)).toEqual([expect.stringContaining('unknown resolver kind "sql"')]);
  });

  describe('fields', () => {
    const withField = (field: SchemaField): Catalog => {
      const c = clone();
      c.components.components[0]!.schema = [field];
      c.components.components[0]!.inlineTextFields = [];
      return c;
    };

    it('rejects invalid kinds and a missing key', () => {
      expect(errorsOf(withField({ key: 'a', label: 'A', kind: 'blob' as never }))).toEqual([expect.stringContaining('invalid kind "blob"')]);
      expect(errorsOf(withField({ key: '', label: 'A', kind: 'text' }))).toEqual([expect.stringContaining('missing "key"')]);
    });

    it('allows localized only on text, richtext and select', () => {
      expect(errorsOf(withField({ key: 'n', label: 'N', kind: 'number', localized: true }))).toEqual([expect.stringContaining('"localized" is only valid on')]);
      expect(errorsOf(withField({ key: 't', label: 'T', kind: 'select', localized: true }))).toEqual([]);
    });

    it('rejects a dangling dataSourceType', () => {
      expect(errorsOf(withField({ key: 'd', label: 'D', kind: 'dataSource', dataSourceType: 'ghost' }))).toEqual([
        expect.stringContaining('dataSourceType "ghost" does not match'),
      ]);
    });

    it('rejects nested groups and warns on ignored children', () => {
      const inner: SchemaField = { key: 'inner', label: 'I', kind: 'group', children: [] };
      expect(errorsOf(withField({ key: 'outer', label: 'O', kind: 'group', children: [inner] }))).toEqual([
        expect.stringContaining('cannot be nested'),
      ]);
      const report = validateCatalog(withField({ key: 't', label: 'T', kind: 'text', children: [inner] }));
      expect(report.errors).toEqual([]);
      expect(report.warnings).toEqual([expect.stringContaining('"children" is ignored')]);
    });
  });
});

describe('validateCatalogDocument', () => {
  it('reports structural problems before referential ones', () => {
    const report = validateCatalogDocument({ components: {} });
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors.join('\n')).toMatch(/required property/);
  });

  it('rejects non-objects', () => {
    expect(validateCatalogDocument(null).errors.length).toBeGreaterThan(0);
  });

  it('runs the referential checks on a structurally valid document', () => {
    const c = clone();
    c.components.components[0]!.groupKey = 'nope';
    expect(validateCatalogDocument(c).errors).toEqual([expect.stringContaining('not a defined component group')]);
  });

  it('accepts a valid catalog', () => {
    expect(validateCatalogDocument(sampleCatalog()).errors).toEqual([]);
  });
});

describe('catalog.schema.json copy', () => {
  const hostSchema = new URL('../../../packages/page-builder/catalog.schema.json', import.meta.url);
  // Connect builds this app from its own directory, so the sibling package is absent there.
  it.skipIf(!existsSync(hostSchema))('matches the schema shipped in the host package', () => {
    const read = (u: URL) => JSON.parse(readFileSync(u, 'utf8'));
    expect(read(new URL('./catalog.schema.json', import.meta.url))).toEqual(read(hostSchema));
  });
});
