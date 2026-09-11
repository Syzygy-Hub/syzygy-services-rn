# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/Syzygy-Hub/syzygy-services-rn/releases/tag/1.0.0
