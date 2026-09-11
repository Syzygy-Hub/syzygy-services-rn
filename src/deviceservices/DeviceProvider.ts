import os from 'os';

/**
 * Defines the contract for accessing device information.
 */
export interface DeviceProvider {
  /** The device/host name. */
  readonly hostname: string;
  /** The OS platform (e.g. 'darwin', 'linux', 'win32'). */
  readonly platform: string;
  /** The OS release version string. */
  readonly osVersion: string;
}

/**
 * A {@link DeviceProvider} backed by Node.js `os` module.
 */
export class NodeDeviceProvider implements DeviceProvider {
  get hostname(): string { return os.hostname(); }
  get platform(): string { return os.platform(); }
  get osVersion(): string { return os.release(); }
}
