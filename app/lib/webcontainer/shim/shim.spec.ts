import { describe, expect, it, vi } from 'vitest';
import { ShimEventEmitter, WebContainerShim } from './shim';
import type { PreviewMessage, WebContainer } from '~/lib/webcontainer/types';
import { WORK_DIR } from '~/utils/constants';

async function readAll(stream: ReadableStream<string>) {
  let text = '';

  const reader = stream.getReader();

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      return text;
    }

    text += value;
  }
}

const previewMessage: PreviewMessage = {
  type: 'PREVIEW_UNCAUGHT_EXCEPTION',
  message: 'boom',
  stack: undefined,
  previewId: 'p1',
  port: 5173,
  pathname: '/',
  search: '',
  hash: '',
};

describe('WebContainerShim', () => {
  it('uses the app work directory and an in-memory file system', async () => {
    const shim: WebContainer = new WebContainerShim();

    expect(shim.workdir).toBe(WORK_DIR);

    await shim.fs.writeFile('index.html', '<h1>hi</h1>');
    expect(await shim.fs.readFile(`${WORK_DIR}/index.html`, 'utf-8')).toBe('<h1>hi</h1>');
  });

  it('wires internal.watchPaths to the file system', async () => {
    const shim = new WebContainerShim();
    const callback = vi.fn();

    shim.internal.watchPaths({ include: [`${WORK_DIR}/**`] }, callback);
    await shim.fs.writeFile('a.txt', 'a');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(callback).toHaveBeenCalledWith([expect.objectContaining({ type: 'add_file', path: `${WORK_DIR}/a.txt` })]);
  });

  it('stores the preview script', async () => {
    const shim = new WebContainerShim();

    expect(shim.previewScript).toBeUndefined();
    await shim.setPreviewScript('console.log("inspector")');
    expect(shim.previewScript).toBe('console.log("inspector")');
  });

  it('spawns a one-off process for an unsupported command that exits with 127', async () => {
    const shim = new WebContainerShim();
    const process = await shim.spawn('python', ['app.py'], { terminal: { cols: 80, rows: 24 } });

    const output = await readAll(process.output);
    expect(output).toContain('command not supported in the browser preview: python');
    await expect(process.exit).resolves.toBe(127);

    const writer = process.input.getWriter();
    await expect(writer.write('ls\n')).resolves.toBeUndefined();

    expect(() => process.kill()).not.toThrow();
    expect(() => process.resize({ cols: 100, rows: 30 })).not.toThrow();
  });

  it('delivers port, server-ready and preview-message events to on() listeners', () => {
    const shim = new WebContainerShim();
    const onPort = vi.fn();
    const onReady = vi.fn();
    const onMessage = vi.fn();

    shim.on('port', onPort);
    shim.on('server-ready', onReady);
    shim.on('preview-message', onMessage);

    shim.events.emit('port', 5173, 'open', 'https://preview.local');
    shim.events.emit('server-ready', 5173, 'https://preview.local');
    shim.events.emit('preview-message', previewMessage);

    expect(onPort).toHaveBeenCalledWith(5173, 'open', 'https://preview.local');
    expect(onReady).toHaveBeenCalledWith(5173, 'https://preview.local');
    expect(onMessage).toHaveBeenCalledWith(previewMessage);
  });
});

describe('ShimEventEmitter', () => {
  it('stops calling a listener after its unsubscribe function runs', () => {
    const emitter = new ShimEventEmitter();
    const listener = vi.fn();

    const unsubscribe = emitter.on('server-ready', listener);
    emitter.emit('server-ready', 1, 'a');
    unsubscribe();
    emitter.emit('server-ready', 2, 'b');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(1, 'a');
  });

  it('only calls listeners for the emitted event', () => {
    const emitter = new ShimEventEmitter();
    const onPort = vi.fn();
    const onReady = vi.fn();

    emitter.on('port', onPort);
    emitter.on('server-ready', onReady);
    emitter.emit('port', 3000, 'close', 'u');

    expect(onPort).toHaveBeenCalledWith(3000, 'close', 'u');
    expect(onReady).not.toHaveBeenCalled();
  });

  it('keeps notifying other listeners when one throws or unsubscribes during emit', () => {
    const emitter = new ShimEventEmitter();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const second = vi.fn();

    const unsubscribeFirst = emitter.on('port', () => {
      unsubscribeFirst();
      throw new Error('listener failed');
    });
    emitter.on('port', second);

    emitter.emit('port', 1, 'open', 'u');
    emitter.emit('port', 2, 'open', 'u');

    expect(second).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
