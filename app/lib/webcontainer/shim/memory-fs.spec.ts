import { describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem, globToRegExp } from './memory-fs';
import type { PathWatcherEvent } from '~/lib/webcontainer/types';

const WORKDIR = '/home/project';

/** Lets queued watcher batches (microtasks) run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function collect(fs: MemoryFileSystem, options: Parameters<MemoryFileSystem['watchPaths']>[0] = {}) {
  const batches: PathWatcherEvent[][] = [];
  const stop = fs.watchPaths(options, (events) => batches.push(events));

  return { batches, events: () => batches.flat(), stop };
}

describe('MemoryFileSystem files', () => {
  it('writes and reads a file as text and as bytes', async () => {
    const fs = new MemoryFileSystem(WORKDIR);

    await fs.writeFile('hello.txt', 'héllo');

    expect(await fs.readFile('hello.txt', 'utf-8')).toBe('héllo');
    expect(await fs.readFile('hello.txt')).toEqual(new TextEncoder().encode('héllo'));
  });

  it('accepts relative and absolute paths for the same file', async () => {
    const fs = new MemoryFileSystem(WORKDIR);

    await fs.writeFile(`${WORKDIR}/a.txt`, 'abs');

    expect(await fs.readFile('a.txt', 'utf8')).toBe('abs');
    expect(await fs.readFile('./a.txt', 'utf8')).toBe('abs');
  });

  it('writes binary data and returns a copy', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    const bytes = new Uint8Array([0, 1, 2, 255]);

    await fs.writeFile('bin', bytes);
    bytes[0] = 9;

    const read = await fs.readFile('bin');
    expect(read).toEqual(new Uint8Array([0, 1, 2, 255]));

    read[1] = 9;
    expect(await fs.readFile('bin')).toEqual(new Uint8Array([0, 1, 2, 255]));
  });

  it('overwrites an existing file', async () => {
    const fs = new MemoryFileSystem(WORKDIR);

    await fs.writeFile('a.txt', 'one');
    await fs.writeFile('a.txt', 'two', { encoding: 'utf8' });

    expect(await fs.readFile('a.txt', 'utf8')).toBe('two');
  });

  it('fails with ENOENT when reading a missing file or writing into a missing folder', async () => {
    const fs = new MemoryFileSystem(WORKDIR);

    await expect(fs.readFile('missing.txt')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.writeFile('nope/a.txt', 'x')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails with EISDIR when reading or writing a folder as a file', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    await fs.mkdir('src');

    await expect(fs.readFile('src')).rejects.toMatchObject({ code: 'EISDIR' });
    await expect(fs.writeFile('src', 'x')).rejects.toMatchObject({ code: 'EISDIR' });
  });

  it('rejects text encodings other than utf8', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    await fs.writeFile('a.txt', 'x');

    await expect(fs.readFile('a.txt', 'base64')).rejects.toMatchObject({ code: 'ENOTSUP' });
    await expect(fs.writeFile('b.txt', 'x', 'hex')).rejects.toMatchObject({ code: 'ENOTSUP' });
  });
});

describe('MemoryFileSystem folders', () => {
  it('creates a single folder and refuses to create it twice', async () => {
    const fs = new MemoryFileSystem(WORKDIR);

    await fs.mkdir('src');

    expect(await fs.readdir('.')).toEqual(['src']);
    await expect(fs.mkdir('src')).rejects.toMatchObject({ code: 'EEXIST' });
  });

  it('needs recursive to create nested folders', async () => {
    const fs = new MemoryFileSystem(WORKDIR);

    await expect(fs.mkdir('a/b/c')).rejects.toMatchObject({ code: 'ENOENT' });

    await fs.mkdir('a/b/c', { recursive: true });
    await fs.mkdir('a/b/c', { recursive: true }); // no error when it already exists

    expect(await fs.readdir('a/b')).toEqual(['c']);
  });

  it('refuses a recursive mkdir through a file', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    await fs.writeFile('file', 'x');

    await expect(fs.mkdir('file', { recursive: true })).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(fs.mkdir('file/sub', { recursive: true })).rejects.toMatchObject({ code: 'ENOTDIR' });
  });

  it('lists names sorted, with or without file types', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    await fs.mkdir('src');
    await fs.writeFile('b.txt', 'b');
    await fs.writeFile('a.txt', 'a');

    expect(await fs.readdir('.')).toEqual(['a.txt', 'b.txt', 'src']);
    expect(await fs.readdir(WORKDIR, undefined)).toEqual(['a.txt', 'b.txt', 'src']);

    const entries = await fs.readdir('', { withFileTypes: true });
    expect(entries.map((entry) => [entry.name, entry.isFile(), entry.isDirectory()])).toEqual([
      ['a.txt', true, false],
      ['b.txt', true, false],
      ['src', false, true],
    ]);
  });

  it('fails readdir on a missing path or a file', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    await fs.writeFile('a.txt', 'a');

    await expect(fs.readdir('missing')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.readdir('a.txt')).rejects.toMatchObject({ code: 'ENOTDIR' });
  });

  it('removes files, and folders only with recursive', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    await fs.mkdir('src/components', { recursive: true });
    await fs.writeFile('src/components/App.tsx', 'x');
    await fs.writeFile('src/index.ts', 'y');

    await fs.rm('src/index.ts');
    expect(await fs.readdir('src')).toEqual(['components']);

    await expect(fs.rm('src')).rejects.toMatchObject({ code: 'EISDIR' });

    await fs.rm('src', { recursive: true });
    expect(await fs.readdir('.')).toEqual([]);
    await expect(fs.readFile('src/components/App.tsx')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('ignores missing paths only with force', async () => {
    const fs = new MemoryFileSystem(WORKDIR);

    await expect(fs.rm('missing')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.rm('missing', { force: true })).resolves.toBeUndefined();
  });

  it('can be emptied the way FilesStore.reset does it', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    await fs.mkdir('src', { recursive: true });
    await fs.writeFile('src/a.ts', 'a');
    await fs.writeFile('package.json', '{}');

    for (const entry of await fs.readdir('.')) {
      await fs.rm(entry, { recursive: true });
    }

    expect(await fs.readdir('.')).toEqual([]);
  });
});

describe('MemoryFileSystem watcher', () => {
  it('reports add, change and remove events with absolute paths, mtime, ino and content', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    const { events } = collect(fs, { include: [`${WORKDIR}/**`], includeContent: true });

    await fs.mkdir('src');
    await fs.writeFile('src/a.ts', 'one');
    await fs.writeFile('src/a.ts', 'two');
    await fs.rm('src/a.ts');
    await flush();

    const seen = events();
    expect(seen.map(({ type, path }) => [type, path])).toEqual([
      ['add_dir', `${WORKDIR}/src`],
      ['add_file', `${WORKDIR}/src/a.ts`],
      ['change', `${WORKDIR}/src/a.ts`],
      ['remove_file', `${WORKDIR}/src/a.ts`],
    ]);

    const [addDir, addFile, change, removeFile] = seen;
    expect(new TextDecoder().decode(addFile.buffer)).toBe('one');
    expect(new TextDecoder().decode(change.buffer)).toBe('two');
    expect(addDir.buffer).toBeUndefined();
    expect(removeFile.buffer).toBeUndefined();
    expect(addFile.ino).toBe(change.ino);
    expect(addFile.ino).not.toBe(addDir.ino);
    expect(typeof addFile.mtime).toBe('number');
  });

  it('leaves out the buffer when includeContent is not set', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    const { events } = collect(fs);

    await fs.writeFile('a.txt', 'x');
    await flush();

    expect(events()).toHaveLength(1);
    expect(events()[0].buffer).toBeUndefined();
  });

  it('reports every file and folder removed by a recursive rm, deepest first', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    await fs.mkdir('src/lib', { recursive: true });
    await fs.writeFile('src/lib/a.ts', 'a');

    const { events } = collect(fs);
    await fs.rm('src', { recursive: true });
    await flush();

    expect(events().map(({ type, path }) => [type, path])).toEqual([
      ['remove_file', `${WORKDIR}/src/lib/a.ts`],
      ['remove_dir', `${WORKDIR}/src/lib`],
      ['remove_dir', `${WORKDIR}/src`],
    ]);
  });

  it('reports each folder created by a recursive mkdir', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    const { events } = collect(fs);

    await fs.mkdir('a/b', { recursive: true });
    await flush();

    expect(events().map(({ type, path }) => [type, path])).toEqual([
      ['add_dir', `${WORKDIR}/a`],
      ['add_dir', `${WORKDIR}/a/b`],
    ]);
  });

  it('batches events from the same tick into one callback, like bufferWatchEvents expects', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    const { batches } = collect(fs);

    void fs.writeFile('a.txt', 'a');
    void fs.writeFile('b.txt', 'b');
    await flush();

    expect(batches).toHaveLength(1);
    expect(batches[0].map((event) => event.path)).toEqual([`${WORKDIR}/a.txt`, `${WORKDIR}/b.txt`]);
  });

  it('applies the include and exclude patterns FilesStore uses', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    await fs.mkdir('/tmp', { recursive: true });

    const { events } = collect(fs, {
      include: [`${WORKDIR}/**`],
      exclude: ['**/node_modules', '.git', '**/package-lock.json'],
    });

    await fs.writeFile('package.json', '{}');
    await fs.writeFile('package-lock.json', '{}');
    await fs.mkdir('node_modules/react', { recursive: true });
    await fs.writeFile('node_modules/react/index.js', 'x');
    await fs.mkdir('packages/ui/node_modules', { recursive: true });
    await fs.writeFile('packages/ui/package-lock.json', '{}');
    await fs.mkdir('.git');
    await fs.writeFile('.git/HEAD', 'ref');
    await fs.writeFile('.gitignore', 'node_modules');
    await fs.writeFile('/tmp/outside.txt', 'x');
    await flush();

    expect(events().map((event) => event.path)).toEqual([
      `${WORKDIR}/package.json`,
      `${WORKDIR}/packages`,
      `${WORKDIR}/packages/ui`,
      `${WORKDIR}/.gitignore`,
    ]);
  });

  it('stops delivering events after unsubscribe, including ones already queued', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    const callback = vi.fn();
    const stop = fs.watchPaths({}, callback);

    // queued in this tick, so not delivered yet when stop() runs
    void fs.writeFile('a.txt', 'a');
    stop();
    await fs.writeFile('b.txt', 'b');
    await flush();

    expect(callback).not.toHaveBeenCalled();
  });

  it('delivers events that happened before unsubscribe once they were flushed', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    const callback = vi.fn();
    const stop = fs.watchPaths({}, callback);

    await fs.writeFile('a.txt', 'a');
    await flush();
    stop();
    await fs.writeFile('b.txt', 'b');
    await flush();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith([expect.objectContaining({ path: `${WORKDIR}/a.txt` })]);
  });

  it('exposes watchPaths through the internal object', async () => {
    const fs = new MemoryFileSystem(WORKDIR);
    const callback = vi.fn();

    fs.internal.watchPaths({}, callback);
    await fs.writeFile('a.txt', 'a');
    await flush();

    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('globToRegExp', () => {
  it.each([
    ['/home/project/**', '/home/project', true],
    ['/home/project/**', '/home/project/src/a.ts', true],
    ['/home/project/**', '/home/projects/a.ts', false],
    ['**/node_modules', 'node_modules', true],
    ['**/node_modules', 'a/b/node_modules', true],
    ['**/node_modules', 'a/node_modules_x', false],
    ['*.ts', 'a.ts', true],
    ['*.ts', 'src/a.ts', false],
    ['src/?.ts', 'src/a.ts', true],
    ['.git', '.gitignore', false],
  ])('%s against %s is %s', (glob, path, expected) => {
    expect(globToRegExp(glob).test(path)).toBe(expected);
  });
});
