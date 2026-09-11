/**
 * Defines the contract for key-value persistence storage.
 */
export interface StorageProvider {
  /** Stores `value` for the given `key`. */
  set(key: string, value: string): Promise<void>;
  /** Retrieves the value for the given `key`, or null if not set. */
  get(key: string): Promise<string | null>;
  /** Removes the value for the given `key`. */
  remove(key: string): Promise<void>;
}

/**
 * A {@link StorageProvider} backed by an in-memory map.
 * Replace with AsyncStorage in a real React Native app.
 */
export class InMemoryStorageProvider implements StorageProvider {
  private store = new Map<string, string>();

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }
}
