import { describe, expect, it } from 'vitest';
import { validateBundle } from './validate.js';
import type { CatalogBundle } from '../contract.js';
import {
  buildComponentType,
  buildDataSourceType,
  buildSchemaField,
  buildSection,
} from '../test-utils/factories.js';

const bundle = (over: Partial<CatalogBundle> = {}): CatalogBundle =>
  ({
    components: {
      groups: [{ key: 'content', name: 'Content' }],
      components: [buildComponentType()],
    },
    'data-sources': {
      groups: [{ key: 'commerce', name: 'Commerce' }],
      sources: [buildDataSourceType()],
    },
    sections: { sections: [buildSection()] },
    ...over,
  }) as CatalogBundle;

const errorsOf = (b: CatalogBundle) => validateBundle(b).errors;

describe('a well-formed bundle', () => {
  it('reports nothing', () => {
    expect(validateBundle(bundle())).toEqual({ errors: [], warnings: [] });
  });

  it('accepts an entirely empty bundle', () => {
    expect(
      validateBundle(
        bundle({
          components: { groups: [], components: [] },
          'data-sources': { groups: [], sources: [] },
          sections: { sections: [] },
        })
      )
    ).toEqual({ errors: [], warnings: [] });
  });
});

describe('type-key uniqueness', () => {
  it('rejects a duplicate component type', () => {
    const errors = errorsOf(
      bundle({
        components: {
          groups: [{ key: 'content', name: 'Content' }],
          components: [buildComponentType(), buildComponentType()],
        },
      })
    );
    expect(errors).toContainEqual(expect.stringContaining('duplicate component type'));
  });

  it('rejects a duplicate data-source type', () => {
    const errors = errorsOf(
      bundle({
        'data-sources': {
          groups: [{ key: 'commerce', name: 'Commerce' }],
          sources: [buildDataSourceType(), buildDataSourceType()],
        },
      })
    );
    expect(errors).toContainEqual(expect.stringContaining('duplicate data-source type'));
  });

  it('rejects a duplicate section id', () => {
    const errors = errorsOf(
      bundle({ sections: { sections: [buildSection(), buildSection()] } })
    );
    expect(errors).toContainEqual(expect.stringContaining('duplicate section id'));
  });
});

describe('group references', () => {
  it('rejects a component pointing at an undefined group', () => {
    const errors = errorsOf(
      bundle({
        components: {
          groups: [{ key: 'content', name: 'Content' }],
          components: [buildComponentType({ groupKey: 'nope' })],
        },
      })
    );
    expect(errors).toContainEqual(
      expect.stringContaining('groupKey "nope" is not a defined component group')
    );
  });

  it('rejects a data source pointing at an undefined group', () => {
    const errors = errorsOf(
      bundle({
        'data-sources': {
          groups: [{ key: 'commerce', name: 'Commerce' }],
          sources: [buildDataSourceType({ groupKey: 'nope' })],
        },
      })
    );
    expect(errors).toContainEqual(
      expect.stringContaining('groupKey "nope" is not a defined data-source group')
    );
  });
});

describe('page types', () => {
  it('accepts every valid page type', () => {
    const errors = errorsOf(
      bundle({
        components: {
          groups: [{ key: 'content', name: 'Content' }],
          components: [
            buildComponentType({
              pageTypes: ['all', 'static', 'category', 'pdp', 'dynamic'],
            }),
          ],
        },
      })
    );
    expect(errors).toEqual([]);
  });

  it('rejects an unknown page type on a component', () => {
    const errors = errorsOf(
      bundle({
        components: {
          groups: [{ key: 'content', name: 'Content' }],
          components: [buildComponentType({ pageTypes: ['bogus' as never] })],
        },
      })
    );
    expect(errors).toContainEqual(expect.stringContaining('invalid pageType "bogus"'));
  });

  it('rejects an unknown page type on a section', () => {
    const errors = errorsOf(
      bundle({
        sections: { sections: [buildSection({ pageTypes: ['bogus' as never] })] },
      })
    );
    expect(errors).toContainEqual(expect.stringContaining('invalid pageType "bogus"'));
  });
});

