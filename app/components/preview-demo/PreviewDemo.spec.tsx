import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* The demo page with a fake shim: no esbuild, no network. */

const mocks = vi.hoisted(() => ({ shim: undefined as unknown }));

vi.mock('~/lib/webcontainer', () => ({
  get webcontainer() {
    return Promise.resolve(mocks.shim);
  },
}));

vi.mock('~/lib/stores/workbench', async () => {
  const { atom } = await import('nanostores');
  return { workbenchStore: { actionAlert: atom(undefined) } };
});

const { PreviewDemo } = await import('./PreviewDemo.client');
const { EsbuildPreviewFrame } = await import('~/components/workbench/EsbuildPreviewFrame');
const { ESBUILD_PREVIEW_SANDBOX } = await import('~/lib/webcontainer/engine');

const { workbenchStore } = (await import('~/lib/stores/workbench')) as unknown as {
  workbenchStore: { actionAlert: { set: (value: unknown) => void } };
};

type Listener = (...args: any[]) => void;

function createFakeShim() {
  const files = new Map<string, string>();
  const serverReady = new Set<Listener>();
  const updates = new Set<Listener>();
  const kill = vi.fn();

  const shim = {
    files,
    kill,
    fs: {
      readdir: vi.fn(async () => [...new Set([...files.keys()].map((path) => path.split('/')[0]))]),
      rm: vi.fn(async (entry: string) => {
        for (const path of [...files.keys()]) {
          if (path === entry || path.startsWith(`${entry}/`)) {
            files.delete(path);
          }
        }
      }),
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async (path: string, content: string) => {
        files.set(path, content);
      }),
      readFile: vi.fn(async (path: string) => {
        if (!files.has(path)) {
          throw new Error('ENOENT');
        }

        return files.get(path)!;
      }),
    },
    spawn: vi.fn(async () => ({
      output: new ReadableStream({ start: (controller) => controller.close() }),
      exit: new Promise(() => undefined),
      input: new WritableStream(),
      kill,
      resize: () => undefined,
    })),
    getPreviewHtml: vi.fn(() => '<!doctype html><h1>demo</h1>'),
    getPreviewBridgeToken: vi.fn(() => 'token'),
    rebuildPreview: vi.fn(async () => undefined),
    events: { emit: vi.fn() },
    on: vi.fn((event: string, listener: Listener) => {
      if (event === 'server-ready') {
        serverReady.add(listener);
      }

      return () => serverReady.delete(listener);
    }),
    onPreviewUpdate: vi.fn((listener: Listener) => {
      updates.add(listener);
      return () => updates.delete(listener);
    }),
    ready(port = 5173) {
      serverReady.forEach((listener) => listener(port, `https://esbuild-preview.invalid/${port}/`));
    },
    update(update: Record<string, unknown>) {
      updates.forEach((listener) => listener({ port: 5173, ...update }));
    },
  };

  return shim;
}

const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
  });

let shim: ReturnType<typeof createFakeShim>;

beforeEach(() => {
  shim = createFakeShim();
  mocks.shim = shim;
});

afterEach(() => {
  workbenchStore.actionAlert.set(undefined);
});

describe('EsbuildPreviewFrame', () => {
  it('is the one sandboxed iframe: sandbox set, never allow-same-origin, no src', () => {
    render(<EsbuildPreviewFrame srcDoc="<p>hi</p>" />);

    const iframe = screen.getByTitle('preview');
    expect(iframe.getAttribute('sandbox')).toBe(ESBUILD_PREVIEW_SANDBOX);
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(iframe.hasAttribute('src')).toBe(false);
    expect(iframe.getAttribute('srcdoc')).toBe('<p>hi</p>');
  });
});

describe('PreviewDemo', () => {
  it('writes the Counter project, runs npm run dev and shows the sandboxed iframe', async () => {
    render(<PreviewDemo />);
    await flush();

    fireEvent.click(screen.getByText('Counter'));
    await flush();

    expect(shim.spawn).toHaveBeenCalledWith('npm', ['run', 'dev']);
    expect(shim.files.get('src/App.tsx')).toContain('Count is {count}');
    expect(shim.files.has('package.json')).toBe(true);

    act(() => shim.ready());
    act(() => shim.update({ kind: 'ready', version: 1, durationMs: 123 }));
    await flush();

    const iframe = screen.getByTitle('preview');
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-modals allow-popups');
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(iframe.getAttribute('srcdoc')).toContain('<h1>demo</h1>');
    expect(screen.getByText(/First build: 123 ms/)).toBeTruthy();
  });

  it('switching projects stops the old dev server and replaces the files', async () => {
    render(<PreviewDemo />);
    await flush();

    fireEvent.click(screen.getByText('Counter'));
    await flush();
    fireEvent.click(screen.getByText('Todo list'));
    await flush();

    expect(shim.kill).toHaveBeenCalledTimes(1);
    expect(shim.files.get('src/App.tsx')).toContain('Todo list');
    expect(shim.files.get('src/App.tsx')).not.toContain('Count is');
  });

  it('"Edit heading" changes the h1 and logs the rebuild time', async () => {
    render(<PreviewDemo />);
    await flush();

    fireEvent.click(screen.getByText('Counter'));
    await flush();
    fireEvent.click(screen.getByText('Edit heading'));
    await flush();

    expect(shim.files.get('src/App.tsx')).toMatch(/<h1>Edited at [^<]+<\/h1>/);

    act(() => shim.update({ kind: 'rebuilt', version: 2, durationMs: 42 }));
    expect(screen.getByText(/Rebuild #2: 42 ms, \d+ ms after the edit/)).toBeTruthy();
  });

  it('shows build errors and preview alerts in the log', async () => {
    render(<PreviewDemo />);
    await flush();

    fireEvent.click(screen.getByText('Compile error'));
    await flush();

    act(() =>
      shim.update({
        kind: 'build-error',
        error: { message: 'x', messages: [{ text: 'Could not resolve "./components/Missing"' }] },
      }),
    );
    expect(screen.getByText(/Build failed.*Could not resolve/)).toBeTruthy();

    act(() =>
      workbenchStore.actionAlert.set({
        type: 'preview',
        title: 'Uncaught Exception',
        description: 'boom',
        content: '',
      }),
    );
    expect(screen.getByText(/Alert: Uncaught Exception: boom/)).toBeTruthy();
  });
});
