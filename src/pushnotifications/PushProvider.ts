/**
 * Payload delivered with an incoming push notification.
 */
export interface NotificationPayload {
  /** Human-readable title displayed in the notification banner. */
  readonly title: string;
  /** Body copy of the notification. */
  readonly body: string;
  /** Arbitrary key-value data attached by the server. */
  readonly data: Record<string, unknown>;
}

/** Handler called when a push notification is received. */
export type NotificationHandler = (payload: NotificationPayload) => void;

/**
 * Contract for push-notification token management and notification handling.
 *
 * In a real React Native application this would delegate to the native push
 * notification module (APNs / FCM).  The {@link InMemoryPushProvider} below
 * is a pure-JS stub suitable for testing and server-side rendering.
 */
export interface PushProvider {
  /**
   * Requests push-notification permission from the OS.
   * Returns `true` when permission is granted, `false` otherwise.
   */
  requestPermission(): Promise<boolean>;

  /**
   * Registers a device push token obtained from the OS / FCM / APNs SDK.
   * @param token  Opaque device token string.
   */
  registerToken(token: string): void;

  /**
   * Unregisters the current device token.  Subsequent calls to
   * {@link deviceToken} will return `null`.
   */
  unregisterToken(): void;

  /**
   * The most recently registered push token, or `null` when not yet
   * registered or after {@link unregisterToken} has been called.
   */
  readonly deviceToken: string | null;

  /**
   * Registers a handler that is invoked whenever an incoming push
   * notification is received.
   * @param handler  Callback receiving the {@link NotificationPayload}.
   * @returns        An unsubscribe function; call it to stop receiving events.
   */
  onNotification(handler: NotificationHandler): () => void;

  /**
   * Simulates receiving a push notification.  Useful in tests and during
   * manual QA when a real push cannot easily be triggered.
   *
   * @param payload  The notification to deliver to all registered handlers.
   */
  simulateNotification(payload: NotificationPayload): void;
}

/**
 * In-memory stub implementation of {@link PushProvider}.
 *
 * - Permission requests always succeed.
 * - Tokens are stored in a plain field.
 * - Notifications can be dispatched programmatically via
 *   {@link simulateNotification}.
 */
export class InMemoryPushProvider implements PushProvider {
  private _token: string | null = null;
  private readonly _handlers = new Set<NotificationHandler>();

  /**
   * Stub permission request — always resolves to `true`.
   */
  async requestPermission(): Promise<boolean> {
    return true;
  }

  /**
   * Stores `token` as the current device push token.
   */
  registerToken(token: string): void {
    this._token = token;
  }

  /**
   * Clears the current device push token.
   */
  unregisterToken(): void {
    this._token = null;
  }

  /** The current device push token, or `null`. */
  get deviceToken(): string | null {
    return this._token;
  }

  /**
   * Registers `handler` for incoming notifications.
   * @returns  An unsubscribe function.
   */
  onNotification(handler: NotificationHandler): () => void {
    this._handlers.add(handler);
    return (): void => {
      this._handlers.delete(handler);
    };
  }

  /**
   * Delivers `payload` synchronously to all registered handlers.
   */
  simulateNotification(payload: NotificationPayload): void {
    this._handlers.forEach((h) => h(payload));
  }
}
