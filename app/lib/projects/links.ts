import { atom } from 'nanostores';

/**
 * Which browser chat belongs to which user and which online project.
 *
 * Kept in localStorage (key `ca_project_links`), apart from the chat records,
 * so saving a chat can never drop it. A chat with no link was made by a guest
 * (or before projects were saved online) and is shown to everyone on this
 * browser; a linked chat is shown only to its owner.
 */
export interface ProjectLink {
  /** The project's id online (public.projects.id). */
  cloudId: string;

  /** The Supabase user id that owns it. */
  ownerId: string;
}

export type ProjectLinks = Record<string, ProjectLink>;

const STORAGE_KEY = 'ca_project_links';

function read(): ProjectLinks {
  try {
    const value = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    const parsed = value ? (JSON.parse(value) as unknown) : {};

    return parsed && typeof parsed === 'object' ? (parsed as ProjectLinks) : {};
  } catch {
    return {};
  }
}

export const projectLinks = atom<ProjectLinks>(read());

function write(links: ProjectLinks) {
  projectLinks.set(links);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  } catch {
    // private mode or full storage: the links still work until the page is closed
  }
}

export function getLink(localId: string): ProjectLink | undefined {
  return projectLinks.get()[localId];
}

export function setLink(localId: string, link: ProjectLink) {
  write({ ...projectLinks.get(), [localId]: link });
}

export function removeLink(localId: string) {
  const { [localId]: _removed, ...rest } = projectLinks.get();
  write(rest);
}

/** The browser chat linked to an online project of this user, if any. */
export function localIdFor(cloudId: string, ownerId: string, links = projectLinks.get()): string | undefined {
  return Object.entries(links).find(([, link]) => link.cloudId === cloudId && link.ownerId === ownerId)?.[0];
}

/** Guests and other users never see a chat that belongs to someone else. */
export function isVisibleTo(localId: string, userId: string | undefined, links = projectLinks.get()): boolean {
  const link = links[localId];

  return !link || link.ownerId === userId;
}

/** For tests: start again from what localStorage holds. */
export function reloadLinks() {
  projectLinks.set(read());
}
