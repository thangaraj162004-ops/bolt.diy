import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectsApi, SaveResult } from './cloud';
import {
  MAX_BINARY_FILE_BYTES,
  MAX_ONLINE_PROJECTS,
  MAX_PROJECT_BYTES,
  NOT_SAVED_MESSAGE,
  SAVE_DELAY_MS,
  SAVE_RETRY_DELAYS_MS,
  TOO_BIG_MESSAGE,
  TOO_MANY_MESSAGE,
} from './limits';
import { getLink, isVisibleTo, localIdFor, projectLinks, reloadLinks, removeLink, setLink } from './links';
import { mergeProjects, type OnlineProject } from './merge';
import { filesToSave, packProject } from './pack';
import { ProjectSync, onlineProjects, saveState } from './sync';

const MIGRATION = join(process.cwd(), 'supabase/migrations/0005_projects.sql');

const msg = (id: string, text = 'hi') => ({ id, role: 'user', parts: [{ type: 'text', text }] }) as any;

const chat = (id: string, timestamp: string, description = `Chat ${id}`) =>
  ({ id, urlId: id, description, messages: [msg(`m${id}`)], timestamp }) as any;
const online = (id: string, updatedAt: string, title = `Online ${id}`): OnlineProject => ({
  id,
  title,
  updated_at: updatedAt,
  size_bytes: 10,
});

beforeEach(() => {
  localStorage.clear();
  reloadLinks();
});

describe('limits', () => {
  it('match the database (0005_projects.sql)', () => {
    const sql = readFileSync(MIGRATION, 'utf-8');

    expect(MAX_PROJECT_BYTES).toBe(2_000_000);
    expect(sql).toContain('size_bytes <= 2000000');
    expect(MAX_ONLINE_PROJECTS).toBe(50);
    expect(sql).toContain(`>= ${MAX_ONLINE_PROJECTS} then`);
  });
});

