/**
 * In-memory file system for the browser preview shim.
 *
 * Implements `FileSystemAPI` and `WebContainerInternal.watchPaths` from
 * `~/lib/webcontainer/types` without any WebContainer code. Paths may be
 * relative (resolved against `workdir`) or absolute. Errors carry Node-style
 * `code` values (ENOENT, EEXIST, ...) because isomorphic-git checks them.
 */
import type {
  BufferEncoding,
  DirEnt,
  FileSystemAPI,
  PathWatcherEvent,
  WatchPathsOptions,
  WebContainerInternal,
} from '~/lib/webcontainer/types';
import { path as pathUtils } from '~/utils/path';

type FileNode = { kind: 'file'; data: Uint8Array; ino: number; mtime: number };
type DirNode = { kind: 'dir'; children: Set<string>; ino: number; mtime: number };
type FsNode = FileNode | DirNode;

type WatchCallback = (events: PathWatcherEvent[]) => void;

interface Watcher {
  include: RegExp[];
  exclude: RegExp[];
  includeContent: boolean;
  callback: WatchCallback;
  pending: PathWatcherEvent[];
  scheduled: boolean;
  active: boolean;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const TEXT_ENCODINGS = new Set(['utf8', 'utf-8']);

export class FsError extends Error {
  code: string;
  syscall: string;
  path: string;

  constructor(code: string, description: string, syscall: string, path: string) {
    super(`${code}: ${description}, ${syscall} '${path}'`);
    this.name = 'FsError';
    this.code = code;
    this.syscall = syscall;
    this.path = path;
  }
}

function assertTextEncoding(encoding: string, syscall: string, path: string) {
  if (!TEXT_ENCODINGS.has(encoding.toLowerCase())) {
    throw new FsError('ENOTSUP', `encoding '${encoding}' is not supported by the preview file system`, syscall, path);
  }
}

/**
 * Turns a glob into a regular expression. Supports `**`, `*` and `?`.
 * `**` followed by `/` also matches zero folders, so `**\/node_modules`
 * matches `node_modules` at any depth, including the top level.
 */
export function globToRegExp(glob: string): RegExp {
  let source = '';

  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];

    if (char === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          source += '(?:.*/)?';
          i += 2;
        } else {
          source += '.*';
          i += 1;
        }
      } else {
        source += '[^/]*';
      }
    } else if (char === '?') {
      source += '[^/]';
    } else if (char === '/' && glob.slice(i + 1) === '**') {
      // `dir/**` also matches `dir` itself
      source += '(?:/.*)?';
      break;
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }

  return new RegExp(`^${source}$`);
}

export class MemoryFileSystem implements FileSystemAPI {
  readonly workdir: string;

  #nodes = new Map<string, FsNode>();
  #nextIno = 1;
  #watchers = new Set<Watcher>();

  constructor(workdir: string) {
    this.workdir = pathUtils.normalize(workdir).replace(/(.)\/+$/, '$1');
    this.#nodes.set('/', this.#newDir());
    this.#mkdirp(this.workdir, false);
  }

  /** Object matching `WebContainer.internal`. */
  get internal(): WebContainerInternal {
    return {
      watchPaths: (options, cb) => this.watchPaths(options, cb),
    };
  }

  /* ---------------------------------------------------------------- reads */

  readdir(
    path: string,
    options?: { encoding?: BufferEncoding | null; withFileTypes?: false } | BufferEncoding | null,
  ): Promise<string[]>;
  readdir(path: string, options: { encoding?: BufferEncoding | null; withFileTypes: true }): Promise<DirEnt<string>[]>;
  async readdir(
    path: string,
    options?: { encoding?: BufferEncoding | null; withFileTypes?: boolean } | BufferEncoding | null,
  ): Promise<string[] | DirEnt<string>[]> {
    const absolute = this.#resolve(path);
    const node = this.#nodes.get(absolute);

    if (!node) {
      throw new FsError('ENOENT', 'no such file or directory', 'scandir', path);
    }

    if (node.kind !== 'dir') {
      throw new FsError('ENOTDIR', 'not a directory', 'scandir', path);
    }

    const names = [...node.children].sort();
    const withFileTypes = typeof options === 'object' && options !== null && options.withFileTypes === true;

    if (!withFileTypes) {
      return names;
    }

    return names.map((name) => {
      const isDir = this.#nodes.get(this.#join(absolute, name))?.kind === 'dir';
      return { name, isFile: () => !isDir, isDirectory: () => isDir };
    });
  }

