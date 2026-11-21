/**
 * Keeps a live preview of the project in the shim's in-memory file system:
 * builds once on start, rebuilds (debounced) when files change, and keeps the
 * latest HTML document and build error.
 */
import { createBridgeToken } from './bridge';
import { BuildError, buildProject, projectFilesFromFileSystem, type BuildInput, type BuildResult } from './compiler';
import { renderPreviewHtml } from './html-template';
import type { MemoryFileSystem } from '~/lib/webcontainer/shim/memory-fs';
import type { Unsubscribe } from '~/lib/webcontainer/types';

export const DEFAULT_REBUILD_DELAY_MS = 300;

/** Folders whose changes never trigger a rebuild (`dist` is where `npm run build` writes). */
const IGNORED_FOLDERS = ['**/node_modules', '.git', 'dist'];

export interface Compiler {
  buildProject(input: BuildInput): Promise<BuildResult>;
}

export const defaultCompiler: Compiler = { buildProject };

export interface PreviewRuntimeOptions {
  fs: MemoryFileSystem;
  compiler?: Compiler;

  /** Returns the script set with `setPreviewScript` (read at every build). */
  getPreviewScript?: () => string | undefined;
  env?: Record<string, string>;
  rebuildDelayMs?: number;

  /** When set, every build gets the error bridge with a fresh random token. */
  bridge?: { previewId: string; port: number; targetOrigin: string };
}

export interface ReadyEvent {
  html: string;
  version: number;

  /** Milliseconds the build took. */
  durationMs: number;
  warnings: BuildResult['warnings'];
}

export interface BuildErrorEvent {
  error: BuildError;
}

export interface PreviewRuntimeEvents {
  /** First successful build. */
  ready: (event: ReadyEvent) => void;

  /** Every later successful build. */
  rebuilt: (event: ReadyEvent) => void;
  'build-error': (event: BuildErrorEvent) => void;
}

