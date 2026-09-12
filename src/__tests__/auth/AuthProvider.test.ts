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

  it('AuthState helpers work correctly', () => {
    const token = makeToken();
    expect(AuthState.isAuthenticated(AuthState.authenticated(token))).toBe(true);
    expect(AuthState.isAuthenticated(AuthState.unauthenticated())).toBe(false);
    expect(AuthState.token(AuthState.authenticated(token))).toEqual(token);
    expect(AuthState.token(AuthState.unauthenticated())).toBeUndefined();
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
