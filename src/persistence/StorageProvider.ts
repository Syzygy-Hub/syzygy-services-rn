import type { StorageKey, StorageProvider } from 'syzygy-foundation-rn';

/**
 * In-memory implementation of {@link StorageProvider}.
 *
 * Stores values serialised as JSON strings in a {@link Map}.  This is suitable
 * for unit tests and environments where a native AsyncStorage bridge is
 * unavailable.  In a real React Native app, swap this with an adapter around
 * `@react-native-async-storage/async-storage`.
 *
 * Non-sensitive and sensitive keys share the same backing store; callers that
 * need to distinguish them should use a key-naming convention (e.g. a
 * `secure.` prefix) and layer encryption on top.
 */
export class InMemoryStorageProvider implements StorageProvider {
  private readonly store = new Map<string, string>();

  /**
   * Retrieves the value stored under `key`.
   * Returns the key's `defaultValue` (or `undefined`) when the key is absent.
   *
   * @typeParam T  The expected value type.
   */
  async get<T>(key: StorageKey<T>): Promise<T | undefined> {
    const raw = this.store.get(key.identifier);
    if (raw === undefined) return key.defaultValue;
    return JSON.parse(raw) as T;
  }

  /**
   * Serialises `value` as JSON and persists it under `key`.
   *
   * @typeParam T  The value type.
   */
  async set<T>(value: T, key: StorageKey<T>): Promise<void> {
    this.store.set(key.identifier, JSON.stringify(value));
  }

  /**
   * Removes the entry for `key`.  A no-op when the key is not present.
   *
   * @typeParam T  The value type (used only for type-safe key matching).
   */
  async remove<T>(key: StorageKey<T>): Promise<void> {
    this.store.delete(key.identifier);
  }

  /**
   * Removes **all** entries from the store.
   */
  async clear(): Promise<void> {
    this.store.clear();
  }
}
