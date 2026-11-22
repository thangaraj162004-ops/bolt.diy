import { describe, expect, it } from 'vitest';
import * as engine from './engine';
import { ESBUILD_PREVIEW_SANDBOX, esbuildPreviewUrl, parseEsbuildPreviewUrl } from './engine';

describe('single preview engine', () => {
  it('has no engine switch, no starter-template switch and no isolation headers', () => {
    expect(
      Object.keys(engine).filter((name) => /PreviewEngine|StarterTemplates|crossOriginIsolation/i.test(name)),
    ).toEqual([]);
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
