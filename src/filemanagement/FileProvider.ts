import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Defines the contract for file I/O operations.
 */
export interface FileProvider {
  /** Reads and returns the content of the file at `filePath`. */
  read(filePath: string): Promise<Buffer>;
  /** Writes `data` to the file at `filePath`, creating it if necessary. */
  write(filePath: string, data: Buffer | Uint8Array): Promise<void>;
  /** Deletes the file at `filePath`. Returns true on success, false if missing. */
  delete(filePath: string): Promise<boolean>;
  /** Returns true if a file or directory exists at `filePath`. */
  exists(filePath: string): boolean;
  /** Creates a directory (and all ancestors). No-op if it already exists. */
  mkdir(dirPath: string): Promise<void>;
  /** Removes a directory. Pass `recursive: true` to remove non-empty dirs. */
  rmdir(dirPath: string, options?: { recursive?: boolean }): Promise<void>;
  /** Moves `src` to `dest` (atomic rename). */
  move(src: string, dest: string): Promise<void>;
  /** Copies `src` to `dest`, overwriting `dest` if it already exists. */
  copy(src: string, dest: string): Promise<void>;
  /** Returns the path of the system temporary directory. */
  tempDir(): string;
}

/**
 * A {@link FileProvider} backed by Node.js `fs` (or RNFS in React Native).
 *
 * All operations are async-safe wrappers around the Node.js `fs` promises
 * API.  Synchronous helpers (`exists`, `tempDir`) are intentionally
 * synchronous as they map directly to cheap syscalls.
 */
export class NodeFileProvider implements FileProvider {
  /**
   * Reads the file at `filePath` and returns its contents as a {@link Buffer}.
   *
   * @throws When the file does not exist or is not readable.
   */
  async read(filePath: string): Promise<Buffer> {
    return fs.promises.readFile(filePath);
  }

  /**
   * Writes `data` to `filePath`, creating the file if it does not exist and
   * overwriting it if it does.
   *
   * @param filePath  Absolute or relative path.
   * @param data      Content to write.
   */
  async write(filePath: string, data: Buffer | Uint8Array): Promise<void> {
    await fs.promises.writeFile(filePath, data);
  }

  /**
   * Deletes the file at `filePath`.
   *
   * @returns `true` on success; `false` when the file does not exist.
   */
  async delete(filePath: string): Promise<boolean> {
    try {
      await fs.promises.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns `true` when a file or directory exists at `filePath`.
   */
  exists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  /**
   * Creates the directory at `dirPath` and any missing ancestor directories.
   * No-op when the directory already exists.
   */
  async mkdir(dirPath: string): Promise<void> {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }

  /**
   * Removes the directory at `dirPath`.
   *
   * @param dirPath            Directory to remove.
   * @param options.recursive  When `true`, removes the directory and all its
   *                           contents.  Defaults to `false`.
   */
  async rmdir(dirPath: string, options: { recursive?: boolean } = {}): Promise<void> {
    if (options.recursive) {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
    } else {
      await fs.promises.rmdir(dirPath);
    }
  }

  /**
   * Moves `src` to `dest` using an atomic rename.  Overwrites `dest` if it
   * already exists on the same filesystem; throws when crossing filesystems.
   */
  async move(src: string, dest: string): Promise<void> {
    await fs.promises.rename(src, dest);
  }

  /**
   * Copies `src` to `dest`, overwriting `dest` if it already exists.
   */
  async copy(src: string, dest: string): Promise<void> {
    await fs.promises.copyFile(src, dest, 0);
  }

  /**
   * Returns the path to the OS temporary directory (e.g. `/tmp` on Linux/macOS).
   */
  tempDir(): string {
    return os.tmpdir();
  }
}

// ---------------------------------------------------------------------------
// Path helpers (re-exported for convenience)
// ---------------------------------------------------------------------------

/**
 * Joins path segments using the platform path separator.
 * Thin re-export of `path.join` for consumers that prefer a single import.
 */
export const joinPath = (...segments: string[]): string => path.join(...segments);
