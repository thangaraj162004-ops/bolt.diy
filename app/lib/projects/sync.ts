import type { SupabaseClient } from '@supabase/supabase-js';
import { atom } from 'nanostores';
import { toast } from 'react-toastify';
import { browserProjects, type BrowserProjects } from './browserProjects';
import { supabaseProjectsApi, type ProjectsApi, type SaveResult } from './cloud';
import {
  MAX_ONLINE_PROJECTS,
  NOT_SAVED_MESSAGE,
  SAVE_DELAY_MS,
  SAVE_RETRY_DELAYS_MS,
  TOO_BIG_MESSAGE,
  TOO_MANY_MESSAGE,
} from './limits';
import { getLink, removeLink, setLink } from './links';
import { ONLINE_ONLY_PREFIX, isOnlineOnlyId, type OnlineProject, type ProjectEntry } from './merge';
import { packProject } from './pack';
import { authState } from '~/lib/supabase/auth';

/**
 * Saves the signed-in user's projects online (Supabase, public.projects).
 *
 * - The open project is saved SAVE_DELAY_MS after its last change, and right
 *   away when the app goes to the background. Nothing here is awaited by the
 *   chat: it runs on its own and never blocks a reply.
 * - A failed save is retried quietly (SAVE_RETRY_DELAYS_MS), then "Not saved
 *   online" is shown once. The browser copy is always kept.
 * - Last write wins: each save carries the browser copy's time, and the
 *   database keeps whichever copy is newer.
 * - Guests: nothing is saved online.
 */

/** The online list of the signed-in user (empty when signed out). */
export const onlineProjects = atom<{ userId?: string; items: OnlineProject[]; loadedAt: number }>({
  items: [],
  loadedAt: 0,
});

/** "failed" after the retries ran out; the next good save clears it. */
export const saveState = atom<'idle' | 'saving' | 'failed'>('idle');

export interface ProjectSyncOptions {
  api: ProjectsApi;
  local: BrowserProjects;

  /** Shows a short note; `key` lets the same note appear only once at a time. */
  notify: (message: string, key: string) => void;
  newId: () => string;
}

type Outcome = SaveResult | 'failed' | 'off';

const time = (value: string | undefined) => (value ? Date.parse(value) || 0 : 0);

export class ProjectSync {
  private _userId: string | undefined;
  private _pendingId: string | undefined;
  private _timer: ReturnType<typeof setTimeout> | undefined;
  private _retryTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly _toldTooBig = new Set<string>();

  constructor(private readonly _options: ProjectSyncOptions) {}

  get currentUser() {
    return this._userId;
  }

  /** Sign in, sign out or another user: forget everything of the previous user. */
  setUser(userId: string | undefined) {
    if (userId === this._userId) {
      return;
    }

    this._cancel();
    this._userId = userId;
    onlineProjects.set({ userId, items: [], loadedAt: 0 });
    saveState.set('idle');

    if (userId) {
      void this.refreshList();
    }
  }

  /** Loads the online list (quietly: on failure the browser list still shows). */
  async refreshList() {
    const userId = this._userId;

    if (!userId) {
      return;
    }

    try {
      const items = await this._options.api.list();

      if (this._userId === userId) {
        onlineProjects.set({ userId, items, loadedAt: Date.now() });
      }
    } catch {
      // try again next time the list is opened
    }
  }

