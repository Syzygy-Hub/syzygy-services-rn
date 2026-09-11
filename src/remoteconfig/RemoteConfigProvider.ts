/**
 * Defines the contract for fetching remote configuration values.
 */
export interface RemoteConfigProvider {
  /** Returns the string value for `key`, or null if not set. */
  getString(key: string): string | null;
  /** Returns the boolean value for `key`, or null if not set. */
  getBoolean(key: string): boolean | null;
  /** Sets a value for `key`. */
  setValue(key: string, value: unknown): void;
}

/**
 * A {@link RemoteConfigProvider} backed by an in-memory map.
 */
export class InMemoryRemoteConfigProvider implements RemoteConfigProvider {
  private store = new Map<string, unknown>();

  constructor(initialValues: Record<string, unknown> = {}) {
    for (const [k, v] of Object.entries(initialValues)) {
      this.store.set(k, v);
    }
  }

  getString(key: string): string | null {
    const v = this.store.get(key);
    return typeof v === 'string' ? v : null;
  }

  getBoolean(key: string): boolean | null {
    const v = this.store.get(key);
    return typeof v === 'boolean' ? v : null;
  }

  setValue(key: string, value: unknown): void {
    this.store.set(key, value);
  }
}
