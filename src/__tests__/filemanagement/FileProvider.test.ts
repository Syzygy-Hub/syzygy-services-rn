import os from 'os';
import path from 'path';

import { NodeFileProvider } from '../../filemanagement/FileProvider';

describe('NodeFileProvider', () => {
  const provider = new NodeFileProvider();

  function tmpPath(suffix: string): string {
    return path.join(os.tmpdir(), `syzygy-test-${Date.now()}-${suffix}`);
  }

  it('write and read round-trips Buffer data', async () => {
    const filePath = tmpPath('rw.bin');
    const data = Buffer.from('hello syzygy');
    await provider.write(filePath, data);
    const read = await provider.read(filePath);
    expect(read).toEqual(data);
    await provider.delete(filePath);
  });

  it('write and read round-trips Uint8Array data', async () => {
    const filePath = tmpPath('uint8.bin');
    const data = new Uint8Array([1, 2, 3, 4]);
    await provider.write(filePath, data);
    const read = await provider.read(filePath);
    expect(Array.from(read)).toEqual([1, 2, 3, 4]);
    await provider.delete(filePath);
  });

  it('exists returns true for an existing file', async () => {
    const filePath = tmpPath('exists.txt');
    await provider.write(filePath, Buffer.from('x'));
    expect(provider.exists(filePath)).toBe(true);
    await provider.delete(filePath);
  });

  it('exists returns false for a missing file', () => {
    expect(provider.exists(tmpPath('no-such-file.txt'))).toBe(false);
  });

  it('delete returns true and removes the file', async () => {
    const filePath = tmpPath('del.txt');
    await provider.write(filePath, Buffer.from('bye'));
    const result = await provider.delete(filePath);
    expect(result).toBe(true);
    expect(provider.exists(filePath)).toBe(false);
  });

  it('delete returns false for a missing file', async () => {
    expect(await provider.delete(tmpPath('ghost.txt'))).toBe(false);
  });

  it('mkdir creates a directory and rmdir removes it', async () => {
    const dirPath = tmpPath('mydir');
    await provider.mkdir(dirPath);
    expect(provider.exists(dirPath)).toBe(true);
    await provider.rmdir(dirPath);
    expect(provider.exists(dirPath)).toBe(false);
  });

  it('mkdir is idempotent (no-op if directory exists)', async () => {
    const dirPath = tmpPath('idem');
    await provider.mkdir(dirPath);
    await expect(provider.mkdir(dirPath)).resolves.toBeUndefined();
    await provider.rmdir(dirPath);
  });

  it('rmdir with recursive removes a non-empty directory', async () => {
    const dirPath = tmpPath('nonempty');
    await provider.mkdir(dirPath);
    await provider.write(path.join(dirPath, 'child.txt'), Buffer.from('!'));
    await provider.rmdir(dirPath, { recursive: true });
    expect(provider.exists(dirPath)).toBe(false);
  });

  it('move renames a file', async () => {
    const src = tmpPath('src.txt');
    const dest = tmpPath('dest.txt');
    await provider.write(src, Buffer.from('data'));
    await provider.move(src, dest);
    expect(provider.exists(src)).toBe(false);
    expect(provider.exists(dest)).toBe(true);
    await provider.delete(dest);
  });

  it('copy duplicates a file', async () => {
    const src = tmpPath('copy-src.txt');
    const dest = tmpPath('copy-dest.txt');
    await provider.write(src, Buffer.from('clone'));
    await provider.copy(src, dest);
    expect(provider.exists(src)).toBe(true);
    expect(provider.exists(dest)).toBe(true);
    const read = await provider.read(dest);
    expect(read.toString()).toBe('clone');
    await provider.delete(src);
    await provider.delete(dest);
  });

  it('tempDir returns a non-empty string', () => {
    expect(provider.tempDir().length).toBeGreaterThan(0);
    expect(provider.tempDir()).toBe(os.tmpdir());
  });
});
