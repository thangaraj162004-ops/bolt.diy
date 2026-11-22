import git from 'isomorphic-git';
import { describe, expect, it } from 'vitest';
import { getFs } from './useGit';
import { WebContainerShim } from '~/lib/webcontainer/shim/shim';

/*
 * useGit runs isomorphic-git on the preview runtime's file system. This checks
 * that the esbuild shim's in-memory file system is enough for it: the same
 * calls a clone makes (write objects, refs and the work tree, then read them).
 */

describe('useGit file system on the esbuild shim', () => {
  it('can init, commit, read the log and check out files', async () => {
    const shim = new WebContainerShim();
    const fs = getFs(shim, { current: {} });
    const dir = shim.workdir;
    const author = { name: 'Test', email: 'test@example.com' };

    await git.init({ fs, dir, defaultBranch: 'main' });
    await shim.fs.mkdir('src', { recursive: true });
    await shim.fs.writeFile('src/App.tsx', 'export default () => null;\n');
    await shim.fs.writeFile('package.json', '{ "name": "demo" }\n');
    await git.add({ fs, dir, filepath: ['src/App.tsx', 'package.json'] });

    const oid = await git.commit({ fs, dir, message: 'first', author });
    const log = await git.log({ fs, dir });

    expect(log.map((entry) => entry.oid)).toEqual([oid]);
    expect(log[0].commit.message).toBe('first\n');

    const { blob } = await git.readBlob({ fs, dir, oid, filepath: 'src/App.tsx' });
    expect(new TextDecoder().decode(blob)).toBe('export default () => null;\n');

    await shim.fs.rm('src/App.tsx');
    await git.checkout({ fs, dir, ref: 'main', force: true });
    expect(await shim.fs.readFile('src/App.tsx', 'utf-8')).toBe('export default () => null;\n');
  });
});