describe('the migration', () => {
  const sql = readFileSync(MIGRATION, 'utf-8');

  it('creates public.projects with the asked columns and key', () => {
    expect(sql).toMatch(/create table public\.projects \(/);

    for (const column of [
      'id text',
      'user_id uuid',
      'title text',
      'messages jsonb',
      'files jsonb',
      'size_bytes integer',
      'created_at timestamptz',
      'updated_at timestamptz',
    ]) {
      expect(sql).toContain(column);
    }

    expect(sql).toContain('references auth.users (id)');
    expect(sql).toContain('primary key (user_id, id)');
    expect(sql).toContain('on public.projects (user_id, updated_at desc)');
  });

  it('turns on RLS and lets a user touch only rows where user_id = auth.uid()', () => {
    expect(sql).toContain('alter table public.projects enable row level security;');

    for (const action of ['select', 'insert', 'update', 'delete']) {
      expect(sql).toMatch(new RegExp(`on public\\.projects for ${action} to authenticated`));
    }

    expect(sql.match(/\(select auth\.uid\(\)\) = user_id/g)?.length).toBe(5);
    expect(sql).toContain('revoke all on public.projects from anon, authenticated;');
    expect(sql).not.toMatch(/to anon/);
  });

  it('keeps the newer copy (last write wins) and computes the size itself', () => {
    expect(sql).toContain('if new.updated_at < old.updated_at then');
    expect(sql).toContain('new.size_bytes := octet_length(new.messages::text) + octet_length(new.files::text);');
  });
});

describe('what is saved online', () => {
  it('skips node_modules, build output and big binary files', () => {
    const big = 'x'.repeat(MAX_BINARY_FILE_BYTES + 1);

    const files = filesToSave({
      '/home/project/src/App.tsx': { type: 'file', content: 'app', isBinary: false },
      '/home/project/src': { type: 'folder' },
      '/home/project/node_modules/react/index.js': { type: 'file', content: 'x', isBinary: false },
      '/home/project/dist/index.js': { type: 'file', content: 'x', isBinary: false },
      '/home/project/build/out.js': { type: 'file', content: 'x', isBinary: false },
      '/home/project/.git/HEAD': { type: 'file', content: 'x', isBinary: false },
      '/home/project/public/logo.png': { type: 'file', content: 'small', isBinary: true },
      '/home/project/public/video.mp4': { type: 'file', content: big, isBinary: true },
      '/home/project/src/data.json': { type: 'file', content: big, isBinary: false },
      '/home/project/gone.txt': undefined,
    });

    expect(Object.keys(files).sort()).toEqual([
      '/home/project/public/logo.png',
      '/home/project/src',
      '/home/project/src/App.tsx',
      '/home/project/src/data.json',
    ]);
  });

  it('a project over 2 MB is "too big"; a smaller one is packed with its size', () => {
    const tooBig = packProject({ title: 'Big', messages: [msg('1', 'x'.repeat(MAX_PROJECT_BYTES))] });
    expect(tooBig).toMatchObject({ ok: false, reason: 'too-big' });

    // skipped files do not count
    const packed = packProject({
      title: 'Small',
      messages: [msg('1')],
      files: { '/home/project/node_modules/big.js': { type: 'file', content: 'x'.repeat(3_000_000), isBinary: false } },
    });
    expect(packed.ok).toBe(true);

    if (packed.ok) {
      expect(packed.project.files).toEqual({});
      expect(packed.project.size_bytes).toBeLessThan(200);
    }
  });
});

describe('links (which user owns a browser chat)', () => {
  it('are kept in localStorage and decide who sees a chat', () => {
    setLink('5', { cloudId: 'c5', ownerId: 'alice' });

    expect(JSON.parse(localStorage.getItem('ca_project_links')!)).toEqual({ 5: { cloudId: 'c5', ownerId: 'alice' } });
    expect(localIdFor('c5', 'alice')).toBe('5');
    expect(localIdFor('c5', 'bob')).toBeUndefined();

    expect(isVisibleTo('5', 'alice')).toBe(true);
    expect(isVisibleTo('5', 'bob')).toBe(false);
    expect(isVisibleTo('5', undefined)).toBe(false);

    // a guest chat (no link) is shown to everyone
    expect(isVisibleTo('6', 'bob')).toBe(true);

    removeLink('5');
    expect(getLink('5')).toBeUndefined();
  });
});

describe('merging the browser list with the online list', () => {
  const links = { 1: { cloudId: 'c1', ownerId: 'alice' }, 2: { cloudId: 'c2', ownerId: 'alice' } };

  it('one row per project, newest first; online-only projects appear too', () => {
    const merged = mergeProjects(
      [chat('1', '2026-01-01T10:00:00Z'), chat('2', '2026-01-03T10:00:00Z'), chat('3', '2026-01-02T10:00:00Z')],
      links,
      [
        online('c1', '2026-01-01T09:00:00Z'),
        online('c2', '2026-01-01T09:00:00Z'),
        online('c9', '2026-01-04T10:00:00Z'),
      ],
      'alice',
    );

    expect(merged.map((entry) => [entry.id, entry.savedOnline ?? false, entry.onlineOnly ?? false])).toEqual([
      ['cloud:c9', true, true],
      ['2', true, false],
      ['3', false, false],
      ['1', true, false],
    ]);
    expect(merged[0]).toMatchObject({ description: 'Online c9', messages: [], cloudId: 'c9' });
  });

  it('last write wins: the newer copy gives the title and the time', () => {
    const [onlineNewer] = mergeProjects(
      [chat('1', '2026-01-01T10:00:00Z', 'Old title')],
      links,
      [online('c1', '2026-01-05T10:00:00Z', 'New title')],
      'alice',
    );
    expect(onlineNewer).toMatchObject({
      description: 'New title',
      timestamp: '2026-01-05T10:00:00Z',
      localUpdatedAt: '2026-01-01T10:00:00Z',
      onlineUpdatedAt: '2026-01-05T10:00:00Z',
    });

    const [browserNewer] = mergeProjects(
      [chat('1', '2026-01-09T10:00:00Z', 'Browser title')],
      links,
      [online('c1', '2026-01-05T10:00:00Z', 'Online title')],
      'alice',
    );
    expect(browserNewer).toMatchObject({ description: 'Browser title', timestamp: '2026-01-09T10:00:00Z' });
  });

  it("never shows another user's projects; signed out shows only guest chats", () => {
    const local = [chat('1', '2026-01-01T10:00:00Z'), chat('7', '2026-01-02T10:00:00Z')];

    expect(mergeProjects(local, links, [], 'bob').map((entry) => entry.id)).toEqual(['7']);
    expect(mergeProjects(local, links, [online('c1', '2026-01-01T09:00:00Z')], undefined).map((e) => e.id)).toEqual([
      '7',
    ]);
  });
});

/* ------------------------------------------------------------------ sync */

function setup(options: { save?: (...args: any[]) => Promise<SaveResult>; items?: OnlineProject[] } = {}) {
  const projects: Record<string, any> = {
    1: { title: 'Recipe', messages: [msg('m1')], files: {}, timestamp: '2026-01-01T10:00:00.000Z' },
    2: { title: 'Kanban', messages: [msg('m2')], files: {}, timestamp: '2026-01-01T11:00:00.000Z' },
    big: { title: 'Big', messages: [msg('mb', 'x'.repeat(MAX_PROJECT_BYTES))], timestamp: '2026-01-01T12:00:00.000Z' },
  };

  const api = {
    list: vi.fn(async () => options.items ?? []),
    get: vi.fn(async (id: string) => ({
      ...online(id, '2026-02-01T10:00:00.000Z', 'From online'),
      messages: [msg('o1')],
      files: { '/home/project/a.txt': { type: 'file' as const, content: 'a', isBinary: false } },
    })),
    save: vi.fn(options.save ?? (async () => 'saved' as SaveResult)),
    rename: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  } satisfies ProjectsApi;

  const local = {
    read: vi.fn(async (id: string) => projects[id] ?? null),
    write: vi.fn(async (_project: any, localId?: string) => ({ id: localId ?? '99', urlId: localId ?? '99' })),
  };

  const notify = vi.fn();

  let next = 0;

  const sync = new ProjectSync({ api, local, notify, newId: () => `cloud-${++next}` });

  return { sync, api, local, notify };
}

async function signIn(sync: ProjectSync, userId = 'alice') {
  sync.setUser(userId);
  await vi.advanceTimersByTimeAsync(0);
}

describe('saving online', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('guests: nothing is saved and no chat is claimed', async () => {
    const { sync, api } = setup();

    sync.markChanged('1');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);

    expect(api.save).not.toHaveBeenCalled();
    expect(getLink('1')).toBeUndefined();
  });

  it('debounced: saved once, 5 seconds after the last change', async () => {
    const { sync, api } = setup();
    await signIn(sync);

    sync.markChanged('1');
    await vi.advanceTimersByTimeAsync(3_000);
    sync.markChanged('1');
    await vi.advanceTimersByTimeAsync(3_000);
    sync.markChanged('1');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(api.save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.save).toHaveBeenCalledWith(
      'alice',
      'cloud-1',
      expect.objectContaining({ title: 'Recipe' }),
      '2026-01-01T10:00:00.000Z',
    );

    // it is now this user's, and in the online list
    expect(getLink('1')).toEqual({ cloudId: 'cloud-1', ownerId: 'alice' });
    expect(onlineProjects.get().items.map((item) => item.id)).toEqual(['cloud-1']);
  });

  it('going to the background saves right away; switching chats saves the previous one', async () => {
    const { sync, api } = setup();
    await signIn(sync);

    sync.markChanged('1');
    await sync.flush();
    expect(api.save).toHaveBeenCalledTimes(1);

    sync.markChanged('2');
    sync.markChanged('1');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save.mock.calls[1][2].title).toBe('Kanban');
  });

  it('too big: "This project is too big to save online" once, and it stays in the browser', async () => {
    const { sync, api, notify } = setup();
    await signIn(sync);

    sync.markChanged('big');
    await sync.flush();
    sync.markChanged('big');
    await sync.flush();

    expect(api.save).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(TOO_BIG_MESSAGE, 'too-big:big');
  });

  it('at most 50 projects online: a new one is not saved, an existing one is', async () => {
    const items = Array.from({ length: MAX_ONLINE_PROJECTS }, (_, i) => online(`p${i}`, '2026-01-01T00:00:00Z'));
    const { sync, api, notify } = setup({ items });
    await signIn(sync);

    sync.markChanged('1');
    expect(await sync.flush()).toBe('too-many');
    expect(notify).toHaveBeenCalledWith(TOO_MANY_MESSAGE, 'too-many');
    expect(api.save).not.toHaveBeenCalled();

    setLink('2', { cloudId: 'p3', ownerId: 'alice' });
    sync.markChanged('2');
    expect(await sync.flush()).toBe('saved');
  });

  it('a failed save is retried quietly, then "Not saved online" is shown', async () => {
    const { sync, api, notify } = setup({ save: async () => Promise.reject(new Error('offline')) });
    await signIn(sync);

    sync.markChanged('1');
    await sync.flush();
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[0]);
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(notify).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[1]);
    expect(api.save).toHaveBeenCalledTimes(3);
    expect(notify).toHaveBeenCalledWith(NOT_SAVED_MESSAGE, 'not-saved');
    expect(saveState.get()).toBe('failed');
  });

  it('a retry that works shows nothing', async () => {
    let calls = 0;

    const { sync, api, notify } = setup({
      save: async () => (++calls === 1 ? Promise.reject(new Error('offline')) : 'saved'),
    });
    await signIn(sync);

    sync.markChanged('1');
    await sync.flush();
    await vi.advanceTimersByTimeAsync(SAVE_RETRY_DELAYS_MS[0]);

    expect(api.save).toHaveBeenCalledTimes(2);
    expect(notify).not.toHaveBeenCalled();
    expect(saveState.get()).toBe('idle');
  });

  it('last write wins: when the online copy is newer the database keeps it ("skipped")', async () => {
    const { sync } = setup({ save: async () => 'skipped' });
    await signIn(sync);

    sync.markChanged('1');
    expect(await sync.flush()).toBe('skipped');
    expect(onlineProjects.get().items).toEqual([]);
  });

  it('opening an online-only project downloads it into the browser first', async () => {
    const { sync, api, local } = setup();
    await signIn(sync);

    const opened = await sync.ensureLocal({
      id: 'cloud:c7',
      messages: [],
      timestamp: '2026-02-01T10:00:00.000Z',
      savedOnline: true,
      onlineOnly: true,
      cloudId: 'c7',
      onlineUpdatedAt: '2026-02-01T10:00:00.000Z',
    });

    expect(api.get).toHaveBeenCalledWith('c7');
    expect(local.write).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'From online', updatedAt: '2026-02-01T10:00:00.000Z' }),
      undefined,
    );
    expect(opened).toEqual({ id: '99', urlId: '99' });
    expect(getLink('99')).toEqual({ cloudId: 'c7', ownerId: 'alice' });
  });

  it('a browser copy newer than the online one opens as it is', async () => {
    const { sync, api } = setup();
    await signIn(sync);

    const opened = await sync.ensureLocal({
      id: '1',
      urlId: 'one',
      messages: [],
      timestamp: '2026-03-01T00:00:00Z',
      savedOnline: true,
      cloudId: 'c1',
      onlineUpdatedAt: '2026-02-01T00:00:00Z',
      localUpdatedAt: '2026-03-01T00:00:00Z',
    });

    expect(opened).toEqual({ id: '1', urlId: 'one' });
    expect(api.get).not.toHaveBeenCalled();
  });

  it('rename and delete reach the online copy', async () => {
    const { sync, api } = setup({ items: [online('c1', '2026-01-01T00:00:00Z')] });
    await signIn(sync);
    setLink('1', { cloudId: 'c1', ownerId: 'alice' });

    await sync.rename('1', 'Better name');
    expect(api.rename).toHaveBeenCalledWith('c1', 'Better name');
    expect(onlineProjects.get().items[0].title).toBe('Better name');

    await sync.remove('1');
    expect(api.remove).toHaveBeenCalledWith('c1');
    expect(getLink('1')).toBeUndefined();
    expect(onlineProjects.get().items).toEqual([]);

    await sync.remove('cloud:c8');
    expect(api.remove).toHaveBeenLastCalledWith('c8');
  });
});

