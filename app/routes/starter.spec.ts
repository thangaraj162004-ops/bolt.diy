import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/starter', () => {
  it.each([undefined, 'webcontainer', 'esbuild'])(
    'goes back to the start page (old VITE_PREVIEW_ENGINE=%s is ignored)',
    async (engine) => {
      vi.resetModules();

      if (engine !== undefined) {
        vi.stubEnv('VITE_PREVIEW_ENGINE', engine);
      }

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
    },
  );
});
