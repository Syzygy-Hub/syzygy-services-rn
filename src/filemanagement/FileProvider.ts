import fs from 'fs';

/**
 * Defines the contract for file I/O operations.
 */
export interface FileProvider {
  /** Reads and returns the content of the file at `path`. */
  read(path: string): Promise<Buffer>;
  /** Writes `data` to the file at `path`, creating it if necessary. */
  write(path: string, data: Buffer): Promise<void>;
  /** Deletes the file at `path`. Returns true on success. */
  delete(path: string): Promise<boolean>;
  /** Returns true if a file exists at `path`. */
  exists(path: string): boolean;
}

/**
 * A {@link FileProvider} backed by Node.js `fs` (or RNFS in React Native).
 */
export class NodeFileProvider implements FileProvider {
  async read(path: string): Promise<Buffer> {
    return fs.promises.readFile(path);
  }

  async write(path: string, data: Buffer): Promise<void> {
    await fs.promises.writeFile(path, data);
  }

  async delete(path: string): Promise<boolean> {
    try {
      await fs.promises.unlink(path);
      return true;
    } catch {
      return false;
    }
  }

  exists(path: string): boolean {
    return fs.existsSync(path);
  }
}
