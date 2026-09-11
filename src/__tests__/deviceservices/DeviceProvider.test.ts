import { NodeDeviceProvider } from '../../deviceservices/DeviceProvider';

describe('DeviceProvider', () => {
  it('NodeDeviceProvider returns non-empty values', () => {
    const provider = new NodeDeviceProvider();
    expect(provider.hostname.length).toBeGreaterThan(0);
    expect(provider.platform.length).toBeGreaterThan(0);
    expect(provider.osVersion.length).toBeGreaterThan(0);
  });
});
