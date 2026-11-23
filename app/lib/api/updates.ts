/**
 * Update check for the web app: disabled.
 *
 * CodeApp AI is deployed as a Cloudflare Worker from its own branch, so the
 * web build never asks the upstream bolt.diy repository (or any other server)
 * for a newer version and never shows an update banner. `checkForUpdates`
 * makes no network call and always reports that no update is available.
 * The Electron app has its own updater (electron/main/utils/auto-update.ts).
 */

export interface UpdateCheckResult {
  available: boolean;
  version: string;
  releaseNotes?: string;
  error?: {
    type: 'rate_limit' | 'network' | 'auth' | 'unknown';
    message: string;
  };
}

/** False: the web build has no update check. */
export const UPDATE_CHECK_ENABLED = false;

export const checkForUpdates = async (): Promise<UpdateCheckResult> => ({
  available: false,
  version: 'unknown',
});

export const acknowledgeUpdate = async (version: string): Promise<void> => {
  // Store the acknowledged version in localStorage
  try {
    localStorage.setItem('last_acknowledged_update', version);
  } catch (error) {
    console.error('Failed to store acknowledged version:', error);
  }
};
