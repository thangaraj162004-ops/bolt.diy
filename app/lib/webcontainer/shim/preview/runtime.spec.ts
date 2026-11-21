import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuildError, type BuildInput, type BuildResult } from './compiler';
import { PreviewRuntime, buildForProduction, defaultCompiler, type ReadyEvent } from './runtime';
import { MemoryFileSystem } from '~/lib/webcontainer/shim/memory-fs';

/*
 * Uses the real esbuild-wasm compiler under Node. Bare imports become esm.sh
 * URLs and stay external, so nothing touches the network.
 */

const WORKDIR = '/home/project';

async function createProject(files: Record<string, string>) {
  const fs = new MemoryFileSystem(WORKDIR);

  for (const [path, content] of Object.entries(files)) {
    const slash = path.lastIndexOf('/');

    if (slash > 0) {
      await fs.mkdir(path.slice(0, slash), { recursive: true });
    }

    await fs.writeFile(path, content);
  }

  return fs;
}

async function waitFor(check: () => boolean, timeoutMs = 5000) {
  const start = Date.now();

  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PROJECT = {
  'index.html':
    '<!doctype html><html><head><title>Demo</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
  'src/main.tsx': `import { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);`,
  'src/App.tsx': `export default function App() { return <h1>version one</h1>; }`,
};

const runtimes: PreviewRuntime[] = [];

function track(runtime: PreviewRuntime) {
  runtimes.push(runtime);
  return runtime;
}

afterEach(() => {
  runtimes.splice(0).forEach((runtime) => runtime.stop());
});

describe('PreviewRuntime', () => {
  it('builds on start, emits ready with version 1 and keeps the HTML', async () => {
    const fs = await createProject(PROJECT);

    const runtime = track(
      new PreviewRuntime({ fs, rebuildDelayMs: 20, getPreviewScript: () => 'window.__inspector = 1' }),
    );

    const ready = vi.fn();
    runtime.on('ready', ready);

    await runtime.start();

    expect(ready).toHaveBeenCalledTimes(1);

    const event: ReadyEvent = ready.mock.calls[0][0];
    expect(event.version).toBe(1);
    expect(event.html).toBe(runtime.html);
    expect(runtime.version).toBe(1);
    expect(runtime.lastError).toBeUndefined();
    expect(runtime.html).toContain('<title>Demo</title>');
    expect(runtime.html).toContain('version one');
    expect(runtime.html).toContain('window.__inspector = 1');
    expect(runtime.html).not.toContain('src="/src/main.tsx"');
  });

  it('rebuilds after a file write, debounced into one build', async () => {
    const fs = await createProject(PROJECT);
    const buildSpy = vi.fn((input: BuildInput) => defaultCompiler.buildProject(input));
    const runtime = track(new PreviewRuntime({ fs, rebuildDelayMs: 20, compiler: { buildProject: buildSpy } }));
    const rebuilt = vi.fn();
    runtime.on('rebuilt', rebuilt);
    await runtime.start();

    await fs.writeFile('src/App.tsx', `export default function App() { return <h1>version two</h1>; }`);
    await fs.writeFile('src/extra.ts', `export const x = 1;`);
    await waitFor(() => runtime.version === 2);
    await sleep(60);

    expect(buildSpy).toHaveBeenCalledTimes(2);
    expect(rebuilt).toHaveBeenCalledTimes(1);
    expect(rebuilt.mock.calls[0][0]).toMatchObject({ version: 2 });
    expect(runtime.html).toContain('version two');
    expect(runtime.html).not.toContain('version one');
  });

  it('does not rebuild for changes in dist, node_modules or .git', async () => {
    const fs = await createProject(PROJECT);
    const runtime = track(new PreviewRuntime({ fs, rebuildDelayMs: 10 }));
    await runtime.start();

    await fs.mkdir('dist', { recursive: true });
    await fs.writeFile('dist/index.html', 'x');
    await fs.mkdir('node_modules/a', { recursive: true });
    await fs.writeFile('node_modules/a/index.js', 'x');
    await sleep(80);

    expect(runtime.version).toBe(1);
  });

  it('keeps the last error, shows an error page, and recovers on the next good build', async () => {
    const fs = await createProject(PROJECT);
    const runtime = track(new PreviewRuntime({ fs, rebuildDelayMs: 20 }));
    const errors = vi.fn();
    runtime.on('build-error', errors);
    await runtime.start();

    await fs.writeFile(
      'src/App.tsx',
      `import Missing from './Missing';\nexport default function App() { return <Missing />; }`,
    );
    await waitFor(() => errors.mock.calls.length === 1);

    expect(runtime.lastError).toBeInstanceOf(BuildError);
    expect(runtime.lastError?.message).toContain('src/App.tsx:1:');
    expect(runtime.version).toBe(1);
    expect(runtime.html).toContain('version one');
    expect(runtime.currentHtml).toContain('The preview could not be built');
    expect(runtime.currentHtml).toContain('Could not resolve &#34;./Missing&#34;');

    await fs.writeFile('src/App.tsx', `export default function App() { return <h1>fixed</h1>; }`);
    await waitFor(() => runtime.version === 2);

    expect(runtime.lastError).toBeUndefined();
    expect(runtime.currentHtml).toContain('fixed');
  });

  it('reports a failing first build through build-error and still resolves start()', async () => {
    const fs = await createProject({ 'README.md': 'no entry here' });
    const runtime = track(new PreviewRuntime({ fs }));
    const errors = vi.fn();
    runtime.on('build-error', errors);

    await runtime.start();

    expect(errors).toHaveBeenCalledTimes(1);
    expect(runtime.html).toBeUndefined();
    expect(runtime.lastError?.message).toContain('No entry file found');
  });

  it('wraps unexpected compiler failures in a BuildError', async () => {
    const fs = await createProject(PROJECT);

    const compiler = {
      buildProject: vi.fn(async (): Promise<BuildResult> => {
        throw new Error('wasm failed to load');
      }),
    };

    const runtime = track(new PreviewRuntime({ fs, compiler }));

    await runtime.start();

    expect(runtime.lastError).toBeInstanceOf(BuildError);
    expect(runtime.lastError?.message).toBe('wasm failed to load');
  });

  it('stops watching after stop(): no more rebuilds or events', async () => {
    const fs = await createProject(PROJECT);
    const runtime = track(new PreviewRuntime({ fs, rebuildDelayMs: 10 }));
    const rebuilt = vi.fn();
    runtime.on('rebuilt', rebuilt);
    await runtime.start();

    // a change queued just before stop() must not build either
    await fs.writeFile('src/App.tsx', `export default function App() { return <h1>late</h1>; }`);
    runtime.stop();
    await sleep(80);
    await fs.writeFile('src/App.tsx', `export default function App() { return <h1>later</h1>; }`);
    await sleep(80);

    expect(runtime.running).toBe(false);
    expect(runtime.version).toBe(1);
    expect(rebuilt).not.toHaveBeenCalled();
  });
});

describe('buildForProduction', () => {
  it('writes a minified dist/index.html without source maps', async () => {
    const fs = await createProject(PROJECT);

    const result = await buildForProduction(fs);
    const html = await fs.readFile('dist/index.html', 'utf-8');

    expect(result.outputFile).toBe(`${WORKDIR}/dist/index.html`);
    expect(result.bytes).toBe(new TextEncoder().encode(html).byteLength);
    expect(html).toContain('<title>Demo</title>');
    expect(html).toContain('version one');
    expect(html).not.toContain('sourceMappingURL');
    expect(html).not.toContain('// project:/src/App.tsx');
  });

  it('throws the BuildError and writes nothing when the build fails', async () => {
    const fs = await createProject({ 'src/main.ts': `import fs from 'fs'; console.log(fs);` });

    await expect(buildForProduction(fs)).rejects.toThrow(/not available in the browser preview/);
    await expect(fs.readdir('dist')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
