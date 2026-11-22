import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPreviewDemoEnabled } from '~/lib/webcontainer/engine';

/*
 * /preview-demo exists only with VITE_PREVIEW_DEMO=1. The flag is read when
 * the loader runs. An old VITE_PREVIEW_ENGINE value has no effect.
 */

async function loadWith(engine: string | undefined, demo: string | undefined) {
  vi.unstubAllEnvs();

  // undefined removes the variable, even when the shell running the tests sets it
  vi.stubEnv('VITE_PREVIEW_ENGINE', engine);
  vi.stubEnv('VITE_PREVIEW_DEMO', demo);

  const { loader } = await import('./preview-demo');

  try {
    return { result: loader(), thrown: undefined };
  } catch (error) {
    return { result: undefined, thrown: error };
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/preview-demo loader', () => {
  it.each([
    ['no flags', undefined, undefined],
    ['demo flag missing (old engine value set)', 'esbuild', undefined],
    ['demo flag 0', undefined, '0'],
    ['demo flag true (only "1" counts)', undefined, 'true'],
  ])('returns a plain 404 when %s', async (_label, engine, demo) => {
    const { thrown } = await loadWith(engine, demo);

    expect(thrown).toBeInstanceOf(Response);

    const response = thrown as Response;
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe('Not Found');
  });

  it.each([
    ['alone', undefined],
    ['with an old VITE_PREVIEW_ENGINE=webcontainer', 'webcontainer'],
  ])('is enabled with VITE_PREVIEW_DEMO=1 %s', async (_label, engine) => {
    const { result, thrown } = await loadWith(engine, '1');

    expect(thrown).toBeUndefined();
    expect(result).toBeNull();
  });
});

describe('isPreviewDemoEnabled', () => {
  it('needs VITE_PREVIEW_DEMO=1', () => {
    expect(isPreviewDemoEnabled('1')).toBe(true);
    expect(isPreviewDemoEnabled(1)).toBe(true);
    expect(isPreviewDemoEnabled('')).toBe(false);
    expect(isPreviewDemoEnabled('true')).toBe(false);
    expect(isPreviewDemoEnabled(null)).toBe(false);

    vi.stubEnv('VITE_PREVIEW_DEMO', undefined);
    expect(isPreviewDemoEnabled()).toBe(false);
  });
});
