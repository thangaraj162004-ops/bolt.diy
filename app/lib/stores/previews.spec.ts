import { describe, expect, it, vi } from 'vitest';
import { PreviewsStore } from './previews';
import type { WebContainer } from '~/lib/webcontainer/types';

function createStore() {
  const webcontainer = { on: vi.fn() } as unknown as WebContainer;
  return new PreviewsStore(Promise.resolve(webcontainer));
}

describe('PreviewsStore.getPreviewId', () => {
  it('recognises the esbuild marker URL and uses the port as the id', () => {
    const store = createStore();

    expect(store.getPreviewId('https://esbuild-preview.invalid/5173/')).toBe('5173');
    expect(store.getPreviewId('https://esbuild-preview.invalid/3000/')).toBe('3000');
  });

  it('rejects other URLs', () => {
    const store = createStore();

    expect(store.getPreviewId('https://example.com/5173/')).toBeNull();
    expect(store.getPreviewId('https://esbuild-preview.invalid.example.com/5173/')).toBeNull();
    expect(store.getPreviewId('https://k3j2h1.local-credentialless.webcontainer-api.io/')).toBeNull();
  });
});
