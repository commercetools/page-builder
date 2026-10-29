import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = new URL('..', import.meta.url);
const specUrl = new URL('openapi.yaml', root);

describe('openapi.yaml', () => {
  it('has src/generated/api.ts in sync (run `npm run generate:api`)', async () => {
    const ast = await openapiTS(specUrl);
    const generated = readFileSync(fileURLToPath(new URL('src/generated/api.ts', root)), 'utf8');
    // openapi-typescript prefixes a banner comment; compare the declarations only.
    const strip = (s: string): string => s.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '').trim();
    expect(strip(generated)).toBe(strip(astToString(ast)));
  });

  it('exposes only versioned render, catalog and admin paths', () => {
    const doc = parse(readFileSync(fileURLToPath(specUrl), 'utf8')) as {
      paths: Record<string, unknown>;
    };
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/v1/admin/media',
      '/v1/admin/objects/{container}',
      '/v1/admin/objects/{container}/{key}',
      '/v1/catalog',
      '/v1/catalog/publish',
      '/v1/catalog/validate',
      '/v1/render',
    ]);
  });

  it('requires the wire version header on render', () => {
    const doc = parse(readFileSync(fileURLToPath(specUrl), 'utf8')) as {
      paths: Record<string, { get?: { parameters: Array<{ $ref?: string }> } }>;
    };
    expect(doc.paths['/v1/render'].get?.parameters).toContainEqual({
      $ref: '#/components/parameters/WireVersionHeader',
    });
  });
});
