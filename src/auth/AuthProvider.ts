import {
  AuthState,
  SyzygyErrorCode,
  createStorageKey,
  createSyzygyTimestamp,
  isExpired,
} from 'syzygy-foundation-rn';
import type {
  AuthProvider,
  AuthStateListener,
  AuthToken,
  NetworkClientProtocol,
  StorageProvider,
} from 'syzygy-foundation-rn';

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const ACCESS_TOKEN_KEY = createStorageKey<string>('syzygy.auth.accessToken');
const REFRESH_TOKEN_KEY = createStorageKey<string>('syzygy.auth.refreshToken');
const EXPIRES_AT_KEY = createStorageKey<number>('syzygy.auth.expiresAt');

// ---------------------------------------------------------------------------
// AuthError
// ---------------------------------------------------------------------------

/** Errors raised by {@link JWTAuthProvider}. */
export class AuthError extends Error {
  readonly code: SyzygyErrorCode;

  private constructor(message: string, code: SyzygyErrorCode) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }

  static refreshFailed(reason: string): AuthError {
    return new AuthError(`Token refresh failed: ${reason}`, SyzygyErrorCode.unauthenticated);
  }

  static notAuthenticated(): AuthError {
    return new AuthError('Not authenticated', SyzygyErrorCode.unauthenticated);
  }
}

// ---------------------------------------------------------------------------
// JWTAuthProvider
// ---------------------------------------------------------------------------

/** Options for {@link JWTAuthProvider}. */
export interface JWTAuthProviderOptions {
  /** The storage provider used to persist tokens between sessions. */
  storage: StorageProvider;
  /**
   * Network client used when refreshing tokens.
   * The provider calls `POST <refreshUrl>` with a JSON body
   * `{ refreshToken }` and expects a JSON response with `accessToken` and
   * optional `refreshToken` and `expiresIn` (seconds).
   */
  network?: NetworkClientProtocol;
  /** The URL to call for token refresh. Required when `network` is provided. */
  refreshUrl?: string;
}

/**
 * JWT-based implementation of {@link AuthProvider}.
 *
 * Responsibilities:
 * - Stores access/refresh tokens in the injected {@link StorageProvider}.
 * - Manages {@link AuthState} and notifies subscribers on every state change.
 * - Detects token expiry by inspecting `expiresAt` (persisted as a Unix ms
 *   timestamp) and the JWT `exp` claim (decoded from the base-64 payload
 *   when no explicit `expiresAt` is supplied).
 * - Performs a token refresh via the injected {@link NetworkClientProtocol}
 *   when `refresh()` is called.
 */
export class JWTAuthProvider implements AuthProvider {
  private _state: AuthState;
  private readonly _listeners = new Set<AuthStateListener>();
  private readonly storage: StorageProvider;
  private readonly network?: NetworkClientProtocol;
  private readonly refreshUrl?: string;

  constructor(options: JWTAuthProviderOptions) {
    this.storage = options.storage;
    this.network = options.network;
    this.refreshUrl = options.refreshUrl;
    this._state = AuthState.unauthenticated();
  }

  // ---------------------------------------------------------------------------
  // AuthProvider interface
  // ---------------------------------------------------------------------------

  /** The current authentication state. */
  get state(): AuthState {
    return this._state;
  }

  /**
   * Registers a listener that is called whenever the auth state changes.
   * Returns an unsubscribe function.
   */
  subscribe(listener: AuthStateListener): () => void {
    this._listeners.add(listener);
    return (): void => {
      this._listeners.delete(listener);
    };
  }

  /**
   * Transitions the provider to the `authenticated` state, persists the token,
   * and notifies all subscribers.
   */
  authenticate(token: AuthToken): void {
    void this._persistToken(token);
    this._setState(AuthState.authenticated(token));
  }

