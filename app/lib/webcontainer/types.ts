/**
 * Our own minimal description of the WebContainer runtime.
 *
 * These interfaces list ONLY the methods, properties and events that bolt.diy
 * actually uses today. They let most of the app stop importing types from
 * `@webcontainer/api`, so a different preview engine (for example esbuild-wasm
 * running in a sandboxed iframe) can implement the same shape later.
 *
 * The shapes deliberately mirror `@webcontainer/api` so the real WebContainer
 * instance stays assignable to `WebContainer` below. Keep this file free of
 * runtime code and of any imports from `@webcontainer/api`.
 */

/** Function returned by `on(...)` that removes the listener. */
export type Unsubscribe = () => void;

/** Text encodings accepted by the file system calls. */
export type BufferEncoding =
  'ascii' | 'utf8' | 'utf-8' | 'utf16le' | 'ucs2' | 'ucs-2' | 'base64' | 'base64url' | 'latin1' | 'binary' | 'hex';

/** A directory entry returned by `fs.readdir(path, { withFileTypes: true })`. */
export interface DirEnt<T> {
  name: T;
  isFile(): boolean;
  isDirectory(): boolean;
}

/**
 * File system calls. All paths are relative to `WebContainer.workdir`.
 */
export interface FileSystemAPI {
  readdir(
    path: string,
    options?:
      | {
          encoding?: BufferEncoding | null;
          withFileTypes?: false;
        }
      | BufferEncoding
      | null,
  ): Promise<string[]>;
  readdir(
    path: string,
    options: {
      encoding?: BufferEncoding | null;
      withFileTypes: true;
    },
  ): Promise<DirEnt<string>[]>;

  readFile(path: string, encoding?: null): Promise<Uint8Array>;
  readFile(path: string, encoding: BufferEncoding): Promise<string>;

  writeFile(
    path: string,
    data: string | Uint8Array,
    options?:
      | string
      | {
          encoding?: string | null;
        }
      | null,
  ): Promise<void>;

  mkdir(path: string, options?: { recursive?: false }): Promise<void>;
  mkdir(path: string, options: { recursive: true }): Promise<string>;

  rm(path: string, options?: { force?: boolean; recursive?: boolean }): Promise<void>;
}

/** A single change reported by the file watcher. */
export interface PathWatcherEvent {
  type: 'change' | 'add_file' | 'remove_file' | 'add_dir' | 'remove_dir' | 'update_directory';
  path: string;
  mtime: number;
  buffer?: Uint8Array;
  ino: number;
}

/** Options for `internal.watchPaths`. Only the fields bolt.diy passes. */
export interface WatchPathsOptions {
  include?: string[];
  exclude?: string[];
  includeContent?: boolean;
}

/** The non-public helpers bolt.diy relies on. */
export interface WebContainerInternal {
  watchPaths(options: WatchPathsOptions, cb: (events: PathWatcherEvent[]) => void): () => void;
}

/** Options for `spawn`. */
export interface SpawnOptions {
  /** Size of the attached pseudo terminal. */
  terminal?: {
    cols: number;
    rows: number;
  };
}

/** A running process started with `spawn`. */
export interface WebContainerProcess {
  /** Resolves with the exit code when the process ends. */
  exit: Promise<number>;

  /** Writes to the process's terminal input. */
  input: WritableStream<string>;

  /** All terminal output (stdout and stderr together). */
  output: ReadableStream<string>;

  kill(): void;

  resize(dimensions: { cols: number; rows: number }): void;
}

/** Message sent by the injected preview script when the preview page throws. */
export type PreviewMessage = (
  | {
      type: 'PREVIEW_UNCAUGHT_EXCEPTION' | 'PREVIEW_UNHANDLED_REJECTION';
      message: string;
      stack: string | undefined;
    }
  | {
      type: 'PREVIEW_CONSOLE_ERROR';
      args: any[];
      stack: string;
    }
) & {
  previewId: string;
  port: number;
  pathname: string;
  search: string;
  hash: string;
};

/** A dev server inside the runtime opened or closed a port. */
export type PortListener = (port: number, type: 'open' | 'close', url: string) => void;

/** A dev server is ready to receive requests. */
export type ServerReadyListener = (port: number, url: string) => void;

/** The preview page posted a message (errors, see `PreviewMessage`). */
export type PreviewMessageListener = (message: PreviewMessage) => void;

/** The runtime instance used across the app. */
export interface WebContainer {
  /** Absolute path of the project folder inside the runtime. */
  readonly workdir: string;

  fs: FileSystemAPI;

  internal: WebContainerInternal;

  spawn(command: string, args: string[], options?: SpawnOptions): Promise<WebContainerProcess>;

  on(event: 'port', listener: PortListener): Unsubscribe;
  on(event: 'server-ready', listener: ServerReadyListener): Unsubscribe;
  on(event: 'preview-message', listener: PreviewMessageListener): Unsubscribe;

  /** Injects a script into every preview page (bolt.diy uses it for the inspector). */
  setPreviewScript(scriptSrc: string): Promise<void>;
}
