import { describe, expect, it, vi } from 'vitest';
import {
  BRIDGE_SOURCE,
  createBridgeToken,
  createPreviewBridgeListener,
  parseBridgeMessage,
  renderBridgeScript,
} from './bridge';
import { renderPreviewHtml } from './html-template';

const CONFIG = { token: 'abc123', previewId: '5173', port: 5173, targetOrigin: 'http://localhost:5173' };

/** Runs the bridge script against fake browser globals and returns what it posted. */
function runBridge() {
  const listeners: Record<string, (event: unknown) => void> = {};
  const posted: Array<{ data: unknown; targetOrigin: string }> = [];

  class FakeErrorEvent {
    constructor(
      public message: string,
      public error?: unknown,
    ) {}
  }

  const fakeWindow = {
    parent: { postMessage: (data: unknown, targetOrigin: string) => posted.push({ data, targetOrigin }) },
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = listener;
    },
  };

  const originalError = vi.fn();
  const fakeConsole = { error: originalError };
  const fakeLocation = { pathname: 'srcdoc', search: '?q=1', hash: '#top' };

  new Function('window', 'location', 'console', 'ErrorEvent', renderBridgeScript(CONFIG))(
    fakeWindow,
    fakeLocation,
    fakeConsole,
    FakeErrorEvent,
  );

  return { listeners, posted, fakeConsole, originalError, FakeErrorEvent };
}

describe('bridge script (inside the preview)', () => {
  it('reports uncaught errors as PREVIEW_UNCAUGHT_EXCEPTION with the token and location', () => {
    const bridge = runBridge();
    const { listeners, posted } = bridge;

    listeners.error(new bridge.FakeErrorEvent('boom', new TypeError('boom')));

    expect(posted).toHaveLength(1);
    expect(posted[0].targetOrigin).toBe('http://localhost:5173');
    expect(posted[0].data).toMatchObject({
      source: BRIDGE_SOURCE,
      token: 'abc123',
      message: {
        type: 'PREVIEW_UNCAUGHT_EXCEPTION',
        message: 'boom',
        previewId: '5173',
        port: 5173,
        pathname: 'srcdoc',
        search: '?q=1',
        hash: '#top',
      },
    });
    expect(parseBridgeMessage(posted[0].data, 'abc123')).toBeDefined();
  });

  it('ignores resource load errors (not ErrorEvents)', () => {
    const { listeners, posted } = runBridge();

    listeners.error({ type: 'error', target: 'img' });

    expect(posted).toHaveLength(0);
  });

  it('reports unhandled rejections, with Error and non-Error reasons', () => {
    const { listeners, posted } = runBridge();

    listeners.unhandledrejection({ reason: new Error('nope') });
    listeners.unhandledrejection({ reason: { code: 42 } });

    expect(posted.map(({ data }) => (data as { message: { type: string; message: string } }).message)).toEqual([
      expect.objectContaining({ type: 'PREVIEW_UNHANDLED_REJECTION', message: 'nope' }),
      expect.objectContaining({ type: 'PREVIEW_UNHANDLED_REJECTION', message: '{"code":42}' }),
    ]);
  });

  it('reports console.error as strings and still calls the original console.error', () => {
    const { posted, fakeConsole, originalError } = runBridge();

    fakeConsole.error('failed:', new Error('x'), { a: 1 });

    expect(originalError).toHaveBeenCalledWith('failed:', expect.any(Error), { a: 1 });

    const message = (posted[0].data as { message: { type: string; args: string[] } }).message;
    expect(message.type).toBe('PREVIEW_CONSOLE_ERROR');
    expect(message.args[0]).toBe('failed:');
    expect(message.args[1]).toContain('Error: x');
    expect(message.args[2]).toBe('{"a":1}');
    expect(parseBridgeMessage(posted[0].data, 'abc123')).toMatchObject({ type: 'PREVIEW_CONSOLE_ERROR' });
  });
});

