/**
 * Error bridge between the sandboxed preview iframe and the app.
 *
 * Inside the preview, `renderBridgeScript` reports `error`, `unhandledrejection`
 * and `console.error` to `window.parent` as `PreviewMessage`s, wrapped in an
 * envelope with a random per-build token. In the app, the listener from
 * `createPreviewBridgeListener` accepts a message only when it comes from the
 * preview iframe's window, carries the current token and has a valid shape.
 * Everything else is ignored.
 */
import type { PreviewMessage } from '~/lib/webcontainer/types';

export const BRIDGE_SOURCE = 'bolt-esbuild-preview';

/** Longest string accepted from the preview (longer text is cut). */
const MAX_TEXT = 10_000;
const MAX_ARGS = 20;

export interface BridgeConfig {
  token: string;
  previewId: string;
  port: number;

  /** Where to post: the app's origin. `'*'` only when it is unknown (tests). */
  targetOrigin: string;
}

/** A random token for one build. */
export function createBridgeToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The script that runs first inside the preview. Plain ES5 so it never fails to parse. */
export function renderBridgeScript({ token, previewId, port, targetOrigin }: BridgeConfig): string {
  const config = JSON.stringify({ source: BRIDGE_SOURCE, token, previewId, port, targetOrigin });

  return `(function () {
  var config = ${config};

  function text(value) {
    try {
      if (value instanceof Error) return value.stack || value.name + ': ' + value.message;
      if (typeof value === 'string') return value;
      return JSON.stringify(value);
    } catch (e) {
      return String(value);
    }
  }

  function send(message) {
    message.previewId = config.previewId;
    message.port = config.port;
    message.pathname = location.pathname;
    message.search = location.search;
    message.hash = location.hash;

    try {
      window.parent.postMessage({ source: config.source, token: config.token, message: message }, config.targetOrigin);
    } catch (e) {}
  }

  window.addEventListener('error', function (event) {
    // resource load errors (img, script) are not ErrorEvents and have no message
    if (!(event instanceof ErrorEvent)) return;
    var error = event.error;
    send({
      type: 'PREVIEW_UNCAUGHT_EXCEPTION',
      message: (error && error.message) || event.message || 'Unknown error',
      stack: error && error.stack ? String(error.stack) : undefined
    });
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    send({
      type: 'PREVIEW_UNHANDLED_REJECTION',
      message: reason && reason.message ? String(reason.message) : text(reason),
      stack: reason && reason.stack ? String(reason.stack) : undefined
    });
  });

  var originalError = console.error;
  console.error = function () {
    try {
      send({
        type: 'PREVIEW_CONSOLE_ERROR',
        args: Array.prototype.slice.call(arguments, 0, ${MAX_ARGS}).map(text),
        stack: String(new Error().stack || '')
      });
    } catch (e) {}

    return originalError.apply(console, arguments);
  };
})();`;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function cut(value: string) {
  return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
}

/**
 * Validates an envelope posted by the bridge. Returns a clean PreviewMessage
 * (only known fields, strings shortened), or undefined when anything is off.
 */
export function parseBridgeMessage(data: unknown, expectedToken: string | undefined): PreviewMessage | undefined {
  if (!expectedToken || typeof data !== 'object' || data === null) {
    return undefined;
  }

  const envelope = data as { source?: unknown; token?: unknown; message?: unknown };

  if (envelope.source !== BRIDGE_SOURCE || envelope.token !== expectedToken) {
    return undefined;
  }

  const message = envelope.message as Record<string, unknown> | null;

  if (typeof message !== 'object' || message === null) {
    return undefined;
  }

  const { type, previewId, port, pathname, search, hash, stack } = message;

  if (
    !isString(previewId) ||
    typeof port !== 'number' ||
    !Number.isInteger(port) ||
    !isString(pathname) ||
    !isString(search) ||
    !isString(hash)
  ) {
    return undefined;
  }

  const base = { previewId: cut(previewId), port, pathname: cut(pathname), search: cut(search), hash: cut(hash) };

  if (type === 'PREVIEW_UNCAUGHT_EXCEPTION' || type === 'PREVIEW_UNHANDLED_REJECTION') {
    if (!isString(message.message) || (stack !== undefined && !isString(stack))) {
      return undefined;
    }

    return { ...base, type, message: cut(message.message), stack: stack === undefined ? undefined : cut(stack) };
  }

  if (type === 'PREVIEW_CONSOLE_ERROR') {
    const args = message.args;

    if (!Array.isArray(args) || args.length > MAX_ARGS || !args.every(isString) || !isString(stack)) {
      return undefined;
    }

    return { ...base, type, args: args.map(cut), stack: cut(stack) };
  }

  return undefined;
}

export interface PreviewBridgeListenerOptions {
  /** The preview iframe's window right now (it changes when the iframe reloads). */
  getFrameWindow: () => Window | null | undefined;

  /** The token of the build that is shown right now. */
  getToken: () => string | undefined;
  onMessage: (message: PreviewMessage) => void;
}

/** A `message` event handler for `window` that lets only valid bridge messages through. */
export function createPreviewBridgeListener({ getFrameWindow, getToken, onMessage }: PreviewBridgeListenerOptions) {
  return (event: MessageEvent) => {
    const frameWindow = getFrameWindow();

    if (!frameWindow || event.source !== frameWindow) {
      return;
    }

    const message = parseBridgeMessage(event.data, getToken());

    if (message) {
      onMessage(message);
    }
  };
}
