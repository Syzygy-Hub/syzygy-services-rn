import { NodeDeviceProvider } from '../../deviceservices/DeviceProvider';
import { InMemoryStorageProvider } from '../../persistence/StorageProvider';

describe('NodeDeviceProvider', () => {
  it('platform is always "rn"', () => {
    const storage = new InMemoryStorageProvider();
    const provider = new NodeDeviceProvider({ storage });
    expect(provider.platform).toBe('rn');
  });

  it('osVersion is a non-empty string', () => {
    const storage = new InMemoryStorageProvider();
    const provider = new NodeDeviceProvider({ storage });
    expect(typeof provider.osVersion).toBe('string');
    expect(provider.osVersion.length).toBeGreaterThan(0);
  });

  it('appVersion matches the override when provided', () => {
    const storage = new InMemoryStorageProvider();
    const provider = new NodeDeviceProvider({ storage, appVersion: '2.3.4' });
    expect(provider.appVersion).toBe('2.3.4');
  });

  it('appVersion defaults to a non-empty string when no override', () => {
    const storage = new InMemoryStorageProvider();
    const provider = new NodeDeviceProvider({ storage });
    expect(provider.appVersion.length).toBeGreaterThan(0);
  });

  it('isSimulator is false by default', () => {
    const storage = new InMemoryStorageProvider();
    const provider = new NodeDeviceProvider({ storage });
    expect(provider.isSimulator).toBe(false);
  });

  it('isSimulator can be overridden', () => {
    const storage = new InMemoryStorageProvider();
    const provider = new NodeDeviceProvider({ storage, isSimulator: true });
    expect(provider.isSimulator).toBe(true);
  });

  it('deviceId generates and persists a UUID', async () => {
    const storage = new InMemoryStorageProvider();
    const provider = new NodeDeviceProvider({ storage });
    const id = await provider.deviceId;
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('deviceId is the same across multiple calls', async () => {
    const storage = new InMemoryStorageProvider();
    const provider = new NodeDeviceProvider({ storage });
    const id1 = await provider.deviceId;
    const id2 = await provider.deviceId;
    expect(id1).toBe(id2);
  });

  it('deviceId persists across provider instances sharing the same storage', async () => {
    const storage = new InMemoryStorageProvider();
    const provider1 = new NodeDeviceProvider({ storage });
    const id1 = await provider1.deviceId;

    const provider2 = new NodeDeviceProvider({ storage });
    const id2 = await provider2.deviceId;

    expect(id1).toBe(id2);
  });

  it('deviceId is unique across different storage instances', async () => {
    const p1 = new NodeDeviceProvider({ storage: new InMemoryStorageProvider() });
    const p2 = new NodeDeviceProvider({ storage: new InMemoryStorageProvider() });
    const [id1, id2] = await Promise.all([p1.deviceId, p2.deviceId]);
    expect(id1).not.toBe(id2);
  });

  it('concurrent getDeviceId calls all return same UUID', async () => {
    const storage = new InMemoryStorageProvider();
    const provider = new NodeDeviceProvider({ storage });
    const results = await Promise.all(Array.from({ length: 10 }, () => provider.deviceId));
    expect(new Set(results).size).toBe(1);
  });
});
