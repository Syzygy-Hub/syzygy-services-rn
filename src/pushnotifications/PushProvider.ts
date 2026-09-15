/**
 * Payload delivered with an incoming push notification.
 *
 * ## Real FCM / APNs Integration
 *
 * ### Firebase Cloud Messaging (Android + iOS)
 * 1. Install `@react-native-firebase/app` and `@react-native-firebase/messaging`.
 * 2. Follow the Firebase console setup to download `google-services.json` (Android)
 *    and `GoogleService-Info.plist` (iOS) and place them in the project roots.
 * 3. Call `messaging().requestPermission()` instead of `InMemoryPushProvider.requestPermission()`.
 * 4. Obtain the FCM token via `messaging().getToken()` and pass it to your backend.
 * 5. Register foreground message handler:
 *    ```ts
 *    messaging().onMessage(async (remoteMessage) => {
 *      const payload = createNotificationPayload(
 *        remoteMessage.notification?.title ?? '',
 *        remoteMessage.notification?.body ?? '',
 *        remoteMessage.data ?? {},
 *      );
 *      pushProvider.simulateNotification(payload); // or forward to your UI
 *    });
 *    ```
 * 6. For background/quit-state messages use `messaging().setBackgroundMessageHandler()`.
 *
 * ### Apple Push Notification service (APNs)
 * 1. Enable the Push Notifications capability in your Xcode project (Signing & Capabilities).
 * 2. Create an APNs Authentication Key (.p8) or APNs certificate in the Apple Developer portal.
 * 3. Upload the key/certificate to your backend or Firebase console.
 * 4. On the React Native side, request permissions via `@notifee/react-native` or
 *    `react-native-permissions`, then retrieve the APNs device token:
 *    ```ts
 *    import { getAPNSToken } from '@react-native-firebase/messaging';
 *    const apnsToken = await getAPNSToken();
 *    ```
 * 5. Exchange the APNs token for an FCM token when using Firebase as the delivery layer.
 * 6. Handle incoming APNs notifications by implementing `UNUserNotificationCenterDelegate`
 *    (native) or by hooking into the `messaging().onMessage` / `onNotificationOpenedApp`
 *    callbacks (React Native / Firebase).
 */
export interface NotificationPayload {
  /** Human-readable title displayed in the notification banner. */
  readonly title: string;
  /** Body copy of the notification. */
  readonly body: string;
  /** Arbitrary key-value data attached by the server. */
  readonly data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// NotificationPayload factory helpers
// ---------------------------------------------------------------------------

/**
 * Creates a {@link NotificationPayload} with the given fields.
 *
 * @param title  Notification banner title.
 * @param body   Notification body text.
 * @param data   Optional key-value data map.  Defaults to an empty object.
 *
 * @example
 * ```ts
 * const payload = createNotificationPayload('New message', 'You have 3 unread messages');
 * ```
 */
export function createNotificationPayload(
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): NotificationPayload {
  return { title, body, data };
}

/**
 * Creates a {@link NotificationPayload} representing a simple alert.
 *
 * @param title  Alert title.
 * @param message  Alert body.
 */
export function createAlertNotification(title: string, message: string): NotificationPayload {
  return createNotificationPayload(title, message, { type: 'alert' });
}

/**
 * Creates a {@link NotificationPayload} for a chat/message notification.
 *
 * @param senderName  Display name of the sender.
 * @param preview     Text preview of the message.
 * @param threadId    Conversation or thread identifier for deep-linking.
 */
export function createMessageNotification(
  senderName: string,
  preview: string,
  threadId: string,
): NotificationPayload {
  return createNotificationPayload(senderName, preview, { type: 'message', threadId });
}

/**
 * Creates a {@link NotificationPayload} for a data-only (silent) push.
 * Silent pushes carry no visible UI — the app wakes in the background to
 * process the payload.
 *
 * @param data  Arbitrary key-value data for background processing.
 */
export function createSilentNotification(data: Record<string, unknown>): NotificationPayload {
  return createNotificationPayload('', '', { type: 'silent', ...data });
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
