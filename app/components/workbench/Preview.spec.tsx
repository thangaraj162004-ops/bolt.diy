import { act, fireEvent, render, screen } from '@testing-library/react';
import { atom } from 'nanostores';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewMessage } from '~/lib/webcontainer/types';
import type { ActionAlert } from '~/types/actions';

/*
 * The esbuild-engine preview: a sandboxed srcdoc iframe fed by the shim, and
 * the error bridge listener. The shim is a small fake so no esbuild runs here.
 */

const MARKER_URL = 'https://esbuild-preview.invalid/5173/';
const TOKEN = 'token-of-current-build';

const mocks = vi.hoisted(() => ({
  shim: undefined as unknown,
}));

vi.mock('~/lib/webcontainer', () => ({
  get webcontainer() {
    return Promise.resolve(mocks.shim);
  },
}));

vi.mock('~/lib/stores/workbench', async () => {
  const { atom: createAtom } = await import('nanostores');

  return { workbenchStore: { previews: createAtom<unknown[]>([]) } };
});

const { workbenchStore } = (await import('~/lib/stores/workbench')) as unknown as {
  workbenchStore: { previews: ReturnType<typeof atom<unknown[]>> };
};

const { Preview } = await import('./Preview');
const { reportPreviewMessage } = await import('~/lib/webcontainer/preview-alerts');
const { ESBUILD_PREVIEW_SANDBOX } = await import('~/lib/webcontainer/engine');

type Update = { port: number; kind: string };

function createFakeShim() {
  const updateListeners = new Set<(update: Update) => void>();
  const actionAlert = atom<ActionAlert | undefined>(undefined);

  const shim = {
    html: '<!doctype html><html><body><h1>build 1</h1></body></html>',
    token: TOKEN as string | undefined,
    actionAlert,
    getPreviewHtml: vi.fn((port: number) => (port === 5173 ? shim.html : undefined)),
    getPreviewBridgeToken: vi.fn((port: number) => (port === 5173 ? shim.token : undefined)),
    rebuildPreview: vi.fn(async () => undefined),
    onPreviewUpdate: vi.fn((listener: (update: Update) => void) => {
      updateListeners.add(listener);
      return () => updateListeners.delete(listener);
    }),
    events: {
      // the real app wires preview-message to this same handler in ~/lib/webcontainer
      emit: vi.fn((_event: 'preview-message', message: PreviewMessage) => reportPreviewMessage(message, actionAlert)),
    },
    update(kind: string) {
      updateListeners.forEach((listener) => listener({ port: 5173, kind }));
    },
  };

  return shim;
}

function validEnvelope(token = TOKEN) {
  return {
    source: 'ca-esbuild-preview',
    token,
    message: {
      type: 'PREVIEW_UNCAUGHT_EXCEPTION',
      message: 'count is not defined',
      stack: 'ReferenceError: count is not defined\n    at App (about:srcdoc:10:5)',
      previewId: '5173',
      port: 5173,
      pathname: 'srcdoc',
      search: '',
      hash: '',
    },
  };
}

async function renderPreview(baseUrl = MARKER_URL) {
  workbenchStore.previews.set([{ port: 5173, ready: true, baseUrl }]);
  render(<Preview />);

  // let the webcontainer promise resolve and the srcdoc state settle
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return screen.getByTitle('preview') as HTMLIFrameElement;
}

function postFrom(source: MessageEventSource | null, data: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, source }));
  });
}

let shim: ReturnType<typeof createFakeShim>;

beforeEach(() => {
  shim = createFakeShim();
  mocks.shim = shim;
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  workbenchStore.previews.set([]);
});

