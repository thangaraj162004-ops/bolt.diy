import type { EntryContext, RouterContextProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The document response headers. React rendering is replaced by an empty
 * stream. The app never sends cross-origin isolation headers: the esbuild
 * preview does not need them, and payments and login stay on normal pages.
 */

vi.mock('react-dom/server', () => ({
  renderToReadableStream: async () => Object.assign(new ReadableStream(), { allReady: Promise.resolve() }),
}));

async function documentHeaders() {
  vi.resetModules();

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

describe('entry.server headers', () => {
  it('sends HTML without COEP or COOP', async () => {
    const headers = await documentHeaders();

    expect(headers.get('Content-Type')).toBe('text/html');
    expect(headers.has('Cross-Origin-Embedder-Policy')).toBe(false);
    expect(headers.has('Cross-Origin-Opener-Policy')).toBe(false);
  });

  it('ignores an old VITE_PREVIEW_ENGINE value', async () => {
    vi.stubEnv('VITE_PREVIEW_ENGINE', 'webcontainer');

    const headers = await documentHeaders();

    expect(headers.has('Cross-Origin-Embedder-Policy')).toBe(false);
    expect(headers.has('Cross-Origin-Opener-Policy')).toBe(false);
  });
});
