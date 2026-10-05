import { AuthState, createSyzygyTimestamp } from 'syzygy-foundation-rn';
import type { AuthToken } from 'syzygy-foundation-rn';

import { AuthError, JWTAuthProvider, extractExpFromJwt } from '../../auth/AuthProvider';
import { InMemoryStorageProvider } from '../../persistence/StorageProvider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToken(overrides: Partial<AuthToken> = {}): AuthToken {
  return {
    accessToken: 'access-abc',
    refreshToken: 'refresh-xyz',
    ...overrides,
  };
}

function makeExpiredToken(): AuthToken {
  return makeToken({
    expiresAt: createSyzygyTimestamp(Date.now() - 10_000),
  });
}

function makeValidToken(): AuthToken {
  return makeToken({
    expiresAt: createSyzygyTimestamp(Date.now() + 60_000),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JWTAuthProvider', () => {
  it('starts in unauthenticated state', () => {
    const storage = new InMemoryStorageProvider();
    const provider = new JWTAuthProvider({ storage });
    expect(provider.state.kind).toBe('unauthenticated');
  });

  it('authenticate transitions to authenticated', () => {
    const storage = new InMemoryStorageProvider();
    const provider = new JWTAuthProvider({ storage });
    provider.authenticate(makeToken());
    expect(provider.state.kind).toBe('authenticated');
  });

  it('authenticate persists the access token in storage', async () => {
    const storage = new InMemoryStorageProvider();
    const provider = new JWTAuthProvider({ storage });
    const token = makeToken({ accessToken: 'persisted-token' });
    provider.authenticate(token);
    // Allow async persistence to complete
    await new Promise((r) => setTimeout(r, 0));
    const stored = await storage.get({ identifier: 'syzygy.auth.accessToken' });
    expect(stored).toBe('persisted-token');
  });

  it('signOut transitions to unauthenticated and clears token', async () => {
    const storage = new InMemoryStorageProvider();
    const provider = new JWTAuthProvider({ storage });
    provider.authenticate(makeToken());
    provider.signOut();
    await new Promise((r) => setTimeout(r, 0));
    expect(provider.state.kind).toBe('unauthenticated');
    const stored = await storage.get({ identifier: 'syzygy.auth.accessToken' });
    expect(stored).toBeUndefined();
  });

  it('subscribe notifies listener on state change', () => {
    const storage = new InMemoryStorageProvider();
    const provider = new JWTAuthProvider({ storage });
    const states: string[] = [];
    provider.subscribe((s) => states.push(s.kind));
    provider.authenticate(makeToken());
    provider.signOut();
    expect(states).toEqual(['authenticated', 'unauthenticated']);
  });

  it('unsubscribe stops notifications', () => {
    const storage = new InMemoryStorageProvider();
    const provider = new JWTAuthProvider({ storage });
    const states: string[] = [];
    const unsub = provider.subscribe((s) => states.push(s.kind));
    provider.authenticate(makeToken());
    unsub();
    provider.signOut();
    expect(states).toEqual(['authenticated']); // signOut not received
  });

  it('restore loads a valid token from storage', async () => {
    const storage = new InMemoryStorageProvider();
    const provider = new JWTAuthProvider({ storage });
    provider.authenticate(makeValidToken());
    await new Promise((r) => setTimeout(r, 0));

    const provider2 = new JWTAuthProvider({ storage });
    await provider2.restore();
    expect(provider2.state.kind).toBe('authenticated');
  });

  it('restore transitions to expired when token is past expiresAt', async () => {
    const storage = new InMemoryStorageProvider();
    const provider = new JWTAuthProvider({ storage });
    provider.authenticate(makeExpiredToken());
    await new Promise((r) => setTimeout(r, 0));

    const provider2 = new JWTAuthProvider({ storage });
    await provider2.restore();
    expect(provider2.state.kind).toBe('expired');
  });

  it('restore transitions to unauthenticated when no token in storage', async () => {
    const storage = new InMemoryStorageProvider();
    const provider = new JWTAuthProvider({ storage });
    await provider.restore();
    expect(provider.state.kind).toBe('unauthenticated');
  });

  it('refresh without network config throws AuthError', async () => {
    const storage = new InMemoryStorageProvider();
    const provider = new JWTAuthProvider({ storage });
    provider.authenticate(makeToken());
    await expect(provider.refresh()).rejects.toBeInstanceOf(AuthError);
  });

  it('refresh without an authenticated token throws AuthError', async () => {
    const storage = new InMemoryStorageProvider();
    const provider = new JWTAuthProvider({ storage });
    await expect(provider.refresh()).rejects.toBeInstanceOf(AuthError);
  });

  it('canUseBiometric() returns false', () => {
    const storage = new InMemoryStorageProvider();
    const provider = new JWTAuthProvider({ storage });
    expect(provider.canUseBiometric()).toBe(false);
  });

  it('authenticateWithBiometric() returns false (stub)', async () => {
    const storage = new InMemoryStorageProvider();
    const provider = new JWTAuthProvider({ storage });
    const result = await provider.authenticateWithBiometric('Verify identity');
    expect(result).toBe(false);
  });

  it('AuthState helpers work correctly', () => {
    const token = makeToken();
    expect(AuthState.isAuthenticated(AuthState.authenticated(token))).toBe(true);
    expect(AuthState.isAuthenticated(AuthState.unauthenticated())).toBe(false);
    expect(AuthState.token(AuthState.authenticated(token))).toEqual(token);
    expect(AuthState.token(AuthState.unauthenticated())).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Real token-refresh flow (network-wired)
// ---------------------------------------------------------------------------

describe('JWTAuthProvider — real token-refresh flow', () => {
  function makeNetworkClient(responseBody: Record<string, unknown>, statusCode = 200) {
    return {
      execute: jest.fn().mockResolvedValue({
        statusCode,
        data: new TextEncoder().encode(JSON.stringify(responseBody)),
        headers: { 'content-type': 'application/json' },
        isSuccess: statusCode >= 200 && statusCode < 300,
        isClientError: statusCode >= 400 && statusCode < 500,
        isServerError: statusCode >= 500,
      }),
      dispose: jest.fn(),
    };
  }

  it('refresh calls the network with the refresh token', async () => {
    const storage = new InMemoryStorageProvider();
    const network = makeNetworkClient({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    const provider = new JWTAuthProvider({
      storage,
      network,
      refreshUrl: 'https://api.example.com/auth/refresh',
    });
    provider.authenticate(makeToken({ refreshToken: 'old-refresh' }));

    await provider.refresh();

    expect(network.execute).toHaveBeenCalledTimes(1);
    const req = (network.execute as jest.Mock).mock.calls[0][0] as {
      url: string;
      body: Uint8Array;
    };
    expect(req.url).toBe('https://api.example.com/auth/refresh');
    const body = JSON.parse(new TextDecoder().decode(req.body)) as { refreshToken: string };
    expect(body.refreshToken).toBe('old-refresh');
  });

  it('refresh returns new AuthToken with updated accessToken', async () => {
    const storage = new InMemoryStorageProvider();
    const network = makeNetworkClient({ accessToken: 'brand-new-access', expiresIn: 3600 });
    const provider = new JWTAuthProvider({
      storage,
      network,
      refreshUrl: 'https://api.example.com/auth/refresh',
    });
    provider.authenticate(makeToken());

    const newToken = await provider.refresh();

    expect(newToken.accessToken).toBe('brand-new-access');
    expect(newToken.expiresAt).toBeDefined();
  });

  it('refresh result is persisted to StorageProvider', async () => {
    const storage = new InMemoryStorageProvider();
    const network = makeNetworkClient({
      accessToken: 'persisted-new',
      refreshToken: 'persisted-rt',
    });
    const provider = new JWTAuthProvider({
      storage,
      network,
      refreshUrl: 'https://api.example.com/auth/refresh',
    });
    provider.authenticate(makeToken());

    await provider.refresh();
    await new Promise((r) => setTimeout(r, 0));

    const stored = await storage.get({ identifier: 'syzygy.auth.accessToken' });
    expect(stored).toBe('persisted-new');
    const storedRt = await storage.get({ identifier: 'syzygy.auth.refreshToken' });
    expect(storedRt).toBe('persisted-rt');
  });

  it('refresh transitions to authenticated after success', async () => {
    const storage = new InMemoryStorageProvider();
    const network = makeNetworkClient({ accessToken: 'refreshed-access' });
    const provider = new JWTAuthProvider({
      storage,
      network,
      refreshUrl: 'https://api.example.com/auth/refresh',
    });
    provider.authenticate(makeToken());
    const states: string[] = [];
    provider.subscribe((s) => states.push(s.kind));

    await provider.refresh();

    expect(provider.state.kind).toBe('authenticated');
    // refreshing → authenticated
    expect(states).toContain('refreshing');
    expect(states[states.length - 1]).toBe('authenticated');
  });

  it('refresh() rejects with AuthError when server returns 4xx/5xx response body', async () => {
    const storage = new InMemoryStorageProvider();
    const network = {
      execute: jest.fn().mockRejectedValue(new Error('403 Forbidden')),
      dispose: jest.fn(),
    };
    const provider = new JWTAuthProvider({
      storage,
      network,
      refreshUrl: 'https://api.example.com/auth/refresh',
    });
    provider.authenticate(makeToken({ refreshToken: 'rt-xyz' }));

    await expect(provider.refresh()).rejects.toBeInstanceOf(AuthError);
    expect(provider.state.kind).toBe('unauthenticated');
  });

  it('refresh failure clears tokens and emits unauthenticated', async () => {
    const storage = new InMemoryStorageProvider();
    const network = {
      execute: jest.fn().mockRejectedValue(new Error('network error')),
      dispose: jest.fn(),
    };
    const provider = new JWTAuthProvider({
      storage,
      network,
      refreshUrl: 'https://api.example.com/auth/refresh',
    });
    provider.authenticate(makeToken());
    await new Promise((r) => setTimeout(r, 0)); // let persist complete

    await expect(provider.refresh()).rejects.toBeInstanceOf(AuthError);

    expect(provider.state.kind).toBe('unauthenticated');
    await new Promise((r) => setTimeout(r, 0));
    const stored = await storage.get({ identifier: 'syzygy.auth.accessToken' });
    expect(stored).toBeUndefined();
  });

  it('auto-refresh: restore() on expired JWT detects exp claim', async () => {
    // Build a real JWT with exp in the past
    function buildJwtWithExp(expSec: number): string {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ exp: expSec })).toString('base64url');
      return `${header}.${payload}.sig`;
    }

    const expiredAccessToken = buildJwtWithExp(Math.floor(Date.now() / 1000) - 100);
    const storage = new InMemoryStorageProvider();
    // Manually seed storage with expired token (no explicit expiresAt)
    await storage.set(expiredAccessToken, { identifier: 'syzygy.auth.accessToken' });
    await storage.set('rt-xyz', { identifier: 'syzygy.auth.refreshToken' });

    const provider = new JWTAuthProvider({ storage });
    await provider.restore();

    // Should detect the token is expired via JWT exp claim
    expect(provider.state.kind).toBe('expired');
  });
});

// ---------------------------------------------------------------------------
// extractExpFromJwt
// ---------------------------------------------------------------------------

describe('extractExpFromJwt', () => {
  function buildJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${body}.sig`;
  }

  it('extracts the exp claim as milliseconds', () => {
    const expSec = Math.floor(Date.now() / 1000) + 3600;
    const jwt = buildJwt({ exp: expSec });
    const result = extractExpFromJwt(jwt);
    expect(result?.millisecondsSinceEpoch).toBe(expSec * 1000);
  });

  it('returns undefined when exp is missing', () => {
    const jwt = buildJwt({ sub: 'user-1' });
    expect(extractExpFromJwt(jwt)).toBeUndefined();
  });

  it('returns undefined for a malformed token', () => {
    expect(extractExpFromJwt('not.a')).toBeUndefined();
    expect(extractExpFromJwt('')).toBeUndefined();
  });
});
