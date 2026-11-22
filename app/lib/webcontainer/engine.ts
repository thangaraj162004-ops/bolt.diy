/**
 * Constants and small helpers for the in-browser esbuild preview, safe to
 * import anywhere (server, stores, components): no esbuild code is pulled in.
 *
 * esbuild is the only preview engine, so there is no engine switch. An old
 * VITE_PREVIEW_ENGINE build variable is ignored.
 */

/** The port the esbuild shim's dev server reports (`npm run dev`). */
export const ESBUILD_DEV_PORT = 5173;

/**
 * The /preview-demo page: only with VITE_PREVIEW_DEMO=1 (read at build time).
 * Keep it off for any public launch.
 */
export function isPreviewDemoEnabled(demo: unknown = import.meta.env.VITE_PREVIEW_DEMO): boolean {
  return String(demo) === '1';
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
