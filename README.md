![CI](https://github.com/Syzygy-Hub/syzygy-services-rn/actions/workflows/ci.yml/badge.svg)
![version](https://img.shields.io/badge/version-1.0.0-blue)
![platform](https://img.shields.io/badge/platform-React%20Native%20%7C%20TypeScript-61DAFB)
![license](https://img.shields.io/badge/license-MIT-green)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Syzygy-Hub/.github/main/assets/syzygy-banner-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/Syzygy-Hub/.github/main/assets/syzygy-banner-light.png">
  <img alt="Syzygy Banner" src="https://raw.githubusercontent.com/Syzygy-Hub/.github/main/assets/syzygy-banner-light.png">
</picture>

# syzygy-services-rn

Concrete I/O service implementations for the Syzygy React Native ecosystem — networking, persistence, auth, file management, push notifications, device services, remote config, analytics, crash reporting, and WebSocket.

## Modules

| Module | Interface | Implementation | Description |
|--------|-----------|----------------|-------------|
| `networking` | `NetworkClient` | `FetchNetworkClient` | HTTP GET/POST via global `fetch` |
| `persistence` | `StorageProvider` | `InMemoryStorageProvider` | Key-value storage (swap with AsyncStorage) |
| `auth` | `AuthProvider` | `JWTAuthProvider` | JWT token storage and refresh stub |
| `filemanagement` | `FileProvider` | `NodeFileProvider` | File read/write/delete (swap with RNFS) |
| `pushnotifications` | `PushProvider` | `InMemoryPushProvider` | Push token registration stub |
| `deviceservices` | `DeviceProvider` | `NodeDeviceProvider` | Hostname, platform, OS version |
| `remoteconfig` | `RemoteConfigProvider` | `InMemoryRemoteConfigProvider` | In-memory remote config store |
| `analytics` | `AnalyticsProvider` | `ConsoleAnalyticsProvider` | Console-based event logging stub |
| `crashreporting` | `CrashReporter` | `ConsoleCrashReporter` | Console-based crash/error logging stub |
| `websocket` | `WebSocketProvider` | `NativeWebSocketProvider` | Native WebSocket implementation stub |

## Installation

```sh
npm install syzygy-services-rn
```

## Requirements

- React Native 0.73+
- TypeScript 5.0+
- Node 20+

## Dependencies

- `syzygy-foundation-rn` ^1.1.0

## Ecosystem

`syzygy-services-rn` is part of the Syzygy React Native ecosystem. It sits in the **services layer** — the I/O boundary of the architecture — and depends only on `syzygy-foundation-rn`. Each module ships its own interface alongside a concrete implementation, making it straightforward to swap in production adapters (AsyncStorage, RNFS, Firebase, etc.) while keeping the rest of the codebase decoupled.

| Package | Layer | Description |
|---------|-------|-------------|
| `syzygy-foundation-rn` | foundation | Primitives, utilities, base types |
| `syzygy-services-rn` | services | I/O service interfaces and implementations |

## License

MIT