describe('signing out', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cancels a waiting save, clears the online list and keeps the browser copies', async () => {
    const { sync, api } = setup({ items: [online('c1', '2026-01-01T00:00:00Z')] });
    await signIn(sync);
    expect(onlineProjects.get().items).toHaveLength(1);

    sync.markChanged('1');
    sync.setUser(undefined);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);

    expect(api.save).not.toHaveBeenCalled();
    expect(onlineProjects.get()).toEqual({ userId: undefined, items: [], loadedAt: 0 });

    // the browser copy and its owner stay; it is hidden while signed out
    expect(projectLinks.get()).toEqual({ 1: { cloudId: 'cloud-1', ownerId: 'alice' } });
    expect(isVisibleTo('1', undefined)).toBe(false);
  });

  it("a different user never saves (or sees) the first user's projects", async () => {
    const { sync, api } = setup();
    await signIn(sync, 'alice');
    sync.markChanged('1');
    await sync.flush();
    expect(api.save).toHaveBeenCalledTimes(1);

    await signIn(sync, 'bob');
    sync.markChanged('1');
    expect(await sync.flush()).toBe('off');
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(getLink('1')?.ownerId).toBe('alice');
    expect(isVisibleTo('1', 'bob')).toBe(false);
  });
});

describe('unexpected online answers (Task 11F)', () => {
  it('a non-list online answer never breaks the merged list', () => {
    const local = [chat('1', '2026-01-01T10:00:00Z')];

    expect(mergeProjects(local, {}, {} as unknown as OnlineProject[], 'alice').map((entry) => entry.id)).toEqual(['1']);
  });
});