describe('renderPreviewHtml with the bridge', () => {
  it('injects the bridge before every other script, and the bundle last', () => {
    const html = renderPreviewHtml({ js: 'app()', css: '', previewScript: 'inspector()', bridge: CONFIG });

    const bridge = html.indexOf('data-bolt-preview-bridge');
    expect(bridge).toBeGreaterThan(-1);
    expect(bridge).toBeLessThan(html.indexOf('data-bolt-preview-script'));
    expect(bridge).toBeLessThan(html.indexOf('data-bolt-preview-bundle'));
    expect(html).toContain('"token":"abc123"');
  });

  it('has no bridge when none is configured', () => {
    expect(renderPreviewHtml({ js: '', css: '' })).not.toContain('data-bolt-preview-bridge');
  });
});

describe('parseBridgeMessage', () => {
  const valid = {
    source: BRIDGE_SOURCE,
    token: 'abc123',
    message: {
      type: 'PREVIEW_UNHANDLED_REJECTION',
      message: 'x',
      stack: undefined,
      previewId: '5173',
      port: 5173,
      pathname: '/',
      search: '',
      hash: '',
      extra: '<script>',
    },
  };

  it('accepts a valid envelope and keeps only known fields', () => {
    const parsed = parseBridgeMessage(valid, 'abc123');

    expect(parsed).toEqual({
      type: 'PREVIEW_UNHANDLED_REJECTION',
      message: 'x',
      stack: undefined,
      previewId: '5173',
      port: 5173,
      pathname: '/',
      search: '',
      hash: '',
    });
  });

  it.each([
    ['no expected token', valid, undefined],
    ['wrong token', { ...valid, token: 'other' }, 'abc123'],
    ['wrong source', { ...valid, source: 'inspector' }, 'abc123'],
    ['not an object', 'hello', 'abc123'],
    ['unknown type', { ...valid, message: { ...valid.message, type: 'INSPECTOR_CLICK' } }, 'abc123'],
    ['port is a string', { ...valid, message: { ...valid.message, port: '5173' } }, 'abc123'],
    ['message is not a string', { ...valid, message: { ...valid.message, message: { a: 1 } } }, 'abc123'],
    [
      'console args are not strings',
      { ...valid, message: { ...valid.message, type: 'PREVIEW_CONSOLE_ERROR', args: [{}], stack: '' } },
      'abc123',
    ],
  ])('rejects: %s', (_label, data, token) => {
    expect(parseBridgeMessage(data, token)).toBeUndefined();
  });

  it('shortens very long text', () => {
    const parsed = parseBridgeMessage(
      { ...valid, message: { ...valid.message, message: 'x'.repeat(50_000) } },
      'abc123',
    );
    expect(parsed && 'message' in parsed ? parsed.message.length : 0).toBeLessThan(10_010);
  });
});

describe('createPreviewBridgeListener', () => {
  const frameWindow = {} as Window;
  const otherWindow = {} as Window;

  function setup(token: string | undefined) {
    const onMessage = vi.fn();

    const listener = createPreviewBridgeListener({
      getFrameWindow: () => frameWindow,
      getToken: () => token,
      onMessage,
    });

    return { listener, onMessage };
  }

  const envelope = {
    source: BRIDGE_SOURCE,
    token: 'abc123',
    message: {
      type: 'PREVIEW_UNCAUGHT_EXCEPTION',
      message: 'x',
      previewId: '1',
      port: 1,
      pathname: '',
      search: '',
      hash: '',
    },
  };

  it('passes a valid message from the preview window', () => {
    const { listener, onMessage } = setup('abc123');
    listener({ source: frameWindow, data: envelope } as unknown as MessageEvent);
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'PREVIEW_UNCAUGHT_EXCEPTION' }));
  });

  it('ignores the same message from another window', () => {
    const { listener, onMessage } = setup('abc123');
    listener({ source: otherWindow, data: envelope } as unknown as MessageEvent);
    listener({ source: null, data: envelope } as unknown as MessageEvent);
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('ignores a wrong token and anything when there is no current token', () => {
    const wrong = setup('different');
    wrong.listener({ source: frameWindow, data: envelope } as unknown as MessageEvent);
    expect(wrong.onMessage).not.toHaveBeenCalled();

    const none = setup(undefined);
    none.listener({ source: frameWindow, data: envelope } as unknown as MessageEvent);
    expect(none.onMessage).not.toHaveBeenCalled();
  });
});

describe('createBridgeToken', () => {
  it('returns 32 random hex characters', () => {
    const a = createBridgeToken();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(createBridgeToken()).not.toBe(a);
  });
});
