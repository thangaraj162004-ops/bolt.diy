import { isVisibleTo, type ProjectLinks } from './links';
import type { ChatHistoryItem } from '~/lib/persistence/useChatHistory';

/** A project in the online list (only the light columns). */
export interface OnlineProject {
  id: string;
  title: string;
  updated_at: string;
  size_bytes: number;
}

/** A row of the merged list: a browser chat, an online-only project, or both. */
export interface ProjectEntry extends ChatHistoryItem {
  /** There is a copy online. */
  savedOnline?: boolean;

  /** Only online: it is downloaded into the browser when opened. */
  onlineOnly?: boolean;

  /** The online id, when there is an online copy. */
  cloudId?: string;

  /** When the online copy was last saved. */
  onlineUpdatedAt?: string;

  /** When the browser copy was last saved (absent for online-only projects). */
  localUpdatedAt?: string;
}

/** The list id of a project that is only online. */
export const ONLINE_ONLY_PREFIX = 'cloud:';

export function isOnlineOnlyId(id: string | undefined): boolean {
  return !!id?.startsWith(ONLINE_ONLY_PREFIX);
}

const time = (value: string | undefined) => (value ? Date.parse(value) || 0 : 0);

/**
 * The browser list merged with the user's online list, newest first.
 *
 * - Browser chats of another user are left out (see links.ts).
 * - A browser chat and its online copy are one row; the newer of the two
 *   gives the title and the time (last write wins).
 * - An online project with no browser copy is its own row (onlineOnly).
 * - Signed out (no userId): only the browser chats this browser may show.
 */
export function mergeProjects(
  local: ChatHistoryItem[],
  links: ProjectLinks,
  online: OnlineProject[],
  userId: string | undefined,
): ProjectEntry[] {
  const onlineById = new Map(userId && Array.isArray(online) ? online.map((project) => [project.id, project]) : []);
  const matched = new Set<string>();
  const entries: ProjectEntry[] = [];

  for (const chat of local) {
    if (!isVisibleTo(chat.id, userId, links)) {
      continue;
    }

    const link = links[chat.id];
    const copy = link && link.ownerId === userId ? onlineById.get(link.cloudId) : undefined;

    if (!copy) {
      entries.push(chat);
      continue;
    }

    matched.add(copy.id);

    const onlineIsNewer = time(copy.updated_at) > time(chat.timestamp);

    entries.push({
      ...chat,
      description: onlineIsNewer && copy.title ? copy.title : chat.description,
      timestamp: onlineIsNewer ? copy.updated_at : chat.timestamp,
      savedOnline: true,
      cloudId: copy.id,
      onlineUpdatedAt: copy.updated_at,
      localUpdatedAt: chat.timestamp,
    });
  }

  for (const copy of onlineById.values()) {
    if (!matched.has(copy.id)) {
      entries.push({
        id: `${ONLINE_ONLY_PREFIX}${copy.id}`,
        description: copy.title || 'Untitled project',
        messages: [],
        timestamp: copy.updated_at,
        savedOnline: true,
        onlineOnly: true,
        cloudId: copy.id,
        onlineUpdatedAt: copy.updated_at,
      });
    }
  }

  return entries.sort((a, b) => time(b.timestamp) - time(a.timestamp));
}
