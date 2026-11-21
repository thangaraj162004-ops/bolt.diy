import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPreviewDemoEnabled } from '~/lib/webcontainer/engine';

/*
 * /preview-demo exists only with VITE_PREVIEW_ENGINE=esbuild AND
 * VITE_PREVIEW_DEMO=1. The flags are read when the loader runs.
 */

async function loadWith(engine: string | undefined, demo: string | undefined) {
  vi.unstubAllEnvs();

  if (engine !== undefined) {
    vi.stubEnv('VITE_PREVIEW_ENGINE', engine);
  }

  if (demo !== undefined) {
    vi.stubEnv('VITE_PREVIEW_DEMO', demo);
  }

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
    ['engine off (default)', undefined, '1'],
    ['engine webcontainer', 'webcontainer', '1'],
    ['demo flag missing', 'esbuild', undefined],
    ['demo flag 0', 'esbuild', '0'],
    ['demo flag true (only "1" counts)', 'esbuild', 'true'],
  ])('returns a plain 404 when %s', async (_label, engine, demo) => {
    const { thrown } = await loadWith(engine, demo);

    expect(thrown).toBeInstanceOf(Response);

    const response = thrown as Response;
    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).toBe('Not Found');
  });

  it('is enabled with VITE_PREVIEW_ENGINE=esbuild and VITE_PREVIEW_DEMO=1', async () => {
    const { result, thrown } = await loadWith('esbuild', '1');

    expect(thrown).toBeUndefined();
    expect(result).toBeNull();
  });
});

describe('isPreviewDemoEnabled', () => {
  it('needs both flags', () => {
    expect(isPreviewDemoEnabled('esbuild', '1')).toBe(true);
    expect(isPreviewDemoEnabled('esbuild', 1)).toBe(true);
    expect(isPreviewDemoEnabled('webcontainer', '1')).toBe(false);
    expect(isPreviewDemoEnabled('esbuild', '')).toBe(false);
    expect(isPreviewDemoEnabled(undefined, undefined)).toBe(false);
  });
});
