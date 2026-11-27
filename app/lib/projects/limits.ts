/**
 * Limits for projects saved online (Supabase table public.projects).
 * The database enforces the same numbers (supabase/migrations/0005_projects.sql):
 * keep both in step.
 */

/** Most projects one user can keep online. */
export const MAX_ONLINE_PROJECTS = 50;

/** Most bytes one project may take online (its messages and files as JSON). */
export const MAX_PROJECT_BYTES = 2_000_000;

/** Binary files bigger than this are not saved online (they stay in the browser). */
export const MAX_BINARY_FILE_BYTES = 200_000;

/** Folders that are never saved online: dependencies, build output, caches. */
export const SKIPPED_FOLDERS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  '.vite',
  '.cache',
  '.turbo',
  '.parcel-cache',
  'coverage',
] as const;

/** Wait this long after the last change before saving online. */
export const SAVE_DELAY_MS = 5_000;

/** Quiet retries after a failed save (then "Not saved online" is shown). */
export const SAVE_RETRY_DELAYS_MS = [5_000, 20_000] as const;

export const TOO_BIG_MESSAGE = 'This project is too big to save online';
export const TOO_MANY_MESSAGE = `You can keep up to ${MAX_ONLINE_PROJECTS} projects online`;
export const NOT_SAVED_MESSAGE = 'Not saved online';
