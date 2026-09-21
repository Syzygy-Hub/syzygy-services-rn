import os from 'os';

import { createStorageKey } from 'syzygy-foundation-rn';
import type { StorageProvider } from 'syzygy-foundation-rn';

// ---------------------------------------------------------------------------
// UUID helper (no third-party deps)
// ---------------------------------------------------------------------------

/**
 * Generates a RFC 4122 v4 UUID using `crypto.randomUUID` when available
 * (Node ≥ 14.17, browsers, React Native ≥ 0.70) with a manual fallback.
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: manual implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// DeviceProvider contract
// ---------------------------------------------------------------------------

/**
 * Contract for accessing device-level metadata.
 */
export interface DeviceProvider {
  /**
   * A persistent, unique identifier for this installation.
   * Generated on first access and stored via the injected {@link StorageProvider}.
   */
  readonly deviceId: Promise<string>;
  /** Always `'rn'` — identifies this as a React Native service layer. */
  readonly platform: string;
  /** Human-readable OS version string. */
  readonly osVersion: string;
  /** Application version (read from `package.json` or defaulting to `'1.0.0'`). */
  readonly appVersion: string;
  /**
   * Whether the app is running in a simulator / emulator rather than on a
   * physical device.  Always `false` in a Node.js test environment; can be
   * overridden via {@link NodeDeviceProviderOptions.isSimulator}.
   */
  readonly isSimulator: boolean;
}

// ---------------------------------------------------------------------------
// NodeDeviceProvider
// ---------------------------------------------------------------------------

const DEVICE_ID_KEY = createStorageKey<string>('syzygy.device.uuid');

/** Options for {@link NodeDeviceProvider}. */
export interface NodeDeviceProviderOptions {
  /** Storage provider used to persist the device identifier. */
  storage: StorageProvider;
  /** Override the app version instead of reading it from `package.json`. */
  appVersion?: string;
  /** Override the simulator flag (default: `false`). */
  isSimulator?: boolean;
}

/**
 * Node.js / React Native implementation of {@link DeviceProvider}.
 *
 * The device ID is generated once (UUID v4) and persisted via the injected
 * {@link StorageProvider} so that it survives process restarts.
 */
export class NodeDeviceProvider implements DeviceProvider {
  private readonly storage: StorageProvider;
  private readonly _appVersion: string;
  private readonly _isSimulator: boolean;
  private _cachedDeviceId: string | undefined;
  private _pendingId: Promise<string> | null = null;

  constructor(options: NodeDeviceProviderOptions) {
    this.storage = options.storage;
    this._appVersion = options.appVersion ?? readAppVersion();
    this._isSimulator = options.isSimulator ?? false;
  }

  /**
   * Returns the persistent device ID, generating and storing one on first
   * call.  The returned promise resolves with the same value on every call.
   */
  get deviceId(): Promise<string> {
    if (this._cachedDeviceId !== undefined) {
      return Promise.resolve(this._cachedDeviceId);
    }
    // Return existing in-flight promise to prevent concurrent callers from
    // each generating their own UUID before the first write completes.
    if (this._pendingId) return this._pendingId;

    this._pendingId = this._loadOrCreateDeviceId().finally(() => {
      this._pendingId = null;
    });
    return this._pendingId;
  }

  /** Always `'rn'`. */
  get platform(): string {
    return 'rn';
  }

  /**
   * Node.js: `process.version` (e.g. `'v18.17.0'`).
   * In a React Native environment this would return the OS release string.
   */
  get osVersion(): string {
    return os.release();
  }

  /** Application version string. */
  get appVersion(): string {
    return this._appVersion;
  }

  /** `true` when running in a simulator / emulator. */
  get isSimulator(): boolean {
    return this._isSimulator;
  }

  // -------------------------------------------------------------------------

  private async _loadOrCreateDeviceId(): Promise<string> {
    const stored = await this.storage.get(DEVICE_ID_KEY);
    if (stored) {
      this._cachedDeviceId = stored;
      return stored;
    }
    const id = generateUUID();
    await this.storage.set(id, DEVICE_ID_KEY);
    this._cachedDeviceId = id;
    return id;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readAppVersion(): string {
  try {
    // The package.json is read at module load time for the app version.
    // Dynamic require is the only way to load JSON without an import assertion
    // in a CommonJS / ts-jest environment that does not support import attributes.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const pkg = require('../../package.json') as { version?: string };
    return pkg.version ?? '1.0.0';
  } catch {
    return '1.0.0';
  }
}
