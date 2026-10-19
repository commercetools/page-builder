import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCatalogBundle } from './input.js';
import { buildComponentType, buildDataSourceType, buildSection } from '../test-utils/factories.js';

// Real files in a temp dir rather than a mocked fs: the loader's whole job is
// filesystem shape detection (file vs directory, which files are present).
let dir: string;
let cwd: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-catalog-'));
  cwd = process.cwd();
});

afterEach(() => {
  process.chdir(cwd);
  fs.rmSync(dir, { recursive: true, force: true });
});

const write = (name: string, value: unknown) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(value));
  return file;
};

const components = () => ({
  groups: [{ key: 'content', name: 'Content' }],
  components: [buildComponentType()],
});
const dataSources = () => ({
  groups: [{ key: 'commerce', name: 'Commerce' }],
  sources: [buildDataSourceType()],
});
const sections = () => ({ sections: [buildSection()] });

describe('loadCatalogBundle from a single file', () => {
  it('reads a full bundle', () => {
    const file = write('catalog.json', {
      components: components(),
      'data-sources': dataSources(),
      sections: sections(),
    });

    const bundle = loadCatalogBundle(file);
    expect(bundle.components.components).toHaveLength(1);
    expect(bundle['data-sources'].sources).toHaveLength(1);
    expect(bundle.sections.sections).toHaveLength(1);
  });

  it('fills in the catalogs a partial bundle omits', () => {
    const file = write('catalog.json', { components: components() });

    const bundle = loadCatalogBundle(file);
    expect(bundle.components.components).toHaveLength(1);
    expect(bundle['data-sources']).toEqual({ groups: [], sources: [] });
    expect(bundle.sections).toEqual({ sections: [] });
  });

  it('returns an empty bundle for an empty object', () => {
    const file = write('catalog.json', {});
    expect(loadCatalogBundle(file)).toEqual({
      components: { groups: [], components: [] },
      'data-sources': { groups: [], sources: [] },
      sections: { sections: [] },
    });
  });

  it('throws on malformed JSON rather than silently syncing nothing', () => {
    const file = path.join(dir, 'broken.json');
    fs.writeFileSync(file, '{ not json');
    expect(() => loadCatalogBundle(file)).toThrow();
  });
});

describe('loadCatalogBundle from a directory', () => {
  it('reads all three files', () => {
    write('components.json', components());
    write('data-sources.json', dataSources());
    write('sections.json', sections());

    const bundle = loadCatalogBundle(dir);
    expect(bundle.components.components).toHaveLength(1);
    expect(bundle['data-sources'].sources).toHaveLength(1);
    expect(bundle.sections.sections).toHaveLength(1);
  });

  it('leaves a catalog empty when its file is absent', () => {
    write('components.json', components());

    const bundle = loadCatalogBundle(dir);
    expect(bundle.components.components).toHaveLength(1);
    expect(bundle['data-sources']).toEqual({ groups: [], sources: [] });
  });

  it('returns an empty bundle for a directory with none of them', () => {
    write('unrelated.json', { a: 1 });
    expect(loadCatalogBundle(dir).components.components).toEqual([]);
  });
});

describe('loadCatalogBundle path handling', () => {
  it('resolves a relative path against the working directory', () => {
    write('catalog.json', { components: components() });
    process.chdir(dir);
    expect(loadCatalogBundle('catalog.json').components.components).toHaveLength(1);
  });

  it('names the resolved path when the input does not exist', () => {
    expect(() => loadCatalogBundle(path.join(dir, 'missing.json'))).toThrow(
      /--input not found/
    );
  });
});
