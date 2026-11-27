import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGenerator } from 'unocss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MOUSE_LAYOUT_QUERY,
  TOUCH_INPUT_QUERY,
  TOUCH_LAYOUT_QUERY,
  TOUCH_WIDE_QUERY,
  isTouchInput,
  isTouchLayout,
  isTouchWide,
} from './touchLayout';

describe('layout rules (Task 11G: the phone layout is below 768 px only again)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('phone layout = narrower than 768 px; desktop = 768 px and wider with any pointer', () => {
    expect(TOUCH_LAYOUT_QUERY).toBe('(max-width: 767.9px)');
    expect(MOUSE_LAYOUT_QUERY).toBe('(min-width: 768px)');
    expect(TOUCH_WIDE_QUERY).toBe('(min-width: 768px) and (pointer: coarse)');

    // the 11F fixes (no edge gestures, Back closes overlays) still cover a finger on a wide screen
    expect(TOUCH_INPUT_QUERY).toBe('(max-width: 767.9px), (pointer: coarse)');
  });

  it('a phone on "Desktop site" (wide, with a finger) is touch input and touch-wide, not the phone layout', () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query.includes('pointer: coarse') }));
    vi.stubGlobal('window', { matchMedia });

    expect(isTouchLayout()).toBe(false);
    expect(isTouchWide()).toBe(true);
    expect(isTouchInput()).toBe(true);
  });

  it('the touch:, mouse: and touch-wide: CSS variants use the same media queries', async () => {
    // the real uno.config.ts of the app (loaded by path: relative imports are not allowed here)
    const { default: config } = await import(/* @vite-ignore */ join(process.cwd(), 'uno.config.ts'));
    const uno = await createGenerator(config);

    const { css } = await uno.generate('touch:hidden mouse:hidden touch-wide:hidden touch:placeholder:text-sm', {
      preflights: false,
    });

    expect(css).toContain(`@media ${TOUCH_LAYOUT_QUERY}`);
    expect(css).toContain(`@media ${MOUSE_LAYOUT_QUERY}`);
    expect(css).toContain(`@media ${TOUCH_WIDE_QUERY}`);
    expect(css).toMatch(/\.touch\\:hidden\{display:none;\}/);
    expect(css).toMatch(/::placeholder\{font-size:0\.875rem;/);
  });

  it('no phone feature still uses the old width-only classes', () => {
    const offenders: string[] = [];

    const files = execSync('git ls-files app', { encoding: 'utf-8' })
      .split('\n')
      .filter((file) => /\.tsx?$/.test(file) && !file.includes('touchLayout.spec'));

    for (const file of files) {
      const text = readFileSync(join(process.cwd(), file), 'utf-8');

      if (/max-md:|(?<![-\w:])md:hidden/.test(text)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
