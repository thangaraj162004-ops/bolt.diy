/**
 * Browser-only stand-in for WebContainer, used when
 * `VITE_PREVIEW_ENGINE=esbuild`. Files live in memory; `spawn` runs a small
 * fake shell (shell-commands.ts) and `npm run dev` starts a PreviewRuntime
 * that compiles the project with esbuild-wasm.
 */
import { MemoryFileSystem } from './memory-fs';
import { PreviewRuntime, buildForProduction, defaultCompiler, type Compiler } from './preview/runtime';
import { createCommandProcess, createShellProcess, type CommandHost, type DevServerHandle } from './shell-commands';
import type {
  PortListener,
  PreviewMessage,
  PreviewMessageListener,
  ServerReadyListener,
  SpawnOptions,
  Unsubscribe,
  WebContainer,
  WebContainerInternal,
  WebContainerProcess,
} from '~/lib/webcontainer/types';
import { WORK_DIR } from '~/utils/constants';

/** The port the fake dev server "listens" on. */
export const PREVIEW_PORT = 5173;

/**
 * Marker URL sent with `port` and `server-ready`. The `.invalid` top-level
 * domain never resolves, so nothing can accidentally load it; the preview
 * HTML comes from `getPreviewHtml(port)` instead.
 */
export const PREVIEW_URL = `https://esbuild-preview.invalid/${PREVIEW_PORT}/`;

export interface WebContainerShimOptions {
  compiler?: Compiler;

  /** Values for `import.meta.env.VITE_*` in the preview. */
  env?: Record<string, string>;

  /** Debounce for rebuilds after file changes (default 300 ms). */
  rebuildDelayMs?: number;
}

/** Event name → listener type for the events the app subscribes to. */
export interface ShimEventMap {
  port: PortListener;
  'server-ready': ServerReadyListener;
  'preview-message': PreviewMessageListener;
}

export type ShimEventName = keyof ShimEventMap;

/** Small typed event emitter. */
export class ShimEventEmitter {
  #listeners: { [K in ShimEventName]: Set<ShimEventMap[K]> } = {
    port: new Set(),
    'server-ready': new Set(),
    'preview-message': new Set(),
  };

  on<K extends ShimEventName>(event: K, listener: ShimEventMap[K]): Unsubscribe {
    const listeners = this.#listeners[event] as Set<ShimEventMap[K]>;
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  emit(event: 'port', ...args: Parameters<PortListener>): void;
  emit(event: 'server-ready', ...args: Parameters<ServerReadyListener>): void;
  emit(event: 'preview-message', message: PreviewMessage): void;
  emit(event: ShimEventName, ...args: unknown[]): void {
    // copy so a listener can unsubscribe while we iterate
    for (const listener of [...this.#listeners[event]]) {
      try {
        (listener as (...a: unknown[]) => void)(...args);
      } catch (error) {
        console.error(`[WebContainerShim] '${event}' listener failed:`, error);
      }
    }
  }
}

export class WebContainerShim implements WebContainer {
  readonly fs: MemoryFileSystem;
  readonly internal: WebContainerInternal;

  #events = new ShimEventEmitter();
  #previewScript: string | undefined;
  #options: WebContainerShimOptions;
  #runtime: PreviewRuntime | undefined;
  #host: CommandHost;

  constructor(workdir: string = WORK_DIR, options: WebContainerShimOptions = {}) {
    this.fs = new MemoryFileSystem(workdir);
    this.internal = this.fs.internal;
    this.#options = options;
    this.#host = {
      fs: this.fs,
      startDevServer: (write) => this.#startDevServer(write),
      buildForProduction: () =>
        buildForProduction(this.fs, this.#options.compiler ?? defaultCompiler, this.#options.env),
    };
  }

  get workdir(): string {
    return this.fs.workdir;
  }

  /** The script passed to `setPreviewScript`, for the future preview iframe. */
  get previewScript(): string | undefined {
    return this.#previewScript;
  }

  /** The running preview runtime, if a dev command is active. */
  get previewRuntime(): PreviewRuntime | undefined {
    return this.#runtime;
  }

  /**
   * The HTML document to show for a port: the latest build, or an error page
   * when the last build failed. Undefined when nothing serves that port.
   */
  getPreviewHtml(port: number): string | undefined {
    return port === PREVIEW_PORT ? this.#runtime?.currentHtml : undefined;
  }

  /**
   * `/bin/jsh` (or `jsh`) gives an interactive shell speaking the OSC 654
   * protocol that app/utils/shell.ts expects. Anything else runs once.
   */
  async spawn(command: string, args: string[] = [], _options?: SpawnOptions): Promise<WebContainerProcess> {
    if (command === '/bin/jsh' || command === 'jsh') {
      return createShellProcess(this.#host);
    }

    return createCommandProcess(this.#host, command, args);
  }

  async #startDevServer(write: (text: string) => void): Promise<DevServerHandle> {
    // one dev server at a time, like a single port
    this.#stopRuntime();

    const runtime = new PreviewRuntime({
      fs: this.fs,
      compiler: this.#options.compiler,
      env: this.#options.env,
      rebuildDelayMs: this.#options.rebuildDelayMs,
      getPreviewScript: () => this.#previewScript,
    });
    this.#runtime = runtime;

    runtime.on('ready', ({ durationMs, warnings }) => {
      write(`built in ${durationMs}ms\n`);

      for (const warning of warnings) {
        write(`warning: ${warning.file ? `${warning.file}: ` : ''}${warning.text}\n`);
      }
    });
    runtime.on('rebuilt', ({ version, durationMs }) => write(`page reload (build ${version}, ${durationMs}ms)\n`));
    runtime.on('build-error', ({ error }) => write(`\x1b[31mBuild failed:\x1b[0m\n${error.message}\n`));

    await runtime.start();

    const stop = () => {
      runtime.stop();

      if (this.#runtime === runtime) {
        this.#runtime = undefined;
        this.#events.emit('port', PREVIEW_PORT, 'close', PREVIEW_URL);
      }
    };

    if (this.#runtime === runtime && runtime.running) {
      this.#events.emit('port', PREVIEW_PORT, 'open', PREVIEW_URL);
      this.#events.emit('server-ready', PREVIEW_PORT, PREVIEW_URL);
    }

    return { url: PREVIEW_URL, stop };
  }

  #stopRuntime() {
    if (this.#runtime) {
      this.#runtime.stop();
      this.#runtime = undefined;
      this.#events.emit('port', PREVIEW_PORT, 'close', PREVIEW_URL);
    }
  }

  on(event: 'port', listener: PortListener): Unsubscribe;
  on(event: 'server-ready', listener: ServerReadyListener): Unsubscribe;
  on(event: 'preview-message', listener: PreviewMessageListener): Unsubscribe;
  on(event: ShimEventName, listener: ShimEventMap[ShimEventName]): Unsubscribe {
    return this.#events.on(event, listener as never);
  }

  /** The emitter behind `on`; the future preview engine calls `events.emit(...)`. */
  get events(): ShimEventEmitter {
    return this.#events;
  }

  async setPreviewScript(scriptSrc: string): Promise<void> {
    this.#previewScript = scriptSrc;
  }
}
