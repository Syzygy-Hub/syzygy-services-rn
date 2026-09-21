import { createStorageKey } from 'syzygy-foundation-rn';

import { InMemoryStorageProvider } from '../../persistence/StorageProvider';

describe('InMemoryStorageProvider', () => {
  it('round-trips a string value', async () => {
    const provider = new InMemoryStorageProvider();
    const key = createStorageKey<string>('greeting');
    await provider.set('hello', key);
    expect(await provider.get(key)).toBe('hello');
  });

  it('round-trips a number value', async () => {
    const provider = new InMemoryStorageProvider();
    const key = createStorageKey<number>('count');
    await provider.set(42, key);
    expect(await provider.get(key)).toBe(42);
  });

  it('round-trips a boolean value', async () => {
    const provider = new InMemoryStorageProvider();
    const key = createStorageKey<boolean>('flag');
    await provider.set(false, key);
    expect(await provider.get(key)).toBe(false);
  });

  it('round-trips a complex object', async () => {
    const provider = new InMemoryStorageProvider();
    const key = createStorageKey<{ x: number; y: string }>('obj');
    await provider.set({ x: 1, y: 'a' }, key);
    expect(await provider.get(key)).toEqual({ x: 1, y: 'a' });
  });

  it('returns undefined for a missing key with no default', async () => {
    const provider = new InMemoryStorageProvider();
    const key = createStorageKey<string>('missing');
    expect(await provider.get(key)).toBeUndefined();
  });

  it('returns the defaultValue for a missing key when one is set', async () => {
    const provider = new InMemoryStorageProvider();
    const key = createStorageKey<string>('absent', 'fallback');
    expect(await provider.get(key)).toBe('fallback');
  });

  it('remove deletes a stored entry', async () => {
    const provider = new InMemoryStorageProvider();
    const key = createStorageKey<string>('temp');
    await provider.set('data', key);
    await provider.remove(key);
    expect(await provider.get(key)).toBeUndefined();
  });

  it('remove is a no-op for a missing key', async () => {
    const provider = new InMemoryStorageProvider();
    const key = createStorageKey<string>('nope');
    await expect(provider.remove(key)).resolves.toBeUndefined();
  });

  it('clear removes all entries', async () => {
    const provider = new InMemoryStorageProvider();
    const k1 = createStorageKey<string>('a');
    const k2 = createStorageKey<number>('b');
    await provider.set('x', k1);
    await provider.set(7, k2);
    await provider.clear();
    expect(await provider.get(k1)).toBeUndefined();
    expect(await provider.get(k2)).toBeUndefined();
  });

  it('isolated instances do not share state', async () => {
    const p1 = new InMemoryStorageProvider();
    const p2 = new InMemoryStorageProvider();
    const key = createStorageKey<string>('shared');
    await p1.set('only-in-p1', key);
    expect(await p2.get(key)).toBeUndefined();
  });

  it('get() throws TypeError when stored type mismatches requested type', async () => {
    const provider = new InMemoryStorageProvider();
    // Store a string value under identifier 'count'
    const strKey = createStorageKey<string>('count');
    await provider.set('not-a-number', strKey);
    // Retrieve with a key that declares a number defaultValue — type hint is 'number'
    const numKey = createStorageKey<number>('count', 0);
    await expect(provider.get(numKey)).rejects.toThrow(TypeError);
    await expect(provider.get(numKey)).rejects.toThrow(/key "count".*type "string".*type "number"/);
  });

  it('get() succeeds when stored type matches requested type', async () => {
    const provider = new InMemoryStorageProvider();
    const key = createStorageKey<number>('score', 0);
    await provider.set(99, key);
    await expect(provider.get(key)).resolves.toBe(99);
  });

  it('get() does not throw when key has no defaultValue (no type hint)', async () => {
    // Without defaultValue there is no runtime type hint; the value passes through
    const provider = new InMemoryStorageProvider();
    const writeKey = createStorageKey<number>('x');
    await provider.set(42, writeKey);
    const readKey = createStorageKey<string>('x'); // no defaultValue
    // No TypeError because there is no type hint to validate against
    await expect(provider.get(readKey)).resolves.toBe(42);
  });

  it('concurrent reads and writes do not throw', async () => {
    const provider = new InMemoryStorageProvider();
    const key = createStorageKey<string>('concurrent.key');
    const ops = [
      ...Array.from({ length: 5 }, () => provider.set('value', key)),
      ...Array.from({ length: 5 }, () => provider.get(key)),
    ];
    await expect(Promise.all(ops)).resolves.toBeDefined();
  });
});
