import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/chat/StarterTemplateImport.client', () => ({ StarterTemplateImport: () => null }));
vi.mock('~/components/header/Header', () => ({ Header: () => null }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/starter', () => {
  it('goes back to the start page with the esbuild engine (no starter templates)', async () => {
    vi.stubEnv('VITE_PREVIEW_ENGINE', 'esbuild');

    const { loader } = await import('./starter');

    let thrown: unknown;

    try {
      loader();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get('Location')).toBe('/');
  });

  it('works as before with the WebContainer engine', async () => {
    const { loader } = await import('./starter');
    expect(loader()).toBeNull();
  });
});
