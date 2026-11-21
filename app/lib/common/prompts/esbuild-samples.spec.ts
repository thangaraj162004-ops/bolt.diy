import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { ESBUILD_ALLOWED_COMMANDS } from './esbuild-preview';
import { ActionRunner } from '~/lib/runtime/action-runner';
import { EnhancedStreamingMessageParser } from '~/lib/runtime/enhanced-message-parser';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { buildProject, projectFilesFromFileSystem } from '~/lib/webcontainer/shim/preview/compiler';
import { PREVIEW_PORT, WebContainerShim } from '~/lib/webcontainer/shim/shim';
import type { WebContainer } from '~/lib/webcontainer/types';
import type { CaShell } from '~/utils/shell';

/*
 * Hand-written model outputs in the artifact format the esbuild-preview prompt
 * asks for. Each goes through the app's real path: the message parser, the
 * action runner writing into the shim's in-memory file system, then the real
 * esbuild compiler and `npm run dev` in the shim. No network: packages stay
 * esm.sh URLs that are never fetched.
 */

const SAMPLES = ['counter', 'todo-tailwind', 'supabase-notes'] as const;

function readSample(name: string) {
  return readFileSync(fileURLToPath(new URL(`./__fixtures__/esbuild-samples/${name}.txt`, import.meta.url)), 'utf-8');
}

/**
 * Parses a model output with the real parser, with the same callback set as
 * useMessageParser (it relies on onActionOpen to number the actions), and
 * returns the closed actions in order.
 */
function parse(output: string) {
  const actions: ActionCallbackData[] = [];

  const parser = new EnhancedStreamingMessageParser({
    callbacks: {
      onActionOpen: () => undefined,
      onActionClose: (data) => actions.push(data),
    },
  });

  parser.parse('sample-message', output, true);

  return actions;
}

async function applySample(name: string) {
  const shim = new WebContainerShim();
  const actions = parse(readSample(name));

  const runner = new ActionRunner(Promise.resolve(shim as unknown as WebContainer), () => ({}) as CaShell);

  for (const data of actions.filter((action) => action.action.type === 'file')) {
    runner.addAction(data);
    await runner.runAction(data);
    expect(runner.actions.get()[data.actionId], data.action.type === 'file' ? data.action.filePath : '').toMatchObject({
      status: 'complete',
    });
  }

  return { shim, actions };
}

describe.each(SAMPLES)('sample output: %s', (name) => {
  it('uses only file actions and the allowed commands, ending with one npm run dev start', () => {
    const actions = parse(readSample(name));
    const commands = actions.filter((data) => data.action.type !== 'file');

    expect(actions.filter((data) => data.action.type === 'file').length).toBeGreaterThanOrEqual(5);
    expect(new Set(actions.map((data) => data.actionId)).size).toBe(actions.length);
    commands.forEach((data) => expect(ESBUILD_ALLOWED_COMMANDS).toContain(data.action.content.trim()));
    expect(actions.at(-1)?.action).toMatchObject({ type: 'start', content: 'npm run dev' });
    expect(actions.filter((data) => data.action.type === 'start')).toHaveLength(1);
  });

  it('is written into the shim by the action runner and compiles with the real compiler', async () => {
    const { shim } = await applySample(name);

    expect(await shim.fs.readdir('.')).toEqual(expect.arrayContaining(['index.html', 'package.json', 'src']));

    const result = await buildProject({ files: projectFilesFromFileSystem(shim.fs) });

    expect(result.entry).toBe('src/main.tsx');
    expect(result.usesTailwind).toBe(true);
    expect(result.js).toContain('https://esm.sh/react-dom@18.3.1/client');
    expect(result.warnings).toEqual([]);
  });

  it('runs its commands in the shim: npm install exits 0, npm run dev serves the preview', async () => {
    const { shim, actions } = await applySample(name);
    const ready = vi.fn();
    shim.on('server-ready', ready);

    for (const data of actions.filter((action) => action.action.type !== 'file')) {
      const [command, ...args] = data.action.content.trim().split(/\s+/);
      const process = await shim.spawn(command, args);
      void process.output.pipeTo(new WritableStream());

      if (data.action.type === 'shell') {
        await expect(process.exit).resolves.toBe(0);
      } else {
        await vi.waitFor(() => expect(ready).toHaveBeenCalled(), { timeout: 10_000 });
        process.kill();
      }
    }

    expect(ready).toHaveBeenCalledWith(PREVIEW_PORT, expect.stringContaining('esbuild-preview.invalid'));
  });
});

describe('sample specifics', () => {
  it('todo-tailwind imports approved packages from esm.sh at pinned versions', async () => {
    const { shim } = await applySample('todo-tailwind');
    const result = await buildProject({ files: projectFilesFromFileSystem(shim.fs) });

    expect(result.js).toContain('https://esm.sh/lucide-react@0.468.0?deps=react@18.3.1,react-dom@18.3.1');
    expect(result.js).toContain('https://esm.sh/clsx@2.1.1?deps=');
    expect(result.css).toContain('@apply bg-slate-100');
  });

  it('supabase-notes reads the VITE_ variables and falls back to demo data when they are empty', async () => {
    const { shim } = await applySample('supabase-notes');
    const withoutEnv = await buildProject({ files: projectFilesFromFileSystem(shim.fs) });

    expect(withoutEnv.js).toContain('https://esm.sh/@supabase/supabase-js@2.47.10?deps=');
    expect(withoutEnv.js).toContain('DEMO_NOTES');
    expect(withoutEnv.js).not.toMatch(/service_role/);

    const withEnv = await buildProject({
      files: projectFilesFromFileSystem(shim.fs),
      env: { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'public-anon-key' },
    });

    expect(withEnv.js).toContain('"https://example.supabase.co"');
  });
});
