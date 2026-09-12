import type { NetworkClientProtocol } from 'syzygy-foundation-rn';
import { createNetworkRequest } from 'syzygy-foundation-rn';

// ---------------------------------------------------------------------------
// RemoteConfigProvider contract
// ---------------------------------------------------------------------------

/**
 * Contract for reading typed remote-configuration values.
 *
 * Values are fetched from a remote endpoint and cached locally.  Every
 * `get*` method falls back to the supplied default when the key is absent
 * or has the wrong type.
 */
export interface RemoteConfigProvider {
  /**
   * Fetches the latest config from the remote source and caches it.
   * Should be called once during app start-up.
   */
  fetch(): Promise<void>;

  /**
   * Returns the string value for `key`.
   * Falls back to `defaultValue` when the key is absent or not a string.
   */
  getString(key: string, defaultValue?: string): string | undefined;

  /**
   * Returns the number value for `key`.
   * Falls back to `defaultValue` when the key is absent or not a number.
   */
  getNumber(key: string, defaultValue?: number): number | undefined;

  /**
   * Returns the boolean value for `key`.
   * Falls back to `defaultValue` when the key is absent or not a boolean.
   */
  getBoolean(key: string, defaultValue?: boolean): boolean | undefined;

  /**
   * The timestamp (ms since epoch) of the most recent successful fetch, or
   * `undefined` when no fetch has completed.
   */
  readonly lastFetchTime: number | undefined;
}

// ---------------------------------------------------------------------------
// NetworkRemoteConfigProvider
// ---------------------------------------------------------------------------

/** Options for {@link NetworkRemoteConfigProvider}. */
export interface NetworkRemoteConfigProviderOptions {
  /** URL that returns a JSON object of key → value pairs. */
  configUrl: string;
  /** Network client used to fetch the remote config. */
  network: NetworkClientProtocol;
  /** Default values used when a key is absent from the remote config. */
  defaults?: Record<string, unknown>;
}

/**
 * {@link RemoteConfigProvider} that fetches a JSON config object from a
 * remote URL via the injected {@link NetworkClientProtocol}.
 *
 * The remote endpoint should return a flat JSON object, e.g.:
 * ```json
 * { "featureEnabled": true, "maxItems": 50, "greeting": "Hello" }
 * ```
 */
export class NetworkRemoteConfigProvider implements RemoteConfigProvider {
  private readonly configUrl: string;
  private readonly network: NetworkClientProtocol;
  private readonly defaults: Record<string, unknown>;
  private cache: Record<string, unknown> = {};
  private _lastFetchTime: number | undefined;

  constructor(options: NetworkRemoteConfigProviderOptions) {
    this.configUrl = options.configUrl;
    this.network = options.network;
    this.defaults = options.defaults ?? {};
  }

  /**
   * Fetches the remote config JSON and merges it into the local cache.
   * Defaults are applied beneath any remote value so that remote always wins.
   */
  async fetch(): Promise<void> {
    const request = createNetworkRequest({
      url: this.configUrl,
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    const response = await this.network.execute(request);
    const text = new TextDecoder().decode(response.data);
    const remote = JSON.parse(text) as Record<string, unknown>;
    this.cache = { ...this.defaults, ...remote };
    this._lastFetchTime = Date.now();
  }

  /**
   * Returns the string value for `key`, or `defaultValue` (or the
   * constructor default) when not present / wrong type.
   */
  getString(key: string, defaultValue?: string): string | undefined {
    const v = this._resolve(key);
    return typeof v === 'string' ? v : defaultValue;
  }

  /**
   * Returns the number value for `key`, or `defaultValue` when absent / wrong type.
   */
  getNumber(key: string, defaultValue?: number): number | undefined {
    const v = this._resolve(key);
    return typeof v === 'number' ? v : defaultValue;
  }

  /**
   * Returns the boolean value for `key`, or `defaultValue` when absent / wrong type.
   */
  getBoolean(key: string, defaultValue?: boolean): boolean | undefined {
    const v = this._resolve(key);
    return typeof v === 'boolean' ? v : defaultValue;
  }

  /** Timestamp (ms since epoch) of the most recent successful fetch. */
  get lastFetchTime(): number | undefined {
    return this._lastFetchTime;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private _resolve(key: string): unknown {
    if (key in this.cache) return this.cache[key];
    if (key in this.defaults) return this.defaults[key];
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// InMemoryRemoteConfigProvider (testing / development)
// ---------------------------------------------------------------------------

/**
 * In-memory implementation of {@link RemoteConfigProvider}.
 * Values can be seeded via the constructor or set at any time via
 * {@link setValue}.  `fetch()` is a no-op.
 */
export class InMemoryRemoteConfigProvider implements RemoteConfigProvider {
  private store: Record<string, unknown>;
  private _lastFetchTime: number | undefined;

  constructor(initialValues: Record<string, unknown> = {}) {
    this.store = { ...initialValues };
  }

  /** No-op fetch; sets {@link lastFetchTime} to `Date.now()`. */
  async fetch(): Promise<void> {
    this._lastFetchTime = Date.now();
  }

  /** Sets an arbitrary value for `key`. */
  setValue(key: string, value: unknown): void {
    this.store[key] = value;
  }

  getString(key: string, defaultValue?: string): string | undefined {
    const v = this.store[key];
    return typeof v === 'string' ? v : defaultValue;
  }

  getNumber(key: string, defaultValue?: number): number | undefined {
    const v = this.store[key];
    return typeof v === 'number' ? v : defaultValue;
  }

  getBoolean(key: string, defaultValue?: boolean): boolean | undefined {
    const v = this.store[key];
    return typeof v === 'boolean' ? v : defaultValue;
  }

  get lastFetchTime(): number | undefined {
    return this._lastFetchTime;
  }
}