  readFile(path: string, encoding?: null): Promise<Uint8Array>;
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  async readFile(path: string, encoding?: BufferEncoding | null): Promise<Uint8Array | string> {
    const node = this.#nodes.get(this.#resolve(path));

    if (!node) {
      throw new FsError('ENOENT', 'no such file or directory', 'open', path);
    }

    if (node.kind !== 'file') {
      throw new FsError('EISDIR', 'illegal operation on a directory', 'read', path);
    }

    if (encoding) {
      assertTextEncoding(encoding, 'open', path);
      return textDecoder.decode(node.data);
    }

    return node.data.slice();
  }

  /* --------------------------------------------------------------- writes */

  async writeFile(
    path: string,
    data: string | Uint8Array,
    options?: string | { encoding?: string | null } | null,
  ): Promise<void> {
    const absolute = this.#resolve(path);
    const parent = this.#nodes.get(pathUtils.dirname(absolute));

    if (!parent) {
      throw new FsError('ENOENT', 'no such file or directory', 'open', path);
    }

    if (parent.kind !== 'dir') {
      throw new FsError('ENOTDIR', 'not a directory', 'open', path);
    }

    const existing = this.#nodes.get(absolute);

    if (existing?.kind === 'dir') {
      throw new FsError('EISDIR', 'illegal operation on a directory', 'open', path);
    }

    let bytes: Uint8Array;

    if (typeof data === 'string') {
      const encoding = typeof options === 'string' ? options : options?.encoding;

      if (encoding) {
        assertTextEncoding(encoding, 'open', path);
      }

      bytes = textEncoder.encode(data);
    } else {
      // copy (Buffer.slice would share memory with the caller)
      bytes = new Uint8Array(data);
    }

    const mtime = Date.now();

    if (existing) {
      existing.data = bytes;
      existing.mtime = mtime;
      this.#emit('change', absolute, existing);
    } else {
      const file: FileNode = { kind: 'file', data: bytes, ino: this.#nextIno++, mtime };
      this.#nodes.set(absolute, file);
      parent.children.add(pathUtils.basename(absolute));
      this.#emit('add_file', absolute, file);
    }
  }

  mkdir(path: string, options?: { recursive?: false }): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<string>;
  async mkdir(path: string, options?: { recursive?: boolean }): Promise<string | void> {
    const absolute = this.#resolve(path);

    if (options?.recursive) {
      const existing = this.#nodes.get(absolute);

      if (existing && existing.kind !== 'dir') {
        throw new FsError('EEXIST', 'file already exists', 'mkdir', path);
      }

      /*
       * Node returns the first folder it created, or undefined when nothing
       * was created. The shared type says `string`, so callers must not rely
       * on it; bolt.diy never reads it.
       */
      return this.#mkdirp(absolute, true) as string;
    }

    if (this.#nodes.has(absolute)) {
      throw new FsError('EEXIST', 'file already exists', 'mkdir', path);
    }

    const parent = this.#nodes.get(pathUtils.dirname(absolute));

    if (!parent) {
      throw new FsError('ENOENT', 'no such file or directory', 'mkdir', path);
    }

    if (parent.kind !== 'dir') {
      throw new FsError('ENOTDIR', 'not a directory', 'mkdir', path);
    }

    this.#addDir(absolute, parent, true);

    return undefined;
  }

  async rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void> {
    const absolute = this.#resolve(path);
    const node = this.#nodes.get(absolute);

    if (!node) {
      if (options?.force) {
        return;
      }

      throw new FsError('ENOENT', 'no such file or directory', 'rm', path);
    }

    if (absolute === '/') {
      throw new FsError('EPERM', 'operation not permitted', 'rm', path);
    }

    if (node.kind === 'dir' && !options?.recursive) {
      throw new FsError('EISDIR', 'is a directory (use recursive)', 'rm', path);
    }

    this.#removeTree(absolute, node);

    const parent = this.#nodes.get(pathUtils.dirname(absolute));

    if (parent?.kind === 'dir') {
      parent.children.delete(pathUtils.basename(absolute));
    }
  }

  /* -------------------------------------------------------------- watcher */

  /**
   * Same contract as `WebContainer.internal.watchPaths`: events are batched
   * and delivered asynchronously (one call per microtask burst).
   * Returns a function that stops the watcher.
   */
  watchPaths(options: WatchPathsOptions, callback: WatchCallback): () => void {
    const watcher: Watcher = {
      include: (options.include ?? []).map(globToRegExp),
      exclude: (options.exclude ?? []).map(globToRegExp),
      includeContent: options.includeContent === true,
      callback,
      pending: [],
      scheduled: false,
      active: true,
    };

    this.#watchers.add(watcher);

    return () => {
      watcher.active = false;
      watcher.pending = [];
      this.#watchers.delete(watcher);
    };
  }

  #emit(type: PathWatcherEvent['type'], absolute: string, node: FsNode) {
    for (const watcher of this.#watchers) {
      if (!this.#isWatched(watcher, absolute)) {
        continue;
      }

      const event: PathWatcherEvent = { type, path: absolute, mtime: node.mtime, ino: node.ino };

      if (watcher.includeContent && node.kind === 'file' && (type === 'add_file' || type === 'change')) {
        event.buffer = node.data.slice();
      }

      watcher.pending.push(event);

      if (!watcher.scheduled) {
        watcher.scheduled = true;
        queueMicrotask(() => {
          watcher.scheduled = false;

          if (!watcher.active || watcher.pending.length === 0) {
            return;
          }

          const batch = watcher.pending;
          watcher.pending = [];
          watcher.callback(batch);
        });
      }
    }
  }

