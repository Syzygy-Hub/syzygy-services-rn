/**
 * Defines the contract for push notification token registration.
 */
export interface PushProvider {
  /** Registers the device with the given push `token`. */
  registerToken(token: string): void;
  /** The current push token, or null if not registered. */
  readonly deviceToken: string | null;
}

/**
 * A {@link PushProvider} that stores a push token in memory.
 */
export class InMemoryPushProvider implements PushProvider {
  private _token: string | null = null;

  registerToken(token: string): void { this._token = token; }

  get deviceToken(): string | null { return this._token; }
}
