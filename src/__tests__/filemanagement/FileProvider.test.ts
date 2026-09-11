import { NodeFileProvider } from '../../filemanagement/FileProvider';
import os from 'os';
import path from 'path';

describe('FileProvider', () => {
  it('NodeFileProvider round-trips data', async () => {
    const provider = new NodeFileProvider();
    const filePath = path.join(os.tmpdir(), `syzygy-test-${Date.now()}.bin`);
    const data = Buffer.from('hello');
    await provider.write(filePath, data);
    expect(provider.exists(filePath)).toBe(true);
    const read = await provider.read(filePath);
    expect(read).toEqual(data);
    await provider.delete(filePath);
    expect(provider.exists(filePath)).toBe(false);
  });
});
