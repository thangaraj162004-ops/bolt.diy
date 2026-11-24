import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The browser Supabase client, or null when it is not configured.
 *
 * It uses only the project URL and the PUBLISHABLE key, read at build time from
 * VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. Both end up in the public
 * JavaScript, which is fine for these two values: Row Level Security in
 * supabase/migrations/ decides what each user may read or change.
 *
 * A secret key must never be used here. A key that looks like one is refused,
 * so the client stays null instead of shipping it.
 */

/** True for keys that must stay on a server: `sb_secret_...` and legacy service_role JWTs. */
export function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) {
    return true;
  }

  const payload = key.split('.')[1];

  if (!payload) {
    return false;
  }

  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown };
    return json.role === 'service_role';
  } catch {
    return false;
  }
}

export function createSupabaseClient(url: unknown, publishableKey: unknown): SupabaseClient | null {
  if (typeof url !== 'string' || typeof publishableKey !== 'string') {
    return null;
  }

  const cleanUrl = url.trim();
  const cleanKey = publishableKey.trim();

  if (!cleanUrl || !cleanKey) {
    return null;
  }

  if (looksLikeSecretKey(cleanKey)) {
    // never log the key itself
    console.error('Supabase: VITE_SUPABASE_PUBLISHABLE_KEY holds a secret key. It was not used.');
    return null;
  }

  try {
    return createClient(cleanUrl, cleanKey);
  } catch (error) {
    console.error('Supabase: could not create the client:', error instanceof Error ? error.message : 'unknown error');
    return null;
  }
}

export const supabase: SupabaseClient | null = createSupabaseClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
