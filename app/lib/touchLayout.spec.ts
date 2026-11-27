import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGenerator } from 'unocss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOUSE_LAYOUT_QUERY, TOUCH_LAYOUT_QUERY, TOUCH_WIDE_QUERY, isTouchLayout } from './touchLayout';

describe('one touch layout rule (Task 11F)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('touch = narrower than 768 px OR a coarse pointer; mouse = exactly the rest', () => {
    expect(TOUCH_LAYOUT_QUERY).toBe('(max-width: 767.9px), (pointer: coarse)');
    expect(MOUSE_LAYOUT_QUERY).toBe('(min-width: 768px) and (pointer: fine), (min-width: 768px) and (pointer: none)');
    expect(TOUCH_WIDE_QUERY).toBe('(min-width: 768px) and (pointer: coarse)');
  });

  it('isTouchLayout asks the browser with that rule', () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query === TOUCH_LAYOUT_QUERY }));
    vi.stubGlobal('window', { matchMedia });

    expect(isTouchLayout()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(TOUCH_LAYOUT_QUERY);
  });

  it('the touch:, mouse: and touch-wide: CSS variants use the same media queries', async () => {
    // the real uno.config.ts of the app (loaded by path: relative imports are not allowed here)
    const { default: config } = await import(/* @vite-ignore */ join(process.cwd(), 'uno.config.ts'));
    const uno = await createGenerator(config);

    const { css } = await uno.generate('touch:hidden mouse:hidden touch-wide:pl-[340px] touch:placeholder:text-sm', {
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
