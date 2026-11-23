import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UPDATE_CHECK_ENABLED, checkForUpdates } from './updates';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('web update check', () => {
  it('is disabled', () => {
    expect(UPDATE_CHECK_ENABLED).toBe(false);
  });

  it('makes no network call and never reports an update', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(checkForUpdates()).resolves.toEqual({ available: false, version: 'unknown' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('contains no URL, so it cannot reach upstream bolt.diy', () => {
    const source = readFileSync(join(process.cwd(), 'app/lib/api/updates.ts'), 'utf-8');

    expect(source).not.toMatch(/https?:\/\//);
    expect(source).not.toMatch(/stackblitz-labs|raw\.githubusercontent/);
  });
});
