import { describe, expect, it } from 'vitest';
import { renderPreviewHtml } from './html-template';
import { renderStorageShimScript } from './storage-shim';

/** Runs the script against a fake window whose storage getters behave like a sandboxed iframe. */
function runInWindow(blocked: boolean) {
  const realStorage = { getItem: () => null, marker: 'real' };
  const fakeWindow: Record<string, unknown> = {};

  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(fakeWindow, name, {
      configurable: true,
      get() {
        if (blocked) {
          throw new DOMException("Failed to read the 'localStorage' property from 'Window'", 'SecurityError');
        }

        return realStorage;
      },
    });
  }

  new Function('window', renderStorageShimScript())(fakeWindow);

  return { fakeWindow, realStorage };
}

describe('storage shim', () => {
  it('replaces blocked localStorage and sessionStorage with a working in-memory Storage', () => {
    const { fakeWindow } = runInWindow(true);
    const storage = fakeWindow.localStorage as Storage;

    storage.setItem('count', 3 as unknown as string);
    storage.setItem('theme', 'dark');
    expect(storage.getItem('count')).toBe('3');
    expect(storage.length).toBe(2);
    expect(storage.key(1)).toBe('theme');
    expect(storage.getItem('missing')).toBeNull();

    storage.removeItem('count');
    expect(storage.length).toBe(1);
    expect(storage.key(0)).toBe('theme');

    storage.clear();
    expect(storage.length).toBe(0);

    expect(() => (fakeWindow.sessionStorage as Storage).setItem('a', 'b')).not.toThrow();
    expect(fakeWindow.sessionStorage).not.toBe(fakeWindow.localStorage);
  });

  it('leaves working storage alone', () => {
    const { fakeWindow, realStorage } = runInWindow(false);
    expect(fakeWindow.localStorage).toBe(realStorage);
  });

  it('is the first script in the preview document', () => {
    const html = renderPreviewHtml({
      js: 'app()',
      css: '',
      previewScript: 'inspector()',
      bridge: { token: 't', previewId: '1', port: 1, targetOrigin: '*' },
    });

    const storage = html.indexOf('data-ca-preview-storage');
    expect(storage).toBeGreaterThan(-1);
    expect(storage).toBeLessThan(html.indexOf('data-ca-preview-bridge'));
    expect(storage).toBeLessThan(html.indexOf('data-ca-preview-bundle'));
  });
});
