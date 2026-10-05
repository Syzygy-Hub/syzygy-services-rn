/**
 * Contract compliance tests.
 *
 * Verifies that every concrete service class:
 * 1. Can be instantiated without throwing.
 * 2. Implements (structurally) the expected Foundation protocol.
 * 3. Returns the expected type from its primary method.
 *
 * These tests are intentionally lightweight — they guard against accidental
 * API breakage rather than testing behaviour (covered by the per-module suites).
 */

import { createStorageKey, createNetworkRequest, createAnalyticsEvent } from 'syzygy-foundation-rn';
import type {
  AnalyticsProvider,
  AuthProvider,
  NetworkClientProtocol,
  StorageProvider,
} from 'syzygy-foundation-rn';

import {
  ConsoleAnalyticsProvider,
  InMemoryAnalyticsProvider,
} from '../analytics/AnalyticsProvider';
import { JWTAuthProvider } from '../auth/AuthProvider';
import { ConsoleCrashReporter, InMemoryCrashReporter } from '../crashreporting/CrashReporter';
import { NodeDeviceProvider } from '../deviceservices/DeviceProvider';
import { NodeFileProvider } from '../filemanagement/FileProvider';
import { FetchNetworkClient } from '../networking/NetworkClient';
import { InMemoryStorageProvider } from '../persistence/StorageProvider';
import { InMemoryPushProvider } from '../pushnotifications/PushProvider';
import {
  InMemoryRemoteConfigProvider,
  NetworkRemoteConfigProvider,
} from '../remoteconfig/RemoteConfigProvider';
import { InMemoryWebSocketProvider, NativeWebSocketProvider } from '../websocket/WebSocketProvider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert that `obj` has all keys present on `proto`. */
function hasAllKeys<T extends object>(obj: unknown, keys: (keyof T)[]): void {
  for (const key of keys) {
    expect(obj).toHaveProperty(key as string);
  }
}

const STORAGE_PROTOCOL_KEYS: (keyof StorageProvider)[] = ['get', 'set', 'remove', 'clear'];
const AUTH_PROTOCOL_KEYS: (keyof AuthProvider)[] = [
  'state',
  'authenticate',
  'refresh',
  'signOut',
  'subscribe',
];
const ANALYTICS_PROTOCOL_KEYS: (keyof AnalyticsProvider)[] = ['track'];
const NETWORK_PROTOCOL_KEYS: (keyof NetworkClientProtocol)[] = ['execute'];

// ---------------------------------------------------------------------------
// StorageProvider
// ---------------------------------------------------------------------------

describe('ContractCompliance — StorageProvider', () => {
  it('InMemoryStorageProvider implements StorageProvider', () => {
    const provider = new InMemoryStorageProvider();
    hasAllKeys<StorageProvider>(provider, STORAGE_PROTOCOL_KEYS);
  });

  it('InMemoryStorageProvider.get returns Promise', async () => {
    const provider = new InMemoryStorageProvider();
    const result = provider.get(createStorageKey<string>('test.key'));
    expect(result).toBeInstanceOf(Promise);
    const value = await result;
    expect(value).toBeUndefined();
  });

  it('InMemoryStorageProvider.set returns Promise', async () => {
    const provider = new InMemoryStorageProvider();
    const result = provider.set('hello', createStorageKey<string>('test.key'));
    expect(result).toBeInstanceOf(Promise);
    await result; // should not throw
  });
});

// ---------------------------------------------------------------------------
// NetworkClientProtocol
// ---------------------------------------------------------------------------

describe('ContractCompliance — NetworkClientProtocol', () => {
  it('FetchNetworkClient implements NetworkClientProtocol', () => {
    const client = new FetchNetworkClient();
    hasAllKeys<NetworkClientProtocol>(client, NETWORK_PROTOCOL_KEYS);
    expect(typeof client.execute).toBe('function');
  });

  it('FetchNetworkClient.execute returns a Promise', () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode('{}').buffer,
      headers: { forEach: (): void => {} },
    });
    const client = new FetchNetworkClient();
    const req = createNetworkRequest({ url: 'https://example.com', method: 'GET', headers: {} });
    const result = client.execute(req);
    expect(result).toBeInstanceOf(Promise);
    return result.then((r) => {
      expect(typeof r.statusCode).toBe('number');
    });
  });
});