function toBuildError(error: unknown): BuildError {
  if (error instanceof BuildError) {
    return error;
  }

  return new BuildError([{ text: error instanceof Error ? error.message : String(error) }]);
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** A small page that shows a build error inside the preview. */
export function renderBuildErrorHtml(error: BuildError): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Build error</title>
    <style>
      body { margin: 0; padding: 24px; font-family: ui-monospace, monospace; background: #1e1e1e; color: #f5f5f5; }
      h1 { font-size: 16px; color: #ff6b6b; }
      pre { white-space: pre-wrap; font-size: 13px; line-height: 1.5; }
    </style>
  </head>
  <body>
    <h1>The preview could not be built</h1>
    <pre>${escapeHtml(error.message)}</pre>
  </body>
</html>`;
}

export class PreviewRuntime {
  #fs: MemoryFileSystem;
  #compiler: Compiler;
  #getPreviewScript: () => string | undefined;
  #env: Record<string, string> | undefined;
  #delay: number;
  #bridge: PreviewRuntimeOptions['bridge'];
  #bridgeToken: string | undefined;

  #listeners: { [K in keyof PreviewRuntimeEvents]: Set<PreviewRuntimeEvents[K]> } = {
    ready: new Set(),
    rebuilt: new Set(),
    'build-error': new Set(),
  };

  #html: string | undefined;
  #version = 0;
  #lastError: BuildError | undefined;

  #running = false;
  #stopWatching: (() => void) | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #building: Promise<void> | undefined;
  #dirty = false;

  constructor(options: PreviewRuntimeOptions) {
    this.#fs = options.fs;
    this.#compiler = options.compiler ?? defaultCompiler;
    this.#getPreviewScript = options.getPreviewScript ?? (() => undefined);
    this.#env = options.env;
    this.#delay = options.rebuildDelayMs ?? DEFAULT_REBUILD_DELAY_MS;
    this.#bridge = options.bridge;
  }

  /** Token of the error bridge in the current HTML (changes with every successful build). */
  get bridgeToken(): string | undefined {
    return this.#lastError ? undefined : this.#bridgeToken;
  }

  /** Latest successful HTML document, if any. */
  get html(): string | undefined {
    return this.#html;
  }

  /** Increases by one after every successful build (0 before the first). */
  get version(): number {
    return this.#version;
  }

  /** The error of the most recent build, or undefined when it succeeded. */
  get lastError(): BuildError | undefined {
    return this.#lastError;
  }

  get running(): boolean {
    return this.#running;
  }

  /** What the preview should show now: the build error page, or the latest HTML. */
  get currentHtml(): string | undefined {
    return this.#lastError ? renderBuildErrorHtml(this.#lastError) : this.#html;
  }

  on<K extends keyof PreviewRuntimeEvents>(event: K, listener: PreviewRuntimeEvents[K]): Unsubscribe {
    const listeners = this.#listeners[event] as Set<PreviewRuntimeEvents[K]>;
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  /** Builds once and starts watching. Resolves after the first build, whether it worked or not. */
  async start(): Promise<void> {
    if (this.#running) {
      // already started: wait for a build in progress, if any
      await this.#building;
      return;
    }

    this.#running = true;
    this.#stopWatching = this.#fs.watchPaths({ include: [`${this.#fs.workdir}/**`], exclude: IGNORED_FOLDERS }, () =>
      this.#scheduleRebuild(),
    );

    await this.rebuild();
  }

  /** Stops watching and cancels pending rebuilds. A build already running finishes but emits nothing. */
  stop(): void {
    this.#running = false;
    this.#stopWatching?.();
    this.#stopWatching = undefined;

    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  /** Builds now (or right after the build in progress). */
  rebuild(): Promise<void> {
    if (this.#building) {
      this.#dirty = true;
      return this.#building;
    }

    this.#building = this.#build().finally(() => {
      this.#building = undefined;

      if (this.#dirty && this.#running) {
        this.#dirty = false;
        void this.rebuild();
      }
    });

    return this.#building;
  }

  #scheduleRebuild() {
    if (!this.#running) {
      return;
    }

    if (this.#timer) {
      clearTimeout(this.#timer);
    }

    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      void this.rebuild();
    }, this.#delay);
  }

  async #build() {
    const startedAt = Date.now();

    try {
      const result = await this.#compiler.buildProject({ files: projectFilesFromFileSystem(this.#fs), env: this.#env });
      const indexHtml = await this.#readIndexHtml();

      const token = this.#bridge ? createBridgeToken() : undefined;

      const html = renderPreviewHtml({
        bridge: this.#bridge && token ? { ...this.#bridge, token } : undefined,
        js: result.js,
        css: result.css,
        indexHtml,
        previewScript: this.#getPreviewScript(),
        usesTailwind: result.usesTailwind,
      });

      if (!this.#running) {
        return;
      }

      this.#html = html;
      this.#bridgeToken = token;
      this.#lastError = undefined;
      this.#version++;

      const event: ReadyEvent = {
        html,
        version: this.#version,
        durationMs: Date.now() - startedAt,
        warnings: result.warnings,
      };
      this.#emit(this.#version === 1 ? 'ready' : 'rebuilt', event);
    } catch (error) {
      if (!this.#running) {
        return;
      }

      this.#lastError = toBuildError(error);
      this.#emit('build-error', { error: this.#lastError });
    }
  }

  async #readIndexHtml() {
    try {
      return await this.#fs.readFile('index.html', 'utf-8');
    } catch {
      return undefined;
    }
  }

  #emit<K extends keyof PreviewRuntimeEvents>(event: K, payload: Parameters<PreviewRuntimeEvents[K]>[0]) {
    for (const listener of [...this.#listeners[event]]) {
      try {
        (listener as (value: typeof payload) => void)(payload);
      } catch (error) {
        console.error(`[PreviewRuntime] '${event}' listener failed:`, error);
      }
    }
  }
}

export interface ProductionBuildResult {
  /** Absolute path of the written file. */
  outputFile: string;
  bytes: number;
  warnings: BuildResult['warnings'];
}

/**
 * `npm run build`: compiles minified, without source maps, and writes
 * `dist/index.html` (everything inlined). Throws a BuildError on failure.
 */
export async function buildForProduction(
  fs: MemoryFileSystem,
  compiler: Compiler = defaultCompiler,
  env?: Record<string, string>,
): Promise<ProductionBuildResult> {
  let result: BuildResult;

  try {
    result = await compiler.buildProject({
      files: projectFilesFromFileSystem(fs),
      env,
      mode: 'production',
      minify: true,
      sourcemap: false,
    });
  } catch (error) {
    throw toBuildError(error);
  }

  let indexHtml: string | undefined;

  try {
    indexHtml = await fs.readFile('index.html', 'utf-8');
  } catch {
    indexHtml = undefined;
  }

  const html = renderPreviewHtml({ js: result.js, css: result.css, indexHtml, usesTailwind: result.usesTailwind });

  await fs.mkdir('dist', { recursive: true });
  await fs.writeFile('dist/index.html', html);

  return {
    outputFile: `${fs.workdir}/dist/index.html`,
    bytes: new TextEncoder().encode(html).byteLength,
    warnings: result.warnings,
  };
}