describe('Preview', () => {
  it('renders a sandboxed srcdoc iframe that never has allow-same-origin', async () => {
    const iframe = await renderPreview();

    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-modals allow-popups');
    expect(iframe.getAttribute('sandbox')).toBe(ESBUILD_PREVIEW_SANDBOX);
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(ESBUILD_PREVIEW_SANDBOX).not.toContain('allow-same-origin');
    expect(iframe.hasAttribute('src')).toBe(false);
    expect(iframe.hasAttribute('allow')).toBe(false);
    expect(iframe.getAttribute('srcdoc')).toBe(shim.html);
  });

  it('keeps the sandbox in device mode with the device frame', async () => {
    await renderPreview();

    fireEvent.click(screen.getByTitle('Switch to Device Mode'));
    fireEvent.click(screen.getByTitle('Show Device Frame'));

    const iframe = screen.getByTitle('preview') as HTMLIFrameElement;
    expect(iframe.getAttribute('sandbox')).toBe(ESBUILD_PREVIEW_SANDBOX);
    expect(iframe.getAttribute('srcdoc')).toBe(shim.html);
  });

  it('shows each new build in a fresh iframe (ready, rebuilt, build-error)', async () => {
    const first = await renderPreview();

    shim.html = '<!doctype html><html><body><h1>build 2</h1></body></html>';
    act(() => shim.update('rebuilt'));

    const second = screen.getByTitle('preview') as HTMLIFrameElement;
    expect(second.getAttribute('srcdoc')).toContain('build 2');

    // a new element, so Chromium cannot drop the srcdoc update while the old one is still loading
    expect(second).not.toBe(first);
    expect(first.isConnected).toBe(false);
    expect(second.getAttribute('sandbox')).toBe(ESBUILD_PREVIEW_SANDBOX);

    shim.html = '<!doctype html><html><body><h1>The preview could not be built</h1></body></html>';
    act(() => shim.update('build-error'));
    expect(screen.getByTitle('preview').getAttribute('srcdoc')).toContain('could not be built');
  });

  it('keeps the same iframe when the document did not change', async () => {
    const first = await renderPreview();

    act(() => shim.update('rebuilt'));

    expect(screen.getByTitle('preview')).toBe(first);
  });

  it('shows a placeholder, not an empty iframe, until the first document arrives', async () => {
    shim.html = undefined as unknown as string;
    workbenchStore.previews.set([{ port: 5173, ready: true, baseUrl: MARKER_URL }]);
    render(<Preview />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByTitle('preview')).toBeNull();
    expect(screen.getByTestId('esbuild-preview-pending').textContent).toContain('Starting the preview');

    shim.html = '<!doctype html><html><body><h1>first</h1></body></html>';
    act(() => shim.update('ready'));

    expect(screen.getByTitle('preview').getAttribute('srcdoc')).toContain('first');
  });

  it('rebuilds on reload', async () => {
    await renderPreview();

    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(shim.rebuildPreview).toHaveBeenCalledWith(5173);
  });

  it('has no "open in new tab" or "open in new window", and picking a size opens nothing', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await renderPreview();

    fireEvent.click(screen.getByTitle('Window Size Options'));

    expect(screen.queryByText('Open in new tab')).toBeNull();
    expect(screen.queryByText('Open in new window')).toBeNull();

    fireEvent.click(screen.getByText('iPad Mini'));
    expect(open).not.toHaveBeenCalled();
  });

  it('a valid bridge message from the iframe produces an actionAlert', async () => {
    const iframe = await renderPreview();

    postFrom(iframe.contentWindow, validEnvelope());

    expect(shim.events.emit).toHaveBeenCalledTimes(1);
    expect(shim.actionAlert.get()).toMatchObject({
      type: 'preview',
      title: 'Uncaught Exception',
      description: 'count is not defined',
      source: 'preview',
    });
  });

  it('ignores a message from another window, even with the right token', async () => {
    await renderPreview();

    postFrom(window, validEnvelope());

    expect(shim.events.emit).not.toHaveBeenCalled();
    expect(shim.actionAlert.get()).toBeUndefined();
  });

  it('ignores a message with a wrong or stale token', async () => {
    const iframe = await renderPreview();

    postFrom(iframe.contentWindow, validEnvelope('wrong-token'));
    shim.token = undefined; // e.g. the last build failed
    postFrom(iframe.contentWindow, validEnvelope());

    expect(shim.events.emit).not.toHaveBeenCalled();
    expect(shim.actionAlert.get()).toBeUndefined();
  });

  it('ignores a message with a bad shape', async () => {
    const iframe = await renderPreview();
    const envelope = validEnvelope();

    postFrom(iframe.contentWindow, { ...envelope, message: { ...envelope.message, port: '5173' } });
    postFrom(iframe.contentWindow, { ...envelope, message: { ...envelope.message, type: 'INSPECTOR_CLICK' } });

    expect(shim.events.emit).not.toHaveBeenCalled();
  });
});

describe('Preview with a URL that is not an esbuild marker', () => {
  it('never loads it in an iframe and waits for the shim instead', async () => {
    workbenchStore.previews.set([{ port: 5173, ready: true, baseUrl: 'https://example.com/' }]);
    render(<Preview />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByTitle('preview')).toBeNull();
    expect(document.querySelector('iframe[src]')).toBeNull();
    expect(screen.getByTestId('esbuild-preview-pending')).toBeTruthy();
  });
});
