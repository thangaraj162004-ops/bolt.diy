/**
 * Which preview engine the app was built with, plus small helpers that are
 * safe to import anywhere (server, stores, components): no WebContainer or
 * esbuild code is pulled in.
 *
 * `VITE_PREVIEW_ENGINE` is replaced by Vite at BUILD time, in both the client
 * and the server (worker) bundle, so the two always agree. On Cloudflare the
 * value cannot be changed at run time; set it in the build environment.
 */

export type PreviewEngine = 'webcontainer' | 'esbuild';

export function getPreviewEngine(value: unknown = import.meta.env.VITE_PREVIEW_ENGINE): PreviewEngine {
  return value === 'esbuild' ? 'esbuild' : 'webcontainer';
}

export const PREVIEW_ENGINE: PreviewEngine = getPreviewEngine();

/**
 * Starter templates (picked by the model, then downloaded from GitHub) are not
 * used with the esbuild engine: they bring their own tool configs (vite,
 * tsconfig, tailwind, postcss) and frameworks the in-browser compiler cannot
 * run, while the esbuild-preview prompt defines a layout it can.
 */
export function usesStarterTemplates(engine: PreviewEngine = PREVIEW_ENGINE): boolean {
  return engine !== 'esbuild';
}

/** The port the esbuild shim's dev server reports (`npm run dev`). */
export const ESBUILD_DEV_PORT = 5173;

/**
 * The /preview-demo page: only with VITE_PREVIEW_ENGINE=esbuild AND
 * VITE_PREVIEW_DEMO=1 (build time, like the engine). Keep it off for any public launch.
 */
export function isPreviewDemoEnabled(
  engine: unknown = import.meta.env.VITE_PREVIEW_ENGINE,
  demo: unknown = import.meta.env.VITE_PREVIEW_DEMO,
): boolean {
  return getPreviewEngine(engine) === 'esbuild' && String(demo) === '1';
}

/** Host of the marker URLs used by the esbuild shim. `.invalid` never resolves. */
export const ESBUILD_PREVIEW_HOST = 'esbuild-preview.invalid';

const ESBUILD_PREVIEW_URL = /^https:\/\/esbuild-preview\.invalid\/(\d{1,5})(?:\/|$)/;

/** `https://esbuild-preview.invalid/5173/` */
export function esbuildPreviewUrl(port: number): string {
  return `https://${ESBUILD_PREVIEW_HOST}/${port}/`;
}

/** The port in an esbuild marker URL, or undefined for any other URL. */
export function parseEsbuildPreviewUrl(url: string | undefined): number | undefined {
  const match = url?.match(ESBUILD_PREVIEW_URL);

  if (!match) {
    return undefined;
  }

  const port = Number(match[1]);

  return port > 0 && port < 65536 ? port : undefined;
}

/**
 * Sandbox for the esbuild preview iframe. Never `allow-same-origin`: the
 * generated code must run in an opaque origin, away from our cookies,
 * storage and DOM.
 */
export const ESBUILD_PREVIEW_SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups';

/**
 * Cross-origin isolation headers for app documents. WebContainer needs them;
 * the esbuild preview does not, so it gets none (normal pages for payments and login).
 */
export function crossOriginIsolationHeaders(engine: PreviewEngine = PREVIEW_ENGINE): Record<string, string> {
  if (engine !== 'webcontainer') {
    return {};
  }

  return {
    /*
     * WebContainer requires a cross-origin-isolated document.
     * `credentialless` is used because the preview iframe and the
     * COEP header would otherwise block every third-party subresource.
     */
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}