// ---------------------------------------------------------------------------
// AuthProvider
// ---------------------------------------------------------------------------

describe('ContractCompliance — AuthProvider', () => {
  it('JWTAuthProvider implements AuthProvider', () => {
    const storage = new InMemoryStorageProvider();
    const provider = new JWTAuthProvider({ storage });
    hasAllKeys<AuthProvider>(provider, AUTH_PROTOCOL_KEYS);
  });

  it('JWTAuthProvider.state is an AuthState object', () => {
    const storage = new InMemoryStorageProvider();
    const provider = new JWTAuthProvider({ storage });
    expect(provider.state).toBeDefined();
    expect(provider.state.kind).toBe('unauthenticated');
  });

  it('JWTAuthProvider.subscribe returns a function', () => {
    const storage = new InMemoryStorageProvider();
    const provider = new JWTAuthProvider({ storage });
    const unsub = provider.subscribe(() => {});
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

// ---------------------------------------------------------------------------
// AnalyticsProvider
// ---------------------------------------------------------------------------

describe('ContractCompliance — AnalyticsProvider', () => {
  it('ConsoleAnalyticsProvider implements AnalyticsProvider', () => {
    const provider = new ConsoleAnalyticsProvider();
    hasAllKeys<AnalyticsProvider>(provider, ANALYTICS_PROTOCOL_KEYS);
  });

  it('InMemoryAnalyticsProvider implements AnalyticsProvider', () => {
    const provider = new InMemoryAnalyticsProvider();
    hasAllKeys<AnalyticsProvider>(provider, ANALYTICS_PROTOCOL_KEYS);
  });

  it('ConsoleAnalyticsProvider.track does not throw', () => {
    const provider = new ConsoleAnalyticsProvider();
    expect(() => provider.track(createAnalyticsEvent('test_event'))).not.toThrow();
  });

  it('InMemoryAnalyticsProvider.track records an event', () => {
    const provider = new InMemoryAnalyticsProvider();
    provider.track(createAnalyticsEvent('page_view', { screen: 'Home' }));
    expect(provider.events).toHaveLength(1);
    expect(provider.events[0].name).toBe('page_view');
  });
});

// ---------------------------------------------------------------------------
// CrashReporter
// ---------------------------------------------------------------------------

describe('ContractCompliance — CrashReporter', () => {
  it('ConsoleCrashReporter can be instantiated and exposes reportCrash', () => {
    const reporter = new ConsoleCrashReporter();
    expect(typeof reporter.reportCrash).toBe('function');
    expect(typeof reporter.recordError).toBe('function');
  });

  it('InMemoryCrashReporter can be instantiated', () => {
    const reporter = new InMemoryCrashReporter();
    expect(typeof reporter.reportCrash).toBe('function');
    expect(typeof reporter.recordError).toBe('function');
  });

  it('InMemoryCrashReporter.reportCrash stores a crash entry', () => {
    const reporter = new InMemoryCrashReporter();
    reporter.reportCrash('fatal crash message');
    expect(reporter.crashes).toHaveLength(1);
    expect(reporter.crashes[0].message).toBe('fatal crash message');
  });

  it('InMemoryCrashReporter.recordError stores an error entry', () => {
    const reporter = new InMemoryCrashReporter();
    reporter.recordError(new Error('non-fatal'));
    expect(reporter.errors).toHaveLength(1);
    expect(reporter.errors[0].error.message).toBe('non-fatal');
  });
});

// ---------------------------------------------------------------------------
// DeviceProvider
// ---------------------------------------------------------------------------

describe('ContractCompliance — DeviceProvider', () => {
  it('NodeDeviceProvider can be instantiated with a storage provider', () => {
    const storage = new InMemoryStorageProvider();
    const provider = new NodeDeviceProvider({ storage });
    expect(provider).toBeDefined();
  });

  it('NodeDeviceProvider.deviceId returns a non-empty string', async () => {
    const storage = new InMemoryStorageProvider();
    const provider = new NodeDeviceProvider({ storage });
    const id = await provider.deviceId;
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('NodeDeviceProvider.platform returns a string', () => {
    const storage = new InMemoryStorageProvider();
    const provider = new NodeDeviceProvider({ storage });
    expect(typeof provider.platform).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// FileProvider
// ---------------------------------------------------------------------------

describe('ContractCompliance — FileProvider', () => {
  it('NodeFileProvider can be instantiated', () => {
    const provider = new NodeFileProvider();
    expect(provider).toBeDefined();
  });

  it('NodeFileProvider exposes read, write, delete methods', () => {
    const provider = new NodeFileProvider();
    expect(typeof provider.read).toBe('function');
    expect(typeof provider.write).toBe('function');
    expect(typeof provider.delete).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// PushProvider
// ---------------------------------------------------------------------------

describe('ContractCompliance — PushProvider', () => {
  it('InMemoryPushProvider can be instantiated', () => {
    const provider = new InMemoryPushProvider();
    expect(provider).toBeDefined();
  });

  it('InMemoryPushProvider.requestPermission returns Promise<boolean>', async () => {
    const provider = new InMemoryPushProvider();
    const result = await provider.requestPermission();
    expect(typeof result).toBe('boolean');
  });

  it('InMemoryPushProvider.onNotification returns an unsubscribe function', () => {
    const provider = new InMemoryPushProvider();
    const unsub = provider.onNotification(() => {});
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

// ---------------------------------------------------------------------------
// RemoteConfigProvider
// ---------------------------------------------------------------------------

describe('ContractCompliance — RemoteConfigProvider', () => {
  it('InMemoryRemoteConfigProvider can be instantiated', () => {
    const provider = new InMemoryRemoteConfigProvider();
    expect(provider).toBeDefined();
    expect(typeof provider.fetch).toBe('function');
    expect(typeof provider.getString).toBe('function');
    expect(typeof provider.getNumber).toBe('function');
    expect(typeof provider.getBoolean).toBe('function');
  });

  it('InMemoryRemoteConfigProvider.fetch returns Promise<void>', async () => {
    const provider = new InMemoryRemoteConfigProvider();
    const result = provider.fetch();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });

  it('NetworkRemoteConfigProvider can be instantiated with required options', () => {
    const mockNetwork: NetworkClientProtocol = {
      execute: jest.fn(),
      dispose: jest.fn(),
    };
    const provider = new NetworkRemoteConfigProvider({
      configUrl: 'https://example.com/config',
      network: mockNetwork,
    });
    expect(provider).toBeDefined();
    expect(typeof provider.fetch).toBe('function');
    expect(provider.lastFetchTime).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// WebSocketProvider
// ---------------------------------------------------------------------------

describe('ContractCompliance — WebSocketProvider', () => {
  it('InMemoryWebSocketProvider can be instantiated', () => {
    const provider = new InMemoryWebSocketProvider();
    expect(provider).toBeDefined();
    expect(provider.connectionState).toBe('disconnected');
  });

  it('InMemoryWebSocketProvider exposes required protocol methods', () => {
    const provider = new InMemoryWebSocketProvider();
    expect(typeof provider.connect).toBe('function');
    expect(typeof provider.send).toBe('function');
    expect(typeof provider.sendBinary).toBe('function');
    expect(typeof provider.onMessage).toBe('function');
    expect(typeof provider.onStateChange).toBe('function');
    expect(typeof provider.disconnect).toBe('function');
  });

  it('InMemoryWebSocketProvider.connect resolves to void', async () => {
    const provider = new InMemoryWebSocketProvider();
    const result = provider.connect('ws://localhost');
    expect(result).toBeInstanceOf(Promise);
    const value = await result;
    expect(value).toBeUndefined();
    expect(provider.connectionState).toBe('connected');
  });

  it('NativeWebSocketProvider can be instantiated', () => {
    const provider = new NativeWebSocketProvider();
    expect(provider).toBeDefined();
    expect(provider.connectionState).toBe('disconnected');
    expect(typeof provider.connect).toBe('function');
    expect(typeof provider.send).toBe('function');
    expect(typeof provider.sendBinary).toBe('function');
  });
});
