import { describe, expect, it } from 'vitest';
import {
  ESBUILD_PREVIEW_SANDBOX,
  crossOriginIsolationHeaders,
  esbuildPreviewUrl,
  getPreviewEngine,
  parseEsbuildPreviewUrl,
} from './engine';

describe('preview engine switch', () => {
  it('is esbuild only for the exact value, webcontainer otherwise', () => {
    expect(getPreviewEngine('esbuild')).toBe('esbuild');
    expect(getPreviewEngine('webcontainer')).toBe('webcontainer');
    expect(getPreviewEngine(undefined)).toBe('webcontainer');
    expect(getPreviewEngine('ESBUILD')).toBe('webcontainer');
  });
});

describe('esbuild marker URLs', () => {
  it('round-trips the port', () => {
    expect(esbuildPreviewUrl(5173)).toBe('https://esbuild-preview.invalid/5173/');
    expect(parseEsbuildPreviewUrl('https://esbuild-preview.invalid/5173/')).toBe(5173);
    expect(parseEsbuildPreviewUrl('https://esbuild-preview.invalid/3000')).toBe(3000);
  });

  it.each([
    'https://abc.local-credentialless.webcontainer-api.io',
    'http://esbuild-preview.invalid/5173/',
    'https://esbuild-preview.invalid.evil.com/5173/',
    'https://esbuild-preview.invalid/abc/',
    'https://esbuild-preview.invalid/0/',
    'https://esbuild-preview.invalid/70000/',
    undefined,
  ])('rejects %s', (url) => {
    expect(parseEsbuildPreviewUrl(url)).toBeUndefined();
  });
});

describe('preview sandbox', () => {
  it('allows scripts but never same-origin', () => {
    expect(ESBUILD_PREVIEW_SANDBOX.split(' ').sort()).toEqual([
      'allow-forms',
      'allow-modals',
      'allow-popups',
      'allow-scripts',
    ]);
    expect(ESBUILD_PREVIEW_SANDBOX).not.toContain('allow-same-origin');
  });
});

describe('cross-origin isolation headers', () => {
  it('are sent for the webcontainer engine', () => {
    expect(crossOriginIsolationHeaders('webcontainer')).toEqual({
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
  });

  it('are absent for the esbuild engine', () => {
    expect(crossOriginIsolationHeaders('esbuild')).toEqual({});
  });
});

describe('starter templates', () => {
  it('are used with the WebContainer engine and skipped with the esbuild engine', async () => {
    const { usesStarterTemplates } = await import('./engine');

    expect(usesStarterTemplates('webcontainer')).toBe(true);
    expect(usesStarterTemplates('esbuild')).toBe(false);
  });
});
