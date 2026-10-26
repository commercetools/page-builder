import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from './cache.js';

function clock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('TtlCache', () => {
  it('serves a loaded value until the TTL elapses, then reloads', async () => {
    const c = clock();
    const cache = new TtlCache(15, { now: c.now });
    const load = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b');

    expect(await cache.read('k', load)).toBe('a');
    c.advance(14_999);
    expect(await cache.read('k', load)).toBe('a');
    c.advance(1);
    expect(await cache.read('k', load)).toBe('b');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('caches null results', async () => {
    const cache = new TtlCache(15);
    const load = vi.fn().mockResolvedValue(null);
    await cache.read('k', load);
    expect(await cache.read('k', load)).toBeNull();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shares one load between concurrent reads of a key', async () => {
    const cache = new TtlCache(15);
    let resolve!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));

    const reads = [cache.read('k', load), cache.read('k', load)];
    resolve('shared');
    expect(await Promise.all(reads)).toEqual(['shared', 'shared']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('never caches a failure and lets the next read retry', async () => {
    const cache = new TtlCache(15);
    const load = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');
    await expect(cache.read('k', load)).rejects.toThrow('boom');
    expect(await cache.read('k', load)).toBe('ok');
  });

  it('bypass reads fresh and neither reads nor writes the cache', async () => {
    const cache = new TtlCache(15);
    await cache.read('k', async () => 'cached');
    const load = vi.fn().mockResolvedValue('fresh');
    expect(await cache.read('k', load, { bypass: true })).toBe('fresh');
    expect(await cache.read('k', async () => 'unused')).toBe('cached');
    expect(cache.size).toBe(1);
  });

  it('does not share a load with a bypass read', async () => {
    const cache = new TtlCache(15);
    let resolve!: (v: string) => void;
    void cache.read('k', () => new Promise<string>((r) => (resolve = r)));
    const bypass = vi.fn().mockResolvedValue('draft');
    expect(await cache.read('k', bypass, { bypass: true })).toBe('draft');
    resolve('published');
  });

  it('is disabled by a zero TTL', async () => {
    const cache = new TtlCache(0);
    const load = vi.fn().mockResolvedValue('v');
    await cache.read('k', load);
    await cache.read('k', load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(0);
  });

  it('delete forgets a value', async () => {
    const cache = new TtlCache(15);
    const load = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b');
    await cache.read('k', load);
    cache.delete('k');
    expect(await cache.read('k', load)).toBe('b');
  });

  it('delete during a load stops the stale result from being shared with later reads', async () => {
    const cache = new TtlCache(15);
    let resolveOld!: (v: string) => void;
    const old = cache.read('k', () => new Promise<string>((r) => (resolveOld = r)));
    cache.delete('k');
    const fresh = vi.fn().mockResolvedValue('new');
    expect(await cache.read('k', fresh)).toBe('new');
    resolveOld('old');
    expect(await old).toBe('old');
    expect(await cache.read('k', async () => 'unused')).toBe('new');
  });

  it('an orphaned load that fails does not disturb the load that replaced it', async () => {
    const cache = new TtlCache(15);
    let rejectOld!: (e: Error) => void;
    const old = cache.read('k', () => new Promise<string>((_, rej) => (rejectOld = rej)));
    cache.delete('k');
    let resolveNew!: (v: string) => void;
    const fresh = cache.read('k', () => new Promise<string>((r) => (resolveNew = r)));
    rejectOld(new Error('old failed'));
    await expect(old).rejects.toThrow('old failed');
    resolveNew('new');
    expect(await fresh).toBe('new');
    expect(await cache.read('k', async () => 'unused')).toBe('new');
  });

  it('clear empties the cache', async () => {
    const cache = new TtlCache(15);
    await cache.read('a', async () => 1);
    await cache.read('b', async () => 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('evicts the oldest entry when full', async () => {
    const cache = new TtlCache(15, { maxEntries: 2 });
    for (const k of ['a', 'b', 'c']) await cache.read(k, async () => k);
    expect(cache.size).toBe(2);
    const reload = vi.fn().mockResolvedValue('a2');
    expect(await cache.read('a', reload)).toBe('a2');
  });
});