describe('schema fields', () => {
  const withSchema = (...schema: ReturnType<typeof buildSchemaField>[]) =>
    bundle({
      components: {
        groups: [{ key: 'content', name: 'Content' }],
        components: [buildComponentType({ schema })],
      },
    });

  it('rejects a field with no key', () => {
    expect(errorsOf(withSchema(buildSchemaField({ key: '' })))).toContainEqual(
      expect.stringContaining('missing "key"')
    );
  });

  it('rejects an unknown field kind', () => {
    expect(
      errorsOf(withSchema(buildSchemaField({ kind: 'bogus' as never })))
    ).toContainEqual(expect.stringContaining('invalid kind "bogus"'));
  });

  it('rejects localized on a kind that cannot be localized', () => {
    expect(
      errorsOf(withSchema(buildSchemaField({ kind: 'boolean', localized: true })))
    ).toContainEqual(expect.stringContaining('"localized" is only valid on'));
  });

  it('accepts localized on a text field', () => {
    expect(
      errorsOf(withSchema(buildSchemaField({ kind: 'text', localized: true })))
    ).toEqual([]);
  });

  it('rejects a dataSource field pointing at an unknown type', () => {
    expect(
      errorsOf(
        withSchema(buildSchemaField({ kind: 'dataSource', dataSourceType: 'nope' }))
      )
    ).toContainEqual(expect.stringContaining('does not match any data-source type'));
  });

  it('accepts a dataSource field pointing at a defined type', () => {
    expect(
      errorsOf(
        withSchema(
          buildSchemaField({
            kind: 'dataSource',
            dataSourceType: 'commerce/product-list',
          })
        )
      )
    ).toEqual([]);
  });

  it('accepts a dataSource field with no type constraint', () => {
    expect(errorsOf(withSchema(buildSchemaField({ kind: 'dataSource' })))).toEqual([]);
    expect(
      errorsOf(withSchema(buildSchemaField({ kind: 'dataSource', dataSourceType: '' })))
    ).toEqual([]);
  });

  it('validates the children of a group field', () => {
    expect(
      errorsOf(
        withSchema(
          buildSchemaField({
            kind: 'group',
            children: [buildSchemaField({ kind: 'bogus' as never })],
          })
        )
      )
    ).toContainEqual(expect.stringContaining('invalid kind "bogus"'));
  });

  it('rejects a group nested inside another group', () => {
    expect(
      errorsOf(
        withSchema(
          buildSchemaField({
            key: 'outer',
            kind: 'group',
            children: [buildSchemaField({ key: 'inner', kind: 'group' })],
          })
        )
      )
    ).toContainEqual(expect.stringContaining('cannot be nested inside another group'));
  });

  it('accepts a group with no children', () => {
    expect(errorsOf(withSchema(buildSchemaField({ kind: 'group' })))).toEqual([]);
  });

  it('warns, rather than errors, about children on a non-group field', () => {
    const report = validateBundle(
      withSchema(
        buildSchemaField({ kind: 'text', children: [buildSchemaField({ key: 'x' })] })
      )
    );
    expect(report.errors).toEqual([]);
    expect(report.warnings).toContainEqual(
      expect.stringContaining('"children" is ignored')
    );
  });

  it('validates data-source schemas too', () => {
    expect(
      errorsOf(
        bundle({
          'data-sources': {
            groups: [{ key: 'commerce', name: 'Commerce' }],
            sources: [
              buildDataSourceType({
                schema: [buildSchemaField({ kind: 'bogus' as never })],
              }),
            ],
          },
        })
      )
    ).toContainEqual(expect.stringContaining('data-source "commerce/product-list"'));
  });

  it('names the component and field in the message, so the fix is obvious', () => {
    const [error] = errorsOf(
      withSchema(buildSchemaField({ key: 'headline', kind: 'bogus' as never }))
    );
    expect(error).toContain('content/hero');
    expect(error).toContain('headline');
  });

  it('collects every problem rather than stopping at the first', () => {
    expect(
      errorsOf(
        withSchema(
          buildSchemaField({ key: 'a', kind: 'bogus' as never }),
          buildSchemaField({ key: 'b', kind: 'boolean', localized: true })
        )
      )
    ).toHaveLength(2);
  });
});
