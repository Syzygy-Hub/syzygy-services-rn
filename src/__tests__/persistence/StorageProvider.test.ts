import { InMemoryStorageProvider } from '../../persistence/StorageProvider';

describe('StorageProvider', () => {
  it('InMemoryStorageProvider round-trips a value', async () => {
    const provider = new InMemoryStorageProvider();
    await provider.set('key', 'hello');
    expect(await provider.get('key')).toBe('hello');
    await provider.remove('key');
    expect(await provider.get('key')).toBeNull();
  });
});
