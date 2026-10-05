[![React Native](https://img.shields.io/badge/React%20Native-TypeScript-61DAFB?style=flat)](https://reactnative.dev) [![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178C6?logo=typescript&logoColor=white&style=flat)](https://www.typescriptlang.org) [![CI](https://img.shields.io/github/actions/workflow/status/Syzygy-Hub/syzygy-services-rn/ci.yml?label=ci&style=flat)](https://github.com/Syzygy-Hub/syzygy-services-rn/actions/workflows/ci.yml) [![Version](https://img.shields.io/badge/version-3.0.0-D85A30?style=flat)](https://github.com/Syzygy-Hub/syzygy-services-rn/releases) [![License](https://img.shields.io/badge/License-MIT-green?style=flat)](LICENSE)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Syzygy-Hub/.github/main/brand/assets/banners/syzygy-banner-dark-1200.png">
  <img src="https://raw.githubusercontent.com/Syzygy-Hub/.github/main/brand/assets/banners/syzygy-banner-light-1200.png" alt="Syzygy" width="600">
</picture>

# syzygy-services-rn

Concrete I/O service implementations for the Syzygy React Native ecosystem — networking, persistence, auth, file management, push notifications, device services, remote config, analytics, crash reporting, and WebSocket.

## Modules

| Module | Interface | Implementation | Description |
|--------|-----------|----------------|-------------|
| `networking` | `NetworkClient` | `FetchNetworkClient` | HTTP GET/POST via global `fetch` |
| `persistence` | `StorageProvider` | `InMemoryStorageProvider` | Key-value storage (swap with AsyncStorage) |
| `auth` | `AuthProvider` | `JWTAuthProvider` | JWT token storage and refresh |
| `filemanagement` | `FileProvider` | `NodeFileProvider` | File read/write/delete (swap with RNFS) |
| `pushnotifications` | `PushProvider` | `InMemoryPushProvider` | Push token registration |
| `deviceservices` | `DeviceProvider` | `NodeDeviceProvider` | Hostname, platform, OS version |
| `remoteconfig` | `RemoteConfigProvider` | `InMemoryRemoteConfigProvider`, `NetworkRemoteConfigProvider` | In-memory remote config store |
| `analytics` | `ExtendedAnalyticsProvider` | `ConsoleAnalyticsProvider`, `InMemoryAnalyticsProvider` | Console-based event logging |
| `crashreporting` | `CrashReporter` | `ConsoleCrashReporter`, `InMemoryCrashReporter` | Console-based crash/error logging |
| `websocket` | `WebSocketProvider` | `NativeWebSocketProvider`, `InMemoryWebSocketProvider` | Native WebSocket implementation |

## Installation

```sh
npm install syzygy-services-rn
```

## Requirements

- React Native 0.73+
- TypeScript 5.0+
- Node 20+

## Dependencies

- `syzygy-foundation-rn` ^3.0.0

## Ecosystem

`syzygy-services-rn` is part of the Syzygy React Native ecosystem. It sits in the **services layer** — the I/O boundary of the architecture — and depends only on `syzygy-foundation-rn`. Each module ships its own interface alongside a concrete implementation, making it straightforward to swap in production adapters (AsyncStorage, RNFS, Firebase, etc.) while keeping the rest of the codebase decoupled.

| Package | Layer | Description |
|---------|-------|-------------|
| `syzygy-foundation-rn` | foundation | Primitives, utilities, base types |
| `syzygy-services-rn` | services | I/O service interfaces and implementations |

## Push Notifications

`syzygy-services-rn` ships `InMemoryPushProvider` as a zero-dependency stub and documents the steps required to wire up a real FCM/APNs push layer.

### FCM (Android + iOS via Firebase Cloud Messaging)

1. Install `@react-native-firebase/app` and `@react-native-firebase/messaging`.
2. Add `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) to your project roots following the Firebase Console setup wizard.
3. Request permission and register the token:
   ```ts
   import messaging from '@react-native-firebase/messaging';

   const granted = await messaging().requestPermission();
   if (granted) {
     const token = await messaging().getToken();
     pushProvider.registerToken(token);
   }
   ```
4. Handle foreground messages:
   ```ts
   messaging().onMessage(async (remoteMessage) => {
     const payload = createNotificationPayload(
       remoteMessage.notification?.title ?? '',
       remoteMessage.notification?.body ?? '',
       remoteMessage.data ?? {},
     );
     pushProvider.simulateNotification(payload); // or forward to your UI
   });
   ```
5. Handle background / quit-state messages with `messaging().setBackgroundMessageHandler()`.

### APNs (iOS native push)

1. Enable the **Push Notifications** capability in Xcode (Signing & Capabilities tab).
2. Create an APNs Authentication Key (.p8) or APNs certificate in the Apple Developer portal and upload it to your backend or Firebase console.
3. Retrieve the APNs device token:
   ```ts
   import { getAPNSToken } from '@react-native-firebase/messaging';
   const apnsToken = await getAPNSToken();
   ```
4. Exchange the APNs token for an FCM token when using Firebase as the delivery layer.
5. Handle incoming APNs notifications via `UNUserNotificationCenterDelegate` (native) or the Firebase `onMessage` / `onNotificationOpenedApp` callbacks.

### Notification payload factory helpers

```ts
import {
  createNotificationPayload,
  createAlertNotification,
  createMessageNotification,
  createSilentNotification,
} from 'syzygy-services-rn';

// Generic payload
const payload = createNotificationPayload('Title', 'Body', { key: 'value' });

// Alert notification
const alert = createAlertNotification('Alert', 'Something happened');

// Chat message notification with deep-link thread id
const msg = createMessageNotification('Alice', 'Hey!', 'thread-42');

// Silent (data-only) push for background processing
const silent = createSilentNotification({ action: 'sync' });
```

## License

MIT
