import type { UIMessage } from 'ai';
import { getMessageText, hasMessageFlag } from './messageMigration';
import { MODEL_REGEX, PROVIDER_REGEX } from '~/utils/constants';

/**
 * Chat titles for the sidebar.
 *
 * A chat is named after its first user message ("make a simple landing page").
 * Before this, the title came only from the first artifact. Chats built with the
 * native project tools have no artifact, so they had no title and the sidebar
 * hid them; reopening one then named it after the artifact the snapshot restore
 * adds ("Restored Project & Setup"), and duplicates added " (fork)".
 */

export const MAX_TITLE_LENGTH = 60;

/** The artifact the snapshot restore adds when a chat is reopened (never a real title or link). */
export const RESTORED_ARTIFACT_ID = 'restored-project-setup';
export const RESTORED_ARTIFACT_TITLE = 'Restored Project & Setup';

const PLACEHOLDER_TITLE = /^Restored Project & Setup((?: \(fork\))*)$/;

/** True for titles that are not real: empty, or the restore artifact's title (with any "(fork)"). */
export function isPlaceholderTitle(title: string | undefined): boolean {
  return !title?.trim() || PLACEHOLDER_TITLE.test(title.trim());
}

/** True for link ids that several chats may share: the restore artifact's id (with any -2, -3 suffix). */
export function isPlaceholderUrlId(urlId: string | undefined): boolean {
  return !urlId || urlId === RESTORED_ARTIFACT_ID || urlId.startsWith(`${RESTORED_ARTIFACT_ID}-`);
}

/** Plain text of a user message: without the model/provider prefix, markup or extra spaces. */
function plainText(text: string): string {
  return text
    .replace(MODEL_REGEX, '')
    .replace(PROVIDER_REGEX, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A title from the first real (not hidden) user message, or undefined. */
export function titleFromMessages(messages: readonly UIMessage[]): string | undefined {
  for (const message of messages) {
    if (message.role !== 'user' || hasMessageFlag(message, 'hidden') || hasMessageFlag(message, 'no-store')) {
      continue;
    }

    const text = plainText(getMessageText(message));

    if (text) {
      return text.length > MAX_TITLE_LENGTH ? `${text.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : text;
    }
  }

  return undefined;
}

/**
 * The title to store for a chat: its current title when that is real;
 * otherwise the first user message (keeping any " (fork)" suffix of a
 * placeholder), then the first artifact's title if that is real.
 */
export function chatTitle(
  current: string | undefined,
  messages: readonly UIMessage[],
  artifactTitle?: string,
): string | undefined {
  if (!isPlaceholderTitle(current)) {
    return current;
  }

  const forkSuffix = current ? (PLACEHOLDER_TITLE.exec(current.trim())?.[1] ?? '') : '';
  const fromMessages = titleFromMessages(messages);

  if (fromMessages) {
    return `${fromMessages}${forkSuffix}`;
  }

  if (artifactTitle && !isPlaceholderTitle(artifactTitle)) {
    return `${artifactTitle}${forkSuffix}`;
  }

  return current?.trim() ? current : undefined;
}

/**
 * How a stored chat is shown in the sidebar: every chat with messages, titled
 * by chatTitle (or "Untitled chat"), linked by its own id when it has no link
 * id or only the shared restore id. Chats saved before this fix (no title or
 * no link id) appear again. Returns undefined for a chat without messages.
 */
export function sidebarEntry<T extends { id: string; urlId?: string; description?: string; messages: UIMessage[] }>(
  item: T,
): T | undefined {
  if (!item.messages?.length) {
    return undefined;
  }

  return {
    ...item,
    description: chatTitle(item.description, item.messages) ?? 'Untitled chat',
    urlId: isPlaceholderUrlId(item.urlId) ? item.id : item.urlId,
  };
}
