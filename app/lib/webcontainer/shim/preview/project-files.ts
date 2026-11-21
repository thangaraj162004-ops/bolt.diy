/**
 * The small read-only view of a project that the preview compiler needs.
 * Paths are relative to the project root, use `/` and have no leading slash
 * (for example `src/main.tsx`).
 */
import type { FileSystemAPI } from '~/lib/webcontainer/types';

export interface ProjectFiles {
  /** Returns the file's bytes. Rejects when the file does not exist. */
  readFile(path: string): Promise<Uint8Array>;

  /** True when `path` is an existing file (folders return false). */
  exists(path: string): Promise<boolean>;

  /** Every file path in the project, skipping `node_modules` and `.git`. */
  listFiles(): Promise<string[]>;
}

const SKIPPED_FOLDERS = new Set(['node_modules', '.git']);

function clean(path: string) {
  return path.replace(/^\.?\/+/, '');
}

/**
 * Adapter for any `FileSystemAPI`, for example the in-memory file system of
 * the shim (`shim/memory-fs.ts`). Paths are resolved against its workdir.
 */
export function projectFilesFromFileSystem(fs: FileSystemAPI): ProjectFiles {
  return {
    readFile: (path) => fs.readFile(clean(path)),

    async exists(path) {
      const relative = clean(path);
      const slash = relative.lastIndexOf('/');
      const dir = slash === -1 ? '.' : relative.slice(0, slash);
      const name = relative.slice(slash + 1);

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        return entries.some((entry) => entry.name === name && entry.isFile());
      } catch {
        return false;
      }
    },

    async listFiles() {
      const files: string[] = [];

      const walk = async (dir: string) => {
        const entries = await fs.readdir(dir || '.', { withFileTypes: true });

        for (const entry of entries) {
          const path = dir ? `${dir}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            if (!SKIPPED_FOLDERS.has(entry.name)) {
              await walk(path);
            }
          } else {
            files.push(path);
          }
        }
      };

      await walk('');

      return files.sort();
    },
  };
}

/** Adapter for a plain object of `path → content`. Handy for tests and snapshots. */
export function projectFilesFromRecord(record: Record<string, string | Uint8Array>): ProjectFiles {
  const encoder = new TextEncoder();
  const files = new Map(Object.entries(record).map(([path, content]) => [clean(path), content]));

  return {
    async readFile(path) {
      const content = files.get(clean(path));

      if (content === undefined) {
        throw Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), { code: 'ENOENT' });
      }

      return typeof content === 'string' ? encoder.encode(content) : content;
    },
    exists: async (path) => files.has(clean(path)),
    listFiles: async () => [...files.keys()].sort(),
  };
}
