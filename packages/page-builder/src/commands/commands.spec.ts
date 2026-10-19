import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogBundle, CombinedCatalog } from '../contract.js';

// The CT client is covered by its own spec against a real loopback server; here
// it is a collaborator, so the command logic can be driven without HTTP.
const getCustomObject = vi.fn();
const putCustomObject = vi.fn();
vi.mock('../core/ct-client.js', () => ({
  getCustomObject: (...args: unknown[]) => getCustomObject(...args),
  putCustomObject: (...args: unknown[]) => putCustomObject(...args),
}));

const { ALL_KEYS, payloadForKey } = await import('./context.js');
const { runValidate } = await import('./validate.js');
const { runSync } = await import('./sync.js');
const { runPublish } = await import('./publish.js');
const { runPull } = await import('./pull.js');
const { runInit, NEXT_STEPS } = await import('./init.js');
const { buildCombined, copyDraftToPublished } = await import(
  '../catalog/envelope.js'
);
const { buildComponentType, buildCtEnv, buildDataSourceType, buildSection } =
  await import('../test-utils/factories.js');

const NOW = '2026-01-15T10:00:00.000Z';
const ctx = { env: buildCtEnv(), token: 'tok' };

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

beforeEach(() => {
  getCustomObject.mockReset().mockResolvedValue(null);
  putCustomObject.mockReset().mockResolvedValue({ version: 1 });
});

describe('context helpers', () => {
  it('names the three catalog keys in a stable order', () => {
    expect(ALL_KEYS).toEqual(['components', 'data-sources', 'sections']);
  });

  it('extracts the payload for a key', () => {
    const b = bundle();
    expect(payloadForKey(b, 'sections')).toBe(b.sections);
  });
});

