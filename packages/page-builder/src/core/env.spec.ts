import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEnv, requireEnv } from './env.js';

const KEYS = [
  'CTP_PROJECT_KEY',
  'CTP_CLIENT_ID',
  'CTP_CLIENT_SECRET',
  'CTP_AUTH_URL',
  'CTP_API_URL',
  'CTP_SCOPES',
  'SOME_OTHER',
] as const;

let dir: string;
let cwd: string;
let snapshot: Map<string, string | undefined>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-env-'));
  cwd = process.cwd();
  snapshot = new Map(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  process.chdir(cwd);
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [k, v] of snapshot) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const writeEnv = (contents: string, name = '.env') => {
  fs.writeFileSync(path.join(dir, name), contents);
  process.chdir(dir);
  return name;
};

const fullEnv = () => {
  process.env.CTP_PROJECT_KEY = 'test-project';
  process.env.CTP_CLIENT_ID = 'client-id';
  process.env.CTP_CLIENT_SECRET = 'client-secret';
  process.env.CTP_AUTH_URL = 'https://auth.example.test';
  process.env.CTP_API_URL = 'https://api.example.test';
};

describe('loadEnv', () => {
  it('reads key=value pairs into the environment', () => {
    loadEnv(writeEnv('CTP_PROJECT_KEY=from-file\nCTP_CLIENT_ID=abc\n'));
    expect(process.env.CTP_PROJECT_KEY).toBe('from-file');
    expect(process.env.CTP_CLIENT_ID).toBe('abc');
  });

  it('never overwrites a variable that is already set', () => {
    // A real environment beats a checked-in dotenv file.
    process.env.CTP_PROJECT_KEY = 'from-environment';
    loadEnv(writeEnv('CTP_PROJECT_KEY=from-file\n'));
    expect(process.env.CTP_PROJECT_KEY).toBe('from-environment');
  });

  it('strips surrounding quotes', () => {
    loadEnv(writeEnv(`CTP_CLIENT_ID="quoted"\nCTP_CLIENT_SECRET='single'\n`));
    expect(process.env.CTP_CLIENT_ID).toBe('quoted');
    expect(process.env.CTP_CLIENT_SECRET).toBe('single');
  });

  it('trims whitespace around keys and values', () => {
    loadEnv(writeEnv('  CTP_CLIENT_ID  =  spaced  \n'));
    expect(process.env.CTP_CLIENT_ID).toBe('spaced');
  });

  it('keeps everything after the first equals sign', () => {
    loadEnv(writeEnv('CTP_API_URL=https://api.test/?a=1&b=2\n'));
    expect(process.env.CTP_API_URL).toBe('https://api.test/?a=1&b=2');
  });

  it('skips comments and blank lines', () => {
    loadEnv(writeEnv('# a comment\n\n   \nCTP_CLIENT_ID=abc\n'));
    expect(process.env.CTP_CLIENT_ID).toBe('abc');
  });

  it('skips a line with no equals sign', () => {
    loadEnv(writeEnv('NOT_A_PAIR\nCTP_CLIENT_ID=abc\n'));
    expect(process.env.CTP_CLIENT_ID).toBe('abc');
  });

  it('throws a helpful error when the file is missing', () => {
    process.chdir(dir);
    expect(() => loadEnv('.env.missing')).toThrow(/env file not found/);
  });

  it('points at .env.example in the error', () => {
    process.chdir(dir);
    expect(() => loadEnv('.env.missing')).toThrow(/\.env\.example/);
  });

  it('is a no-op for a missing optional file', () => {
    process.chdir(dir);
    expect(() => loadEnv('.env.missing', true)).not.toThrow();
  });
});

describe('requireEnv', () => {
  it('collects the credentials', () => {
    fullEnv();
    expect(requireEnv()).toMatchObject({
      projectKey: 'test-project',
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });
  });

  it('names every missing variable at once, rather than one per run', () => {
    process.env.CTP_PROJECT_KEY = 'test-project';
    expect(() => requireEnv()).toThrow(
      /CTP_CLIENT_ID, CTP_CLIENT_SECRET, CTP_AUTH_URL, CTP_API_URL/
    );
  });

  it('strips a trailing slash from the auth and API URLs', () => {
    fullEnv();
    process.env.CTP_AUTH_URL = 'https://auth.example.test/';
    process.env.CTP_API_URL = 'https://api.example.test/';

    const env = requireEnv();
    expect(env.authUrl).toBe('https://auth.example.test');
    expect(env.apiUrl).toBe('https://api.example.test');
  });

  it('defaults to the minimal project-scoped write scope', () => {
    fullEnv();
    expect(requireEnv().scopes).toBe('manage_key_value_documents:test-project');
  });

  it('honours an explicit scope list', () => {
    fullEnv();
    process.env.CTP_SCOPES = 'view_products:test-project';
    expect(requireEnv().scopes).toBe('view_products:test-project');
  });
});