  /**
   * Attempts to refresh the current access token via the configured network
   * client.  Transitions to `refreshing` while in-flight and back to
   * `authenticated` (or `unauthenticated` on failure).
   *
   * @throws {@link AuthError} when no refresh token is available or the
   *         network call fails.
   */
  async refresh(): Promise<AuthToken> {
    const currentToken = AuthState.token(this._state);
    if (!currentToken?.refreshToken) {
      throw AuthError.notAuthenticated();
    }

    this._setState(AuthState.refreshing());

    if (!this.network || !this.refreshUrl) {
      // Stub: no network configured — restore previous state and reject
      this._setState(AuthState.unauthenticated());
      throw AuthError.refreshFailed('No network client configured');
    }

    const body = new TextEncoder().encode(
      JSON.stringify({ refreshToken: currentToken.refreshToken }),
    );

    const { createNetworkRequest } = await import('syzygy-foundation-rn');
    const request = createNetworkRequest({
      url: this.refreshUrl,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    try {
      const response = await this.network.execute(request);
      const json = JSON.parse(new TextDecoder().decode(response.data)) as {
        accessToken: string;
        refreshToken?: string;
        expiresIn?: number;
      };

      const newToken: AuthToken = {
        accessToken: json.accessToken,
        refreshToken: json.refreshToken ?? currentToken.refreshToken,
        expiresAt: json.expiresIn
          ? createSyzygyTimestamp(Date.now() + json.expiresIn * 1000)
          : undefined,
      };

      this.authenticate(newToken);
      return newToken;
    } catch (err) {
      // Clear persisted tokens so a stale session is not accidentally restored
      void this._clearTokens();
      this._setState(AuthState.unauthenticated());
      throw AuthError.refreshFailed((err as Error).message);
    }
  }

  /**
   * Returns whether biometric authentication is available on this device.
   * Always returns false in the stub. Wire to react-native-biometrics or expo-local-authentication
   * for real Face ID / Touch ID / fingerprint support.
   */
  async canUseBiometric(): Promise<boolean> {
    return false;
  }

  /**
   * Authenticates the user with biometrics.
   * @param _reason - The reason shown to the user in the system prompt.
   * @returns The resulting AuthState — 'authenticated' if successful, 'unauthenticated' otherwise.
   * Stub always returns unauthenticated. Wire to react-native-biometrics for real usage.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async authenticateWithBiometric(_reason: string): Promise<AuthState> {
    return AuthState.unauthenticated();
  }

  /**
   * Signs the user out: clears persisted tokens and transitions to
   * `unauthenticated`.
   */
  signOut(): void {
    void this._clearTokens();
    this._setState(AuthState.unauthenticated());
  }

  // ---------------------------------------------------------------------------
  // Restore from storage (call this on app start)
  // ---------------------------------------------------------------------------

  /**
   * Restores a previously persisted session from storage.
   * Should be called once during application start-up.
   */
  async restore(): Promise<void> {
    const accessToken = await this.storage.get(ACCESS_TOKEN_KEY);
    if (!accessToken) {
      this._setState(AuthState.unauthenticated());
      return;
    }

    const refreshToken = await this.storage.get(REFRESH_TOKEN_KEY);
    const expiresAtMs = await this.storage.get(EXPIRES_AT_KEY);

    const token: AuthToken = {
      accessToken,
      refreshToken,
      expiresAt:
        expiresAtMs !== undefined
          ? createSyzygyTimestamp(expiresAtMs)
          : extractExpFromJwt(accessToken),
    };

    if (isExpired(token)) {
      this._setState(AuthState.expired(token));
    } else {
      this._setState(AuthState.authenticated(token));
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _setState(next: AuthState): void {
    this._state = next;
    this._listeners.forEach((l) => l(next));
  }

  private async _persistToken(token: AuthToken): Promise<void> {
    await this.storage.set(token.accessToken, ACCESS_TOKEN_KEY);
    if (token.refreshToken) {
      await this.storage.set(token.refreshToken, REFRESH_TOKEN_KEY);
    }
    if (token.expiresAt) {
      await this.storage.set(token.expiresAt.millisecondsSinceEpoch, EXPIRES_AT_KEY);
    }
  }

  private async _clearTokens(): Promise<void> {
    await this.storage.remove(ACCESS_TOKEN_KEY);
    await this.storage.remove(REFRESH_TOKEN_KEY);
    await this.storage.remove(EXPIRES_AT_KEY);
  }
}

// ---------------------------------------------------------------------------
// JWT utilities
// ---------------------------------------------------------------------------

/**
 * Decodes the `exp` claim from a JWT access token without verifying the
 * signature.  Returns a timestamp object or `undefined` when decoding fails.
 *
 * @param jwt  A raw JWT string (`header.payload.signature`).
 */
export function extractExpFromJwt(
  jwt: string,
): import('syzygy-foundation-rn').SyzygyTimestamp | undefined {
  try {
    const parts = jwt.split('.');
    if (parts.length < 2) return undefined;

    const payload = parts[1];
    // Node.js / React Native: atob or Buffer
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const decoded =
      typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('utf8');

    const parsed = JSON.parse(decoded) as { exp?: number };
    if (typeof parsed.exp !== 'number') return undefined;
    return createSyzygyTimestamp(parsed.exp * 1000);
  } catch {
    return undefined;
  }
}
