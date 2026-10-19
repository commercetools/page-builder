import { describe, expect, it, vi } from 'vitest';
import {
  buildBlockResolvers,
  buildCatalog,
  buildManifest,
  defineBlock,
  defineDataSource,
  definedBlockTypes,
} from './registry.js';
import type { BlockDefinition } from './registry.js';
import {
  buildComponentType,
  buildDataSourceType,
  localized,
} from './test-utils/factories.js';

const block = (over: Partial<BlockDefinition> = {}): BlockDefinition => ({
  ...buildComponentType(),
  ...over,
});

describe('defineBlock / defineDataSource', () => {
  it('return the definition unchanged — they exist for type inference', () => {
    const def = block();
    expect(defineBlock(def)).toBe(def);

    const ds = buildDataSourceType();
    expect(defineDataSource(ds)).toBe(ds);
  });
});

describe('buildCatalog', () => {
  const input = () => ({
    blocks: [block({ type: 'content/hero' })],
    componentGroups: [{ key: 'content', name: 'Content' }],
    dataSources: [buildDataSourceType()],
    dataSourceGroups: [{ key: 'commerce', name: 'Commerce' }],
    sections: [
      {
        id: 'MAIN',
        name: localized('Main'),
        description: localized('Primary'),
        icon: 'ViewAgenda',
        pageTypes: ['all' as const],
      },
    ],
  });

  it('assembles all three catalogs', () => {
    const catalog = buildCatalog(input());
    expect(Object.keys(catalog).sort()).toEqual([
      'components',
      'data-sources',
      'sections',
    ]);
  });

  it('strips host-only metadata that cannot be serialized into CT', () => {
    const catalog = buildCatalog({
      ...input(),
      blocks: [
        block({
          type: 'content/hero',
          inlineTextFields: ['title'],
          resolve: async () => ({}),
        }),
      ],
    });

    const component = catalog.components.components[0];
    expect(component).not.toHaveProperty('inlineTextFields');
    expect(component).not.toHaveProperty('resolve');
    expect(component.type).toBe('content/hero');
  });

  it('carries the group lists through', () => {
    const catalog = buildCatalog(input());
    expect(catalog.components.groups).toEqual([{ key: 'content', name: 'Content' }]);
    expect(catalog['data-sources'].groups).toEqual([
      { key: 'commerce', name: 'Commerce' },
    ]);
  });

  it('handles an entirely empty catalog', () => {
    const catalog = buildCatalog({
      blocks: [],
      componentGroups: [],
      dataSources: [],
      dataSourceGroups: [],
      sections: [],
    });
    expect(catalog.components.components).toEqual([]);
    expect(catalog.sections.sections).toEqual([]);
  });
});

describe('buildManifest', () => {
  it('advertises every block type to the builder', () => {
    const manifest = buildManifest([
      block({ type: 'a' }),
      block({ type: 'b' }),
    ]);
    expect(manifest.map((m) => m.type)).toEqual(['a', 'b']);
  });

  it('advertises the inline-editable fields a block declares', () => {
    const [entry] = buildManifest([
      block({ type: 'a', inlineTextFields: ['title', 'subtitle'] }),
    ]);
    expect(entry.inlineTextFields).toEqual(['title', 'subtitle']);
  });

  it('reports an empty list rather than undefined for a block with none', () => {
    const [entry] = buildManifest([block({ type: 'a' })]);
    expect(entry.inlineTextFields).toEqual([]);
  });

  it('handles an empty block list', () => {
    expect(buildManifest([])).toEqual([]);
  });
});

describe('definedBlockTypes', () => {
  it('lists every declared type, so a render registry can be cross-checked', () => {
    expect(definedBlockTypes([block({ type: 'a' }), block({ type: 'b' })])).toEqual([
      'a',
      'b',
    ]);
  });

  it('handles an empty list', () => {
    expect(definedBlockTypes([])).toEqual([]);
  });
});

describe('buildBlockResolvers', () => {
  it('keys each block resolver by its type', async () => {
    const resolve = vi.fn(async () => ({ products: [] }));
    const map = buildBlockResolvers([block({ type: 'commerce/grid', resolve })]);

    expect(Object.keys(map)).toEqual(['commerce/grid']);
    await map['commerce/grid']!({}, { locale: 'en-US' });
    expect(resolve).toHaveBeenCalled();
  });

  it('omits blocks that declare no resolver', () => {
    expect(
      buildBlockResolvers([
        block({ type: 'content/hero' }),
        block({ type: 'commerce/grid', resolve: async () => ({}) }),
      ])
    ).toEqual({ 'commerce/grid': expect.any(Function) });
  });

  it('returns an empty map for an empty list', () => {
    expect(buildBlockResolvers([])).toEqual({});
  });
});
