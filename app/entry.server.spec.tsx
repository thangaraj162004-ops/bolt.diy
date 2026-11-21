import type { EntryContext, RouterContextProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The document response headers, per engine. React rendering is replaced by an
 * empty stream; VITE_PREVIEW_ENGINE is read when the modules load, so each case
 * re-imports them.
 */

vi.mock('react-dom/server', () => ({
  renderToReadableStream: async () => Object.assign(new ReadableStream(), { allReady: Promise.resolve() }),
}));

async function documentHeaders(engine: string | undefined) {
  vi.resetModules();

  if (engine !== undefined) {
    vi.stubEnv('VITE_PREVIEW_ENGINE', engine);
  }

  const { default: handleRequest } = await import('./entry.server');

  const response = await handleRequest(
    new Request('http://localhost/'),
    200,
    new Headers(),
    { isSpaMode: false } as unknown as EntryContext,
    {} as RouterContextProvider,
  );

  return response.headers;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('entry.server isolation headers', () => {
  it('sends COEP and COOP for the default (webcontainer) engine', async () => {
    const headers = await documentHeaders(undefined);

    expect(headers.get('Cross-Origin-Embedder-Policy')).toBe('credentialless');
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(headers.get('Content-Type')).toBe('text/html');
  });

  it('sends them for VITE_PREVIEW_ENGINE=webcontainer', async () => {
    const headers = await documentHeaders('webcontainer');

    expect(headers.get('Cross-Origin-Embedder-Policy')).toBe('credentialless');
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  it('sends neither for VITE_PREVIEW_ENGINE=esbuild', async () => {
    const headers = await documentHeaders('esbuild');

    expect(headers.has('Cross-Origin-Embedder-Policy')).toBe(false);
    expect(headers.has('Cross-Origin-Opener-Policy')).toBe(false);
    expect(headers.get('Content-Type')).toBe('text/html');
  });
});
