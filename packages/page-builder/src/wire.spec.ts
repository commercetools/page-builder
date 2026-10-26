import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { WIRE_VERSION } from './wire.js';

const spec = new URL('../../../page-builder-service/openapi.yaml', import.meta.url);

describe('wire contract', () => {
  it('has src/generated/api.ts in sync with the service openapi.yaml (run `npm run generate:api`)', async () => {
    const generated = readFileSync(fileURLToPath(new URL('./generated/api.ts', import.meta.url)), 'utf8');
    const strip = (s: string): string => s.replace(/^\/\*\*[\s\S]*?\*\/\s*/, '').trim();
    expect(strip(generated)).toBe(strip(astToString(await openapiTS(spec))));
  });

  it('implements the wire version the service declares', () => {
    const doc = parse(readFileSync(fileURLToPath(spec), 'utf8')) as { components: { schemas: { WireVersion: { const: number } } } };
    expect(WIRE_VERSION).toBe(doc.components.schemas.WireVersion.const);
  });
});
