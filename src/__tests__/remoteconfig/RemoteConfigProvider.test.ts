import type { NetworkClientProtocol, NetworkRequest, NetworkResponse } from 'syzygy-foundation-rn';

import {
  InMemoryRemoteConfigProvider,
  NetworkRemoteConfigProvider,
} from '../../remoteconfig/RemoteConfigProvider';

// ---------------------------------------------------------------------------
// InMemoryRemoteConfigProvider
// ---------------------------------------------------------------------------

describe('InMemoryRemoteConfigProvider', () => {
  it('returns undefined for a missing key with no default', () => {
    const provider = new InMemoryRemoteConfigProvider();
    expect(provider.getString('missing')).toBeUndefined();
    expect(provider.getNumber('missing')).toBeUndefined();
    expect(provider.getBoolean('missing')).toBeUndefined();
  });

  it('returns the default argument when key is missing', () => {
    const provider = new InMemoryRemoteConfigProvider();
    expect(provider.getString('x', 'fallback')).toBe('fallback');
    expect(provider.getNumber('x', 7)).toBe(7);
    expect(provider.getBoolean('x', true)).toBe(true);
  });

  it('round-trips a string value', () => {
    const provider = new InMemoryRemoteConfigProvider({ greeting: 'world' });
    expect(provider.getString('greeting')).toBe('world');
  });

  it('round-trips a number value', () => {
    const provider = new InMemoryRemoteConfigProvider({ count: 42 });
    expect(provider.getNumber('count')).toBe(42);
  });

  it('round-trips a boolean value', () => {
    const provider = new InMemoryRemoteConfigProvider({ flag: false });
    expect(provider.getBoolean('flag')).toBe(false);
  });

  it('setValue updates a stored value', () => {
    const provider = new InMemoryRemoteConfigProvider({ x: 'old' });
    provider.setValue('x', 'new');
    expect(provider.getString('x')).toBe('new');
  });

  it('lastFetchTime is undefined before fetch', () => {
    const provider = new InMemoryRemoteConfigProvider();
    expect(provider.lastFetchTime).toBeUndefined();
  });

  it('fetch sets lastFetchTime', async () => {
    const provider = new InMemoryRemoteConfigProvider();
    const before = Date.now();
    await provider.fetch();
    expect(provider.lastFetchTime).toBeGreaterThanOrEqual(before);
  });

  it('getBoolean returns undefined for a string value', () => {
    const provider = new InMemoryRemoteConfigProvider({ notBool: 'yes' });
    expect(provider.getBoolean('notBool')).toBeUndefined();
  });

  it('getString returns undefined for a number value', () => {
    const provider = new InMemoryRemoteConfigProvider({ count: 5 });
    expect(provider.getString('count')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// NetworkRemoteConfigProvider
// ---------------------------------------------------------------------------

function makeNetworkClient(responseBody: Record<string, unknown>): NetworkClientProtocol {
  return {
    execute: async (_req: NetworkRequest): Promise<NetworkResponse> => {
      const data = new TextEncoder().encode(JSON.stringify(responseBody));
      return {
        statusCode: 200,
        data,
        headers: { 'content-type': 'application/json' },
        isSuccess: true,
        isClientError: false,
        isServerError: false,
      };
    },
  };
}

describe('NetworkRemoteConfigProvider', () => {
  it('lastFetchTime is undefined before fetch', () => {
    const network = makeNetworkClient({});
    const provider = new NetworkRemoteConfigProvider({
      configUrl: 'https://example.com/config',
      network,
    });
    expect(provider.lastFetchTime).toBeUndefined();
  });

  it('fetch populates the cache and sets lastFetchTime', async () => {
    const network = makeNetworkClient({ featureFlag: true, title: 'Hello', retries: 3 });
    const provider = new NetworkRemoteConfigProvider({
      configUrl: 'https://example.com/config',
      network,
    });
    const before = Date.now();
    await provider.fetch();
    expect(provider.lastFetchTime).toBeGreaterThanOrEqual(before);
    expect(provider.getBoolean('featureFlag')).toBe(true);
    expect(provider.getString('title')).toBe('Hello');
    expect(provider.getNumber('retries')).toBe(3);
  });

  it('defaults are used before fetch', () => {
    const network = makeNetworkClient({});
    const provider = new NetworkRemoteConfigProvider({
      configUrl: 'https://example.com/config',
      network,
      defaults: { appName: 'Syzygy', maxItems: 10 },
    });
    expect(provider.getString('appName')).toBe('Syzygy');
    expect(provider.getNumber('maxItems')).toBe(10);
  });

  it('remote values override defaults after fetch', async () => {
    const network = makeNetworkClient({ maxItems: 99 });
    const provider = new NetworkRemoteConfigProvider({
      configUrl: 'https://example.com/config',
      network,
      defaults: { maxItems: 10 },
    });
    await provider.fetch();
    expect(provider.getNumber('maxItems')).toBe(99);
  });

  it('returns undefined for a missing key with no default', async () => {
    const network = makeNetworkClient({});
    const provider = new NetworkRemoteConfigProvider({
      configUrl: 'https://example.com/config',
      network,
    });
    await provider.fetch();
    expect(provider.getString('absent')).toBeUndefined();
  });
});
