import type { UIMessage } from 'ai';
import { invalidateChatCache } from '~/lib/persistence/chatCache';
import {
  createChatWithNextId,
  getMessagesByIdRaw,
  getSnapshot,
  migrateChatMessages,
  openDatabase,
  setMessages,
  setSnapshot,
} from '~/lib/persistence/db';
import type { FileMap } from '~/lib/stores/files';

/** A project as the browser keeps it (IndexedDB: the chat record and its files snapshot). */
export interface BrowserProject {
  title?: string;
  messages: UIMessage[];
  files?: FileMap;

  /** When it was last saved in the browser. */
  timestamp: string;
}

export interface BrowserProjects {
  read(localId: string): Promise<BrowserProject | null>;

  /** Writes a project downloaded from online: over `localId`, or as a new chat. */
  write(
    project: { title: string; messages: UIMessage[]; files: FileMap; updatedAt: string },
    localId?: string,
  ): Promise<{ id: string; urlId?: string }>;
}

let database: Promise<IDBDatabase | undefined> | undefined;

function getDatabase() {
  database ??= openDatabase();
  return database;
}

export const browserProjects: BrowserProjects = {
  async read(localId) {
    const db = await getDatabase();
    const raw = db ? await getMessagesByIdRaw(db, localId) : undefined;

    if (!db || !raw) {
      return null;
    }

    const chat = migrateChatMessages(raw);
    const snapshot = await getSnapshot(db, localId);

    return { title: chat.description, messages: chat.messages, files: snapshot?.files, timestamp: chat.timestamp };
  },

  async write(project, localId) {
    const db = await getDatabase();

    if (!db) {
      throw new Error('This browser cannot store projects');
    }

    let id = localId;
    let urlId: string | undefined;

    if (id) {
      const existing = await getMessagesByIdRaw(db, id);
      urlId = existing?.urlId;
      await setMessages(db, id, project.messages, urlId, project.title, project.updatedAt, existing?.metadata);
    } else {
      const created = await createChatWithNextId(db, project.messages, undefined, project.title, undefined, true);
      id = created.id;
      urlId = created.urlId;

      // the browser copy gets the online time, so it is not saved straight back
      await setMessages(db, id, project.messages, urlId, project.title, project.updatedAt);
    }

    const lastMessageId = project.messages[project.messages.length - 1]?.id;

    if (lastMessageId) {
      await setSnapshot(db, id, { chatIndex: lastMessageId, files: project.files ?? {} });
    }

    invalidateChatCache(id);

    if (urlId) {
      invalidateChatCache(urlId);
    }

    return { id, urlId };
  },
};
