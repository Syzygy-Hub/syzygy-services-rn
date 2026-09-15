# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-09-13

### Added

- DeviceServices: `NodeDeviceProvider` now uses storage key `"syzygy.device.uuid"` (was `"syzygy.device.id"`) — UUID is generated once and persisted via `StorageProvider`, never regenerated if already stored
- Persistence: `InMemoryStorageProvider.get()` now throws `TypeError` with a descriptive message (key name, stored type, requested type) when the stored value's type does not match the key's declared type; type detection uses `defaultValue` as a runtime type hint
- Networking: `FetchNetworkClient` accepts an optional `logger?: LoggerProtocol` — logs outgoing request (method, URL, safe headers, body size), successful response (status, elapsed ms, body size), and errors; `undefined` logger incurs zero overhead
- Analytics: `ConsoleAnalyticsProvider` and `InMemoryAnalyticsProvider` now inject `sessionId` into every tracked event's `properties`; session ID resets on `reset()`
- CrashReporting: `CrashReporter` interface and all implementations gain `leaveBreadcrumb(message, metadata?)` and `clearBreadcrumbs()`; `InMemoryCrashReporter` stores up to 20 breadcrumbs in a circular buffer and includes a snapshot in every `CrashRecord`
- WebSocket: `onBinaryMessage(handler)` callback on `WebSocketProvider` interface and `InMemoryWebSocketProvider`, returning `Uint8Array` frames — aligns with Android `binaryMessages: Flow<ByteArray>` contract
- WebSocket: `simulateBinaryMessage(data)` helper on `InMemoryWebSocketProvider` for test-time binary frame injection
- WebSocket: binary stream tests covering `onBinaryMessage` delivery, unsubscribe, multi-handler fan-out, empty frames, and mixed text+binary ordering (Android parity)
- Networking: injectable `backoffClock: BackoffClock` option on `FetchNetworkClient` so retry back-off timing is deterministic in tests without global `setTimeout` stubbing — mirrors Android injectable-clock pattern
- Networking: deterministic retry backoff tests using injectable `backoffClock` (exact delay values, partial recovery, no-sleep on first attempt, no-sleep on 4xx)
- Networking retry integration tests with injectable `backoffClock`/timer
- Auth: real token-refresh flow wired to NetworkClient with auto-refresh on expired JWT
- RemoteConfig: cache TTL (cacheTtlSeconds, default 3600) for NetworkRemoteConfigProvider
- WebSocket binary send tests (ArrayBuffer, binary receive callback, mixed text+binary)
- PushNotifications: JSDoc FCM/APNs integration guide and NotificationPayload factory helpers
- PushNotifications: README section with FCM/APNs integration steps and factory helper examples
- Contract compliance tests verifying every service implements its Foundation protocol
- Networking: `FetchNetworkClient.dispose()` — marks the client as disposed; subsequent `execute()` calls throw `NetworkError` (code `unknown`); calling `dispose()` multiple times is a safe no-op
- WebSocket: `dispose(): void` added to `WebSocketProvider` interface, `NativeWebSocketProvider`, and `InMemoryWebSocketProvider` — closes the connection, clears all registered handlers, and prevents further `connect()` / `send()` / `sendBinary()` calls (each throws `WebSocketError`); calling `dispose()` multiple times is a safe no-op
- Added `canUseBiometric()` and `authenticateWithBiometric(reason)` stub methods to `JWTAuthProvider` — returns `false`/`AuthState.Unauthenticated` with doc comments explaining real platform wiring (react-native-biometrics)
- Added `CONTRACT_TESTS.md` — canonical set of behaviour assertions every Services implementation must satisfy, organised by module

### Changed

- SleepFn renamed to BackoffClock for cross-platform naming consistency

### Fixed

- README version badge corrected to 1.1.0
- README banner updated to match cross-repo standard

## [1.0.0] - 2026-09-12

### Added

- NetworkClient interface and fetch-backed HTTP client
- StorageProvider interface and AsyncStorage-backed key-value persistence stub
- AuthProvider interface and JWT token storage and refresh stub
- FileProvider interface and RNFS-backed file I/O stub
- PushProvider interface and push token registration stub
- DeviceProvider interface and react-native device info stub
- RemoteConfigProvider interface and in-memory remote config store
- AnalyticsProvider interface and console analytics event logging stub
- CrashReporter interface and console crash logging stub
- WebSocketProvider interface and native WebSocket implementation stub

[Unreleased]: https://github.com/Syzygy-Hub/syzygy-services-rn/compare/1.1.0...HEAD
[1.1.0]: https://github.com/Syzygy-Hub/syzygy-services-rn/compare/1.0.0...1.1.0
[1.0.0]: https://github.com/Syzygy-Hub/syzygy-services-rn/releases/tag/1.0.0
