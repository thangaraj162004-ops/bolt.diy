import { describe, expect, it, vi } from 'vitest';
import { createSupabaseClient, looksLikeSecretKey } from './client';

const URL = 'https://example.supabase.co';
const PUBLISHABLE = 'sb_publishable_example';

function jwt(role: string) {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, '');
  return `${encode({ alg: 'HS256' })}.${encode({ role })}.signature`;
}

describe('Supabase client', () => {
  it.each([
    [undefined, undefined],
    [URL, undefined],
    [undefined, PUBLISHABLE],
    ['', PUBLISHABLE],
    [URL, '   '],
  ])('is null and does not crash when a value is missing (%j, %j)', (url, key) => {
    expect(createSupabaseClient(url, key)).toBeNull();
  });

  it('is created from the URL and the publishable key', () => {
    expect(createSupabaseClient(URL, PUBLISHABLE)).not.toBeNull();
  });

  it('is null for an invalid URL instead of throwing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(createSupabaseClient('not a url', PUBLISHABLE)).toBeNull();
  });

  it('refuses secret keys and never logs them', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    for (const key of ['sb_secret_abc123', jwt('service_role')]) {
      expect(looksLikeSecretKey(key)).toBe(true);
      expect(createSupabaseClient(URL, key)).toBeNull();
    }

    expect(error.mock.calls.flat().join(' ')).not.toMatch(/sb_secret_abc123|signature/);
    expect(looksLikeSecretKey(jwt('anon'))).toBe(false);
    expect(looksLikeSecretKey(PUBLISHABLE)).toBe(false);
  });

  it('exports null in tests, where the variables are not set', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', undefined);
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', undefined);
    vi.resetModules();

    expect((await import('./client')).supabase).toBeNull();
    vi.unstubAllEnvs();
  });
});
