import type { UIMessage } from 'ai';
import { MAX_BINARY_FILE_BYTES, MAX_PROJECT_BYTES, SKIPPED_FOLDERS } from './limits';
import type { FileMap } from '~/lib/stores/files';

const encoder = new TextEncoder();

/** UTF-8 size of a value as JSON. */
export function jsonBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length;
}

/** True for paths inside node_modules, build output and similar folders. */
export function isSkippedPath(path: string): boolean {
  return path.split('/').some((part) => (SKIPPED_FOLDERS as readonly string[]).includes(part));
}

/**
 * The files worth saving online: no dependency or build folders, and no
 * binary file over MAX_BINARY_FILE_BYTES. (The browser copy keeps everything.)
 */
export function filesToSave(files: FileMap | undefined): FileMap {
  const kept: FileMap = {};

  for (const [path, entry] of Object.entries(files ?? {})) {
    if (!entry || isSkippedPath(path)) {
      continue;
    }

    if (entry.type === 'file' && entry.isBinary && encoder.encode(entry.content).length > MAX_BINARY_FILE_BYTES) {
      continue;
    }

    kept[path] = entry;
  }

  return kept;
}

export interface PackedProject {
  title: string;
  messages: UIMessage[];
  files: FileMap;
  size_bytes: number;
}

export type PackResult = { ok: true; project: PackedProject } | { ok: false; reason: 'too-big'; size: number };

/** What goes online for one project, or "too big" when it is over MAX_PROJECT_BYTES. */
export function packProject(input: { title?: string; messages: UIMessage[]; files?: FileMap }): PackResult {
  const files = filesToSave(input.files);
  const size = jsonBytes(input.messages) + jsonBytes(files);

  if (size > MAX_PROJECT_BYTES) {
    return { ok: false, reason: 'too-big', size };
  }

  return { ok: true, project: { title: input.title ?? '', messages: input.messages, files, size_bytes: size } };
}
