/** Errors thrown by {@link JWTAuthProvider}. */
export class AuthError extends Error {
  static readonly refreshNotImplemented = new AuthError('Token refresh not implemented');
  private constructor(message: string) { super(message); this.name = 'AuthError'; }
}

/**
 * Defines the contract for authentication and token management.
 */
export interface AuthProvider {
  /** The current access token, or null if unauthenticated. */
  readonly accessToken: string | null;
  /** Stores the given `token` as the current access token. */
  storeToken(token: string): void;
  /** Clears the current access token. */
  clearToken(): void;
  /** Refreshes the access token. Returns the new token or throws on failure. */
  refreshToken(): Promise<string>;
}

/**
 * An {@link AuthProvider} that stores a JWT token in memory with a stub refresh.
 */
export class JWTAuthProvider implements AuthProvider {
  private _accessToken: string | null;

  constructor(token: string | null = null) {
    this._accessToken = token;
  }

  get accessToken(): string | null { return this._accessToken; }

  storeToken(token: string): void { this._accessToken = token; }

  clearToken(): void { this._accessToken = null; }

  async refreshToken(): Promise<string> {
    throw AuthError.refreshNotImplemented;
  }
}