describe('runValidate', () => {
  it('passes a well-formed bundle', () => {
    expect(runValidate(bundle())).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it('fails a bundle with a broken group reference', () => {
    const result = runValidate(
      bundle({
        components: {
          groups: [],
          components: [buildComponentType()],
        },
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reports warnings without failing', () => {
    const result = runValidate(
      bundle({
        components: {
          groups: [{ key: 'content', name: 'Content' }],
          components: [
            buildComponentType({
              schema: [
                {
                  key: 'a',
                  label: 'A',
                  kind: 'text',
                  children: [{ key: 'b', label: 'B', kind: 'text' }],
                },
              ],
            }),
          ],
        },
      })
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('runSync', () => {
  it('creates every catalog object on a fresh project', async () => {
    const result = await runSync({ ctx, bundle: bundle(), now: NOW });

    expect(result.perKey.map((r) => r.action)).toEqual([
      'created',
      'created',
      'created',
    ]);
    expect(putCustomObject).toHaveBeenCalledTimes(3);
  });

  it('refuses to sync a bundle that does not validate', async () => {
    await expect(
      runSync({
        ctx,
        bundle: bundle({ components: { groups: [], components: [buildComponentType()] } }),
        now: NOW,
      })
    ).rejects.toThrow(/catalog validation failed/);
    expect(putCustomObject).not.toHaveBeenCalled();
  });

  it('reports an unchanged catalog without writing', async () => {
    const b = bundle();
    getCustomObject.mockImplementation(async (_e, _t, key: string) => ({
      version: 3,
      value: buildCombined(payloadForKey(b, key as never), NOW),
    }));

    const result = await runSync({ ctx, bundle: b, now: NOW });
    expect(result.perKey.every((r) => r.action === 'unchanged')).toBe(true);
    expect(putCustomObject).not.toHaveBeenCalled();
  });

  it('updates a catalog whose content changed', async () => {
    getCustomObject.mockResolvedValue({
      version: 3,
      value: buildCombined({ sections: [] }, NOW),
    });

    const result = await runSync({ ctx, bundle: bundle(), now: NOW, only: ['sections'] });
    expect(result.perKey).toEqual([
      { key: 'sections', action: 'updated', versionCount: 2 },
    ]);
  });

  it('sends the CT version so a stale write is rejected', async () => {
    getCustomObject.mockResolvedValue({
      version: 7,
      value: buildCombined({ sections: [] }, NOW),
    });

    await runSync({ ctx, bundle: bundle(), now: NOW, only: ['sections'] });
    expect(putCustomObject).toHaveBeenCalledWith(
      ctx.env,
      'tok',
      'sections',
      expect.anything(),
      7
    );
  });

  it('reports what a dry run would do without writing', async () => {
    const result = await runSync({ ctx, bundle: bundle(), now: NOW, dryRun: true });

    expect(result.perKey.every((r) => r.action === 'skipped')).toBe(true);
    expect(putCustomObject).not.toHaveBeenCalled();
  });

  it('syncs only the requested keys', async () => {
    const result = await runSync({
      ctx,
      bundle: bundle(),
      now: NOW,
      only: ['components'],
    });
    expect(result.perKey.map((r) => r.key)).toEqual(['components']);
  });

  it('never touches the published payload', async () => {
    getCustomObject.mockResolvedValue({
      version: 1,
      value: copyDraftToPublished(buildCombined({ sections: [] }, NOW), NOW),
    });

    await runSync({ ctx, bundle: bundle(), now: NOW, only: ['sections'] });
    const written = putCustomObject.mock.calls[0][3] as CombinedCatalog<unknown>;
    expect(written.published).not.toBeNull();
  });
});

describe('runPublish', () => {
  it('reports nothing to publish on a fresh project', async () => {
    const result = await runPublish({ ctx, now: NOW });
    expect(result.perKey.every((r) => r.action === 'nothing-to-publish')).toBe(true);
    expect(putCustomObject).not.toHaveBeenCalled();
  });

  it('promotes the draft head to published', async () => {
    getCustomObject.mockResolvedValue({
      version: 2,
      value: buildCombined({ sections: [] }, NOW),
    });

    const result = await runPublish({ ctx, now: NOW, only: ['sections'] });
    expect(result.perKey).toEqual([
      { key: 'sections', action: 'published', appVersion: 1 },
    ]);

    const written = putCustomObject.mock.calls[0][3] as CombinedCatalog<unknown>;
    expect(written.published).not.toBeNull();
  });

  it('reports what a dry run would publish without writing', async () => {
    getCustomObject.mockResolvedValue({
      version: 2,
      value: buildCombined({ sections: [] }, NOW),
    });

    const result = await runPublish({ ctx, now: NOW, only: ['sections'], dryRun: true });
    expect(result.perKey[0].action).toBe('skipped');
    expect(putCustomObject).not.toHaveBeenCalled();
  });

  it('publishes only the requested keys', async () => {
    const result = await runPublish({ ctx, now: NOW, only: ['components'] });
    expect(result.perKey.map((r) => r.key)).toEqual(['components']);
  });

  it('sends the CT version so a stale publish is rejected', async () => {
    getCustomObject.mockResolvedValue({
      version: 9,
      value: buildCombined({ sections: [] }, NOW),
    });

    await runPublish({ ctx, now: NOW, only: ['sections'] });
    expect(putCustomObject.mock.calls[0][4]).toBe(9);
  });
});

describe('runPull', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-pull-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns an empty bundle when CT holds nothing', async () => {
    const result = await runPull({ ctx, out: path.join(dir, 'catalog.json') });
    expect(result.bundle.components.components).toEqual([]);
    expect(result.perKey.every((r) => !r.found)).toBe(true);
  });

  it('reads the effective payload of each catalog', async () => {
    getCustomObject.mockImplementation(async (_e, _t, key: string) =>
      key === 'sections'
        ? { version: 1, value: buildCombined({ sections: [buildSection()] }, NOW) }
        : null
    );

    const result = await runPull({ ctx, out: path.join(dir, 'catalog.json') });
    expect(result.bundle.sections.sections).toHaveLength(1);
  });

  it('writes a single bundle file', async () => {
    const out = path.join(dir, 'nested', 'catalog.json');
    await runPull({ ctx, out });

    expect(fs.existsSync(out)).toBe(true);
    expect(JSON.parse(fs.readFileSync(out, 'utf8'))).toHaveProperty('components');
  });

  it('writes one file per catalog when the target is a directory', async () => {
    const out = path.join(dir, 'catalogs');
    fs.mkdirSync(out);
    await runPull({ ctx, out });

    for (const name of ['components.json', 'data-sources.json', 'sections.json']) {
      expect(fs.existsSync(path.join(out, name))).toBe(true);
    }
  });

  it('optionally emits a typed stub', async () => {
    const stubs = path.join(dir, 'catalog.ts');
    await runPull({ ctx, out: path.join(dir, 'catalog.json'), stubs });

    expect(fs.existsSync(stubs)).toBe(true);
    expect(fs.readFileSync(stubs, 'utf8')).toContain('AUTO-GENERATED');
  });
});

describe('runInit', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-init-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('copies the template tree into an empty target', () => {
    const result = runInit({ out: dir });
    expect(result.wrote.length).toBeGreaterThan(0);
    expect(result.skipped).toEqual([]);
  });

  it('reports what it would write on a dry run, writing nothing', () => {
    const result = runInit({ out: dir, dryRun: true });
    expect(result.wrote.length).toBeGreaterThan(0);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('skips a file that already exists rather than clobbering it', () => {
    const first = runInit({ out: dir });
    const second = runInit({ out: dir });

    expect(second.wrote).toEqual([]);
    expect(second.skipped.sort()).toEqual(first.wrote.sort());
  });

  it('offers next steps for the operator', () => {
    expect(NEXT_STEPS.trim().length).toBeGreaterThan(0);
  });
});
