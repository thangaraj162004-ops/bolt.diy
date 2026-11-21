/**
 * Browser-only stand-in for WebContainer, used when
 * `VITE_PREVIEW_ENGINE=esbuild`. It keeps files in memory and does not run
 * processes yet; the esbuild-wasm preview will be built on top of it.
 */
import { MemoryFileSystem } from './memory-fs';
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

export const SPAWN_NOT_SUPPORTED_MESSAGE = 'Commands are not supported in the browser preview yet.';

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

/** A process that only reports that commands are not supported yet. */
export function createUnsupportedProcess(command: string, args: string[]): WebContainerProcess {
  const commandLine = [command, ...args].join(' ');

  return {
    exit: Promise.resolve(1),
    input: new WritableStream<string>({
      write() {
        // input is accepted and ignored
      },
    }),
    output: new ReadableStream<string>({
      start(controller) {
        controller.enqueue(`${SPAWN_NOT_SUPPORTED_MESSAGE} (${commandLine})\r\n`);
        controller.close();
      },
    }),
    kill() {
      // nothing is running
    },
    resize() {
      // there is no terminal to resize
    },
  };
}

export class WebContainerShim implements WebContainer {
  readonly fs: MemoryFileSystem;
  readonly internal: WebContainerInternal;

  #events = new ShimEventEmitter();
  #previewScript: string | undefined;

  constructor(workdir: string = WORK_DIR) {
    this.fs = new MemoryFileSystem(workdir);
    this.internal = this.fs.internal;
  }

  get workdir(): string {
    return this.fs.workdir;
  }

  /** The script passed to `setPreviewScript`, for the future preview iframe. */
  get previewScript(): string | undefined {
    return this.#previewScript;
  }

  async spawn(command: string, args: string[], _options?: SpawnOptions): Promise<WebContainerProcess> {
    return createUnsupportedProcess(command, args);
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