  #isWatched(watcher: Watcher, absolute: string) {
    if (watcher.include.length > 0 && !watcher.include.some((re) => this.#matches(re, absolute))) {
      return false;
    }

    // a path is excluded when it, or any folder above it, matches an exclude pattern
    for (let current = absolute; ; current = pathUtils.dirname(current)) {
      if (watcher.exclude.some((re) => this.#matches(re, current))) {
        return false;
      }

      if (current === '/' || current === this.workdir) {
        break;
      }
    }

    return true;
  }

  /** Absolute patterns match absolute paths; relative patterns also match the path relative to workdir. */
  #matches(re: RegExp, absolute: string) {
    if (re.test(absolute)) {
      return true;
    }

    const relative = pathUtils.relative(this.workdir, absolute);

    return relative !== '' && !relative.startsWith('..') && re.test(relative);
  }

  /* -------------------------------------------------------------- helpers */

  #resolve(path: string) {
    const absolute = pathUtils.isAbsolute(path) ? path : pathUtils.join(this.workdir, path);
    const normalized = pathUtils.normalize(absolute);

    return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
  }

  #join(dir: string, name: string) {
    return dir === '/' ? `/${name}` : `${dir}/${name}`;
  }

  #newDir(): DirNode {
    return { kind: 'dir', children: new Set(), ino: this.#nextIno++, mtime: Date.now() };
  }

  #addDir(absolute: string, parent: DirNode, emit: boolean) {
    const dir = this.#newDir();
    this.#nodes.set(absolute, dir);
    parent.children.add(pathUtils.basename(absolute));

    if (emit) {
      this.#emit('add_dir', absolute, dir);
    }

    return dir;
  }

  /** Creates every missing folder on the way to `absolute`; returns the first one created. */
  #mkdirp(absolute: string, emit: boolean): string | undefined {
    let firstCreated: string | undefined;
    let current = '/';

    for (const part of absolute.split('/').filter(Boolean)) {
      const parent = this.#nodes.get(current) as FsNode;
      const next = this.#join(current, part);
      const existing = this.#nodes.get(next);

      if (parent.kind !== 'dir' || (existing && existing.kind !== 'dir')) {
        throw new FsError('ENOTDIR', 'not a directory', 'mkdir', absolute);
      }

      if (!existing) {
        this.#addDir(next, parent, emit);
        firstCreated ??= next;
      }

      current = next;
    }

    return firstCreated;
  }

  /** Removes a node and everything below it, children first, emitting remove events. */
  #removeTree(absolute: string, node: FsNode) {
    if (node.kind === 'dir') {
      for (const name of [...node.children]) {
        const childPath = this.#join(absolute, name);
        const child = this.#nodes.get(childPath);

        if (child) {
          this.#removeTree(childPath, child);
        }
      }
    }

    this.#nodes.delete(absolute);
    node.mtime = Date.now();
    this.#emit(node.kind === 'dir' ? 'remove_dir' : 'remove_file', absolute, node);
  }
}
