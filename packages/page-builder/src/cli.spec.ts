import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `cli.ts` is a binary: it calls `main()` at import time and exports nothing.
 * Rather than spawning it (which would run `dist/` and leave the source
 * uninstrumented), each case re-imports the module with `process.argv` set and
 * observes what it printed and what exit code it left behind — the two things a
 * CI pipeline actually depends on.
 *
 * Only the commands needing no commercetools access run here; `sync`, `publish`
 * and `pull` are covered against a mocked client in `commands/commands.spec.ts`.
 */
type Captured = { out: string; err: string; exitCode: number | undefined };

let dir: string;
let cwd: string;

const CT_KEYS = [
  'CTP_PROJECT_KEY',
  'CTP_CLIENT_ID',
  'CTP_CLIENT_SECRET',
  'CTP_AUTH_URL',
  'CTP_API_URL',
] as const;
let envSnapshot: Map<string, string | undefined>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-cli-'));
  cwd = process.cwd();
  envSnapshot = new Map(CT_KEYS.map((k) => [k, process.env[k]]));
  for (const k of CT_KEYS) delete process.env[k];
});

afterEach(() => {
  process.chdir(cwd);
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [k, v] of envSnapshot) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

const cli = async (...args: string[]): Promise<Captured> => {
  const out: string[] = [];
  const err: string[] = [];
  const log = vi
    .spyOn(console, 'log')
    .mockImplementation((...a) => out.push(a.join(' ')));
  const error = vi
    .spyOn(console, 'error')
    .mockImplementation((...a) => err.push(a.join(' ')));

  const argv = process.argv;
  process.argv = ['node', 'cli', ...args];
  process.exitCode = undefined;
  vi.resetModules();
  try {
    await import('./cli.js');
    // `main()` is invoked at import without being awaited; let it settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    process.argv = argv;
    log.mockRestore();
    error.mockRestore();
  }

  const captured = {
    out: out.join('\n'),
    err: err.join('\n'),
    exitCode: process.exitCode as number | undefined,
  };
  process.exitCode = undefined;
  return captured;
};

const writeBundle = (contents: unknown) => {
  const file = path.join(dir, 'catalog.json');
  fs.writeFileSync(file, JSON.stringify(contents));
  return file;
};

const validBundle = {
  components: {
    groups: [{ key: 'content', name: 'Content' }],
    components: [
      {
        type: 'content/hero',
        name: { 'en-US': 'Hero' },
        icon: 'Image',
        groupKey: 'content',
        schema: [],
      },
    ],
  },
  'data-sources': { groups: [], sources: [] },
  sections: { sections: [] },
};

describe('page-builder help', () => {
  it('prints usage with no command', async () => {
    const { out, exitCode } = await cli();
    expect(exitCode).toBeUndefined();
    expect(out).toContain('page-builder <command>');
  });

  it('prints usage for `help`', async () => {
    expect((await cli('help')).out).toContain('Commands:');
  });

  it('prints usage for --help on a command', async () => {
    const { out, exitCode } = await cli('sync', '--help');
    expect(exitCode).toBeUndefined();
    expect(out).toContain('Commands:');
  });

  it('prints usage for -h', async () => {
    expect((await cli('-h')).out).toContain('Commands:');
  });

  it('documents every command', async () => {
    const { out } = await cli('help');
    for (const command of ['init', 'sync', 'publish', 'pull', 'validate']) {
      expect(out).toContain(command);
    }
  });
});

describe('page-builder argument errors', () => {
  it('fails on an unknown command', async () => {
    const { exitCode, err } = await cli('nonsense');
    expect(exitCode).toBe(1);
    expect(err).toContain('unknown command: nonsense');
  });

  it('fails on an unknown flag', async () => {
    const { exitCode, err } = await cli('validate', '--bogus');
    expect(exitCode).toBe(1);
    expect(err).toContain('unknown argument: --bogus');
  });

  it('fails when a value flag has no value', async () => {
    const { exitCode, err } = await cli('validate', '--input');
    expect(exitCode).toBe(1);
    expect(err).toContain('--input requires a value');
  });

  it('fails on an unknown --only key, naming the valid ones', async () => {
    const { exitCode, err } = await cli(
      'validate',
      '--input',
      writeBundle(validBundle),
      '--only',
      'nope'
    );
    expect(exitCode).toBe(1);
    expect(err).toContain('unknown key(s) nope');
    expect(err).toContain('components, data-sources, sections');
  });

  it('accepts a comma-separated --only list', async () => {
    const { exitCode } = await cli(
      'validate',
      '--input',
      writeBundle(validBundle),
      '--only',
      'components,sections'
    );
    expect(exitCode).toBeUndefined();
  });
});

describe('page-builder validate', () => {
  it('accepts a well-formed bundle', async () => {
    const { exitCode } = await cli('validate', '--input', writeBundle(validBundle));
    expect(exitCode).toBeUndefined();
  });

  it('rejects a bundle with a broken reference', async () => {
    const broken = {
      ...validBundle,
      components: { groups: [], components: validBundle.components.components },
    };
    const { exitCode, out, err } = await cli(
      'validate',
      '--input',
      writeBundle(broken)
    );
    expect(exitCode).toBe(1);
    expect(`${out}${err}`).toMatch(/groupKey/);
  });

  it('fails when the input file does not exist', async () => {
    const { exitCode, err } = await cli(
      'validate',
      '--input',
      path.join(dir, 'missing.json')
    );
    expect(exitCode).toBe(1);
    expect(err).toContain('not found');
  });
});

describe('page-builder init', () => {
  it('scaffolds into the given directory', async () => {
    const { exitCode, out } = await cli('init', '--out', dir);
    expect(exitCode).toBeUndefined();
    expect(out).toContain('wrote');
    expect(fs.readdirSync(dir).length).toBeGreaterThan(0);
  });

  it('reports what it would write on a dry run', async () => {
    const { out } = await cli('init', '--out', dir, '--dry-run');
    expect(out).toContain('would write');
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('skips existing files rather than clobbering them', async () => {
    await cli('init', '--out', dir);
    expect((await cli('init', '--out', dir)).out).toContain('skipped (exists)');
  });

  it('overwrites with --force', async () => {
    await cli('init', '--out', dir);
    const { out } = await cli('init', '--out', dir, '--force');
    expect(out).toContain('wrote');
  });

  it('defaults the destination to the working directory', async () => {
    process.chdir(dir);
    await cli('init');
    expect(fs.readdirSync(dir).length).toBeGreaterThan(0);
  });
});

describe('page-builder credentials', () => {
  it('fails when the named env file does not exist', async () => {
    const { exitCode, err } = await cli(
      'publish',
      '--env',
      path.join(dir, 'none.env')
    );
    expect(exitCode).toBe(1);
    expect(err).toContain('env file not found');
  });

  it('fails clearly when the CT credentials are missing', async () => {
    process.chdir(dir);
    const { exitCode, err } = await cli('publish');
    expect(exitCode).toBe(1);
    expect(err).toMatch(/missing required env/);
  });
});