  /** A browser chat changed: it is now this user's, and is saved online after a pause. */
  markChanged(localId: string) {
    const userId = this._userId;

    if (!userId || isOnlineOnlyId(localId) || !this._claim(localId, userId)) {
      return;
    }

    // a different chat was waiting: save it now rather than lose it
    if (this._pendingId && this._pendingId !== localId) {
      void this.saveNow(this._pendingId);
    }

    this._pendingId = localId;
    this._clearTimer();
    this._timer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  /** Saves the waiting chat now (the app went to the background). */
  async flush(): Promise<Outcome> {
    this._clearTimer();

    const localId = this._pendingId;
    this._pendingId = undefined;

    return localId ? this.saveNow(localId) : 'off';
  }

  async saveNow(localId: string, attempt = 0): Promise<Outcome> {
    const userId = this._userId;
    const link = getLink(localId);

    if (!userId || !link || link.ownerId !== userId) {
      return 'off';
    }

    const project = await this._options.local.read(localId);

    if (!project || project.messages.length === 0) {
      return 'off';
    }

    const packed = packProject(project);

    if (!packed.ok) {
      this._tellTooBig(localId);
      return 'too-big';
    }

    const { items } = onlineProjects.get();

    if (!items.some((item) => item.id === link.cloudId) && items.length >= MAX_ONLINE_PROJECTS) {
      this._options.notify(TOO_MANY_MESSAGE, 'too-many');
      return 'too-many';
    }

    saveState.set('saving');

    try {
      const result = await this._options.api.save(userId, link.cloudId, packed.project, project.timestamp);

      if (this._userId !== userId) {
        return result;
      }

      if (result === 'too-big') {
        this._tellTooBig(localId);
      } else if (result === 'too-many') {
        this._options.notify(TOO_MANY_MESSAGE, 'too-many');
      } else if (result === 'saved') {
        this._putItem({
          id: link.cloudId,
          title: packed.project.title,
          updated_at: project.timestamp,
          size_bytes: packed.project.size_bytes,
        });
      }

      saveState.set('idle');

      return result;
    } catch {
      if (this._userId !== userId) {
        return 'failed';
      }

      const delay = SAVE_RETRY_DELAYS_MS[attempt];

      if (delay !== undefined) {
        this._retryTimer = setTimeout(() => void this.saveNow(localId, attempt + 1), delay);
        return 'failed';
      }

      saveState.set('failed');
      this._options.notify(NOT_SAVED_MESSAGE, 'not-saved');

      return 'failed';
    }
  }

  /** Renames the online copy too (an online-only project, or a linked browser chat). */
  async rename(id: string, title: string) {
    const cloudId = this._cloudIdOf(id);

    if (!cloudId) {
      return;
    }

    try {
      await this._options.api.rename(cloudId, title);
      this._putItem({ ...this._item(cloudId)!, title, updated_at: new Date().toISOString() }, false);
    } catch {
      this._options.notify(NOT_SAVED_MESSAGE, 'not-saved');
    }
  }

  /** Deletes the online copy (and forgets the link); the caller deletes the browser copy. */
  async remove(id: string) {
    const cloudId = this._cloudIdOf(id);

    if (cloudId) {
      await this._options.api.remove(cloudId);

      const state = onlineProjects.get();
      onlineProjects.set({ ...state, items: state.items.filter((item) => item.id !== cloudId) });
    }

    if (!isOnlineOnlyId(id)) {
      removeLink(id);
    }
  }

  /**
   * The browser copy to open, duplicate or export. An online-only project is
   * downloaded first; a browser copy older than its online copy is updated.
   */
  async ensureLocal(entry: ProjectEntry): Promise<{ id: string; urlId?: string }> {
    const userId = this._userId;
    const onlineIsNewer = entry.onlineOnly || time(entry.onlineUpdatedAt) > time(entry.localUpdatedAt);

    if (!userId || !entry.savedOnline || !entry.cloudId || !onlineIsNewer) {
      return { id: entry.id, urlId: entry.urlId };
    }

    const data = await this._options.api.get(entry.cloudId);

    if (!data) {
      if (entry.onlineOnly) {
        throw new Error('This project is no longer online');
      }

      return { id: entry.id, urlId: entry.urlId };
    }

    const written = await this._options.local.write(
      { title: data.title, messages: data.messages ?? [], files: data.files ?? {}, updatedAt: data.updated_at },
      entry.onlineOnly ? undefined : entry.id,
    );

    setLink(written.id, { cloudId: entry.cloudId, ownerId: userId });

    return written;
  }

  private _claim(localId: string, userId: string): boolean {
    const link = getLink(localId);

    if (link && link.ownerId !== userId) {
      // another user's chat on this browser: never save it under this account
      return false;
    }

    if (!link) {
      setLink(localId, { cloudId: this._options.newId(), ownerId: userId });
    }

    return true;
  }

  private _cloudIdOf(id: string): string | undefined {
    if (!this._userId) {
      return undefined;
    }

    if (isOnlineOnlyId(id)) {
      return id.slice(ONLINE_ONLY_PREFIX.length);
    }

    const link = getLink(id);

    return link && link.ownerId === this._userId ? link.cloudId : undefined;
  }

  private _item(cloudId: string) {
    return onlineProjects.get().items.find((item) => item.id === cloudId);
  }

  private _putItem(next: OnlineProject, addIfMissing = true) {
    const state = onlineProjects.get();

    if (!next?.id || (!addIfMissing && !state.items.some((item) => item.id === next.id))) {
      return;
    }

    onlineProjects.set({ ...state, items: [next, ...state.items.filter((item) => item.id !== next.id)] });
  }

  private _tellTooBig(localId: string) {
    if (!this._toldTooBig.has(localId)) {
      this._toldTooBig.add(localId);
      this._options.notify(TOO_BIG_MESSAGE, `too-big:${localId}`);
    }
  }

  private _clearTimer() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = undefined;
    }
  }

  private _cancel() {
    this._clearTimer();
    this._pendingId = undefined;

    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = undefined;
    }
  }
}

let current: ProjectSync | undefined;

/** The running sync (undefined when Supabase is not configured). */
export function getProjectSync(): ProjectSync | undefined {
  return current;
}

/** Called after a chat is saved in the browser. Does nothing for guests. */
export function markProjectChanged(localId: string) {
  current?.markChanged(localId);
}

/** Starts saving projects online for the signed-in user. Returns a function that stops it. */
export function startProjectSync(client: SupabaseClient): () => void {
  if (current) {
    return () => undefined;
  }

  const sync = new ProjectSync({
    api: supabaseProjectsApi(client),
    local: browserProjects,
    notify: (message, key) => {
      toast.info(message, { toastId: key, autoClose: 4000, position: 'bottom-right' });
    },
    newId: () => crypto.randomUUID(),
  });
  current = sync;

  const unsubscribe = authState.subscribe((state) => {
    if (state.status !== 'loading') {
      sync.setUser(state.status === 'signed-in' ? state.userId : undefined);
    }
  });

  const saveBeforeLeaving = () => {
    if (document.visibilityState === 'hidden') {
      void sync.flush();
    }
  };

  const onPageHide = () => void sync.flush();

  document.addEventListener('visibilitychange', saveBeforeLeaving);
  window.addEventListener('pagehide', onPageHide);

  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', saveBeforeLeaving);
    window.removeEventListener('pagehide', onPageHide);
    sync.setUser(undefined);
    current = undefined;
  };
}
