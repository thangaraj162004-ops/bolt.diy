import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXIT_NOT_SUPPORTED,
  OSC_INTERACTIVE,
  OSC_PROMPT,
  classifyPackageManagerCommand,
  oscExit,
  parseCommandLine,
  shellCommandLine,
} from './shell-commands';
import { PREVIEW_PORT, PREVIEW_URL, WebContainerShim } from './shim';
import type { WebContainer, WebContainerProcess } from '~/lib/webcontainer/types';
import type { ITerminal } from '~/types/terminal';
import { CaShell } from '~/utils/shell';

/*
 * No network: React and other packages become esm.sh URLs that are never fetched.
 */

const REACT_PROJECT = {
  'package.json': JSON.stringify({ dependencies: { react: '18.3.1', 'react-dom': '18.3.1' } }),
  'index.html':
    '<!doctype html><html><head><title>Demo</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
  'src/main.tsx': `import { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.getElementById('root')!).render(<App />);`,
  'src/App.tsx': `export default function App() { return <h1>hello one</h1>; }`,
};

const processes: WebContainerProcess[] = [];

afterEach(() => {
  processes.splice(0).forEach((process) => process.kill());
});

async function createShim(files: Record<string, string> = {}) {
  const shim = new WebContainerShim('/home/project', { rebuildDelayMs: 20 });

  for (const [path, content] of Object.entries(files)) {
    const slash = path.lastIndexOf('/');

    if (slash > 0) {
      await shim.fs.mkdir(path.slice(0, slash), { recursive: true });
    }

    await shim.fs.writeFile(path, content);
  }

  return shim;
}

/** Collects everything a process prints. */
function collect(process: WebContainerProcess) {
  processes.push(process);

  const state = { text: '', done: false };
  void process.output
    .pipeTo(
      new WritableStream({
        write(chunk) {
          state.text += chunk;
        },
      }),
    )
    .finally(() => {
      state.done = true;
    });

  return state;
}

async function waitFor(check: () => boolean, timeoutMs = 5000) {
  const start = Date.now();

  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for condition');
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs one command line as a one-off process; returns output and exit code. */
async function run(shim: WebContainerShim, line: string) {
  const [command, ...args] = parseCommandLine(line)[0].argv;
  const process = await shim.spawn(command, args);
  const output = collect(process);
  const exitCode = await process.exit;
  await waitFor(() => output.done);

  return { output: output.text, exitCode };
}

/** A fake xterm: `input()` feeds `onData` listeners, like the real terminal. */
function createTerminal() {
  const listeners: Array<(data: string) => void> = [];

  const terminal = {
    cols: 80,
    rows: 24,
    written: '',
    reset: () => undefined,
    write(data: string) {
      terminal.written += data;
    },
    onData(cb: (data: string) => void) {
      listeners.push(cb);
    },
    input(data: string) {
      listeners.forEach((cb) => cb(data));
    },
  };

  return terminal;
}

/** Drives the real CaShell from app/utils/shell.ts against the shim's /bin/jsh. */
async function createCaShell(shim: WebContainerShim) {
  const shell = new CaShell();
  const terminal = createTerminal();
  await shell.init(shim as WebContainer, terminal as ITerminal);
  processes.push(shell.process!);

  return { shell, terminal };
}

describe('parseCommandLine', () => {
  it('splits on &&, || and ; and keeps quoted text together', () => {
    expect(parseCommandLine(`echo "a && b" && cd src; ls -la || echo "it's" 'x\\y'`)).toEqual([
      { argv: ['echo', 'a && b'], next: '&&' },
      { argv: ['cd', 'src'], next: ';' },
      { argv: ['ls', '-la'], next: '||' },
      { argv: ['echo', "it's", 'x\\y'] },
    ]);
  });

  it('rejects pipes, redirects and dangling operators', () => {
    expect(() => parseCommandLine('ls | grep a')).toThrow(/not supported/);
    expect(() => parseCommandLine('echo a > b')).toThrow(/not supported/);
    expect(() => parseCommandLine('echo a &&')).toThrow(/nothing after/);
    expect(() => parseCommandLine('echo "open')).toThrow(/unterminated/);
  });
});

describe('classifyPackageManagerCommand', () => {
  it.each([
    ['npm install', 'install'],
    ['npm i react', 'install'],
    ['npm ci', 'install'],
    ['pnpm add lodash', 'install'],
    ['yarn', 'install'],
    ['npm run dev', 'dev'],
    ['pnpm dev', 'dev'],
    ['yarn start', 'dev'],
    ['npm run start', 'dev'],
    ['npm start', 'dev'],
    ['npx vite', 'dev'],
    ['npx vite --host', 'dev'],
    ['vite', 'dev'],
    ['npm run build', 'build'],
    ['pnpm build', 'build'],
    ['npx vite build', 'build'],
    ['vite build', 'build'],
    ['npm run lint', 'unsupported'],
    ['npx prisma generate', 'unsupported'],
  ])('%s → %s', (line, kind) => {
    expect(classifyPackageManagerCommand(line.split(' '))?.kind).toBe(kind);
  });

  it('ignores other programs', () => {
    expect(classifyPackageManagerCommand(['node', 'x.js'])).toBeUndefined();
  });
});

describe('builtins (one-off processes)', () => {
  it('echo, pwd, true and false', async () => {
    const shim = await createShim();

    expect(await run(shim, 'echo hello world')).toEqual({ output: 'hello world\r\n', exitCode: 0 });
    expect(await run(shim, 'echo -n no newline')).toEqual({ output: 'no newline', exitCode: 0 });
    expect(await run(shim, 'pwd')).toEqual({ output: '/home/project\r\n', exitCode: 0 });
    expect((await run(shim, 'true')).exitCode).toBe(0);
    expect((await run(shim, 'false')).exitCode).toBe(1);
  });

  it('mkdir, touch, ls, cat and rm', async () => {
    const shim = await createShim({ 'notes.txt': 'line one\nline two' });

    expect((await run(shim, 'mkdir src')).exitCode).toBe(0);
    expect(await run(shim, 'mkdir src')).toEqual({
      output: "mkdir: cannot create directory 'src': File exists\r\n",
      exitCode: 1,
    });
    expect((await run(shim, 'mkdir a/b/c')).exitCode).toBe(1);
    expect((await run(shim, 'mkdir -p a/b/c')).exitCode).toBe(0);
    expect((await run(shim, 'touch src/app.ts .hidden')).exitCode).toBe(0);
    expect(await shim.fs.readFile('src/app.ts', 'utf-8')).toBe('');

    expect(await run(shim, 'ls')).toEqual({ output: 'a  notes.txt  src\r\n', exitCode: 0 });
    expect((await run(shim, 'ls -a')).output).toBe('.hidden  a  notes.txt  src\r\n');
    expect((await run(shim, 'ls missing')).exitCode).toBe(2);

    expect(await run(shim, 'cat notes.txt')).toEqual({ output: 'line one\r\nline two', exitCode: 0 });
    expect(await run(shim, 'cat nope.txt')).toEqual({
      output: 'cat: nope.txt: No such file or directory\r\n',
      exitCode: 1,
    });

    expect(await run(shim, 'rm a')).toEqual({ output: "rm: cannot remove 'a': Is a directory\r\n", exitCode: 1 });
    expect((await run(shim, 'rm -r a')).exitCode).toBe(0);
    expect((await run(shim, 'rm missing.txt')).exitCode).toBe(1);
    expect((await run(shim, 'rm -f missing.txt')).exitCode).toBe(0);
    expect((await run(shim, 'rm -rf src notes.txt')).exitCode).toBe(0);
    expect(await shim.fs.readdir('.')).toEqual(['.hidden']);
  });

  it('clear prints the clear-screen sequence', async () => {
    const shim = await createShim();
    expect(await run(shim, 'clear')).toEqual({ output: '\x1b[2J\x1b[3J\x1b[H', exitCode: 0 });
  });

  it('chains with && (stops on failure), || and ;', async () => {
    const shim = await createShim();

    const process = await shim.spawn('/bin/jsh', ['--osc']);
    const out = collect(process);
    const writer = process.input.getWriter();

    await writer.write('echo a && false && echo never; echo b || echo never2; false || echo c\n');
    await waitFor(() => out.text.includes(oscExit(0)));

    // what the commands printed, after the shell's echo of the typed line
    const printed = out.text.slice(out.text.indexOf('echo c\r\n') + 'echo c\r\n'.length);
    expect(printed.startsWith('a\r\nb\r\nc\r\n')).toBe(true);
    expect(printed).not.toContain('never');
  });

  it('cd then ls lists the new folder, and cd keeps state between commands', async () => {
    const shim = await createShim({ 'src/components/Button.tsx': 'x', 'src/main.tsx': 'y' });
    const process = await shim.spawn('/bin/jsh', ['--osc']);
    const out = collect(process);
    const writer = process.input.getWriter();

    await writer.write('cd src\n');
    await waitFor(() => out.text.split(OSC_PROMPT).length === 3);
    await writer.write('ls && pwd\n');
    await waitFor(() => out.text.split(OSC_PROMPT).length === 4);

    expect(out.text).toContain('components  main.tsx\r\n/home/project/src\r\n');
    expect(out.text).toContain('~/project/src');

    await writer.write('cd nowhere\n');
    await waitFor(() => out.text.includes(oscExit(1)));
    expect(out.text).toContain('cd: no such file or directory: nowhere');
  });

  it('npm install changes nothing and exits 0', async () => {
    const shim = await createShim({ 'package.json': '{}' });

    const result = await run(shim, 'npm install react');
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('esm.sh');
    expect(await shim.fs.readdir('.')).toEqual(['package.json']);
  });

  it('unsupported commands print a message and end with 127, never hanging', async () => {
    const shim = await createShim();

    expect(await run(shim, 'node server.js')).toEqual({
      output: '\x1b[31mcommand not supported in the browser preview: node\x1b[0m\r\n',
      exitCode: EXIT_NOT_SUPPORTED,
    });
    expect((await run(shim, 'npm run lint')).output).toContain('not supported in the browser preview: npm run lint');
    expect((await run(shim, 'npm run lint')).exitCode).toBe(127);
  });
});

/** Package files like the Vite + React + Tailwind starter, whose scripts need tsc and vite. */
const VITE_STARTER = {
  ...REACT_PROJECT,
  'package.json': JSON.stringify({
    name: 'vite-react-typescript-starter',
    type: 'module',
    scripts: { dev: 'vite', build: 'tsc -b && vite build', lint: 'eslint .', preview: 'vite preview' },
    dependencies: { 'lucide-react': '0.344.0', react: '18.3.1', 'react-dom': '18.3.1' },
    devDependencies: { tailwindcss: '3.4.1', typescript: '5.5.3', vite: '5.4.2' },
  }),
  'vite.config.ts': "import { defineConfig } from 'vite';\nexport default defineConfig({});\n",
  'tailwind.config.js': 'export default { content: [] };\n',
  'postcss.config.js': 'export default { plugins: {} };\n',
  'tsconfig.json': '{ "files": [] }',
  'src/vite-env.d.ts': '/// <reference types="vite/client" />\n',
};

describe('jsh -c (how project_run_command runs commands)', () => {
  it('finds the command line after -c', () => {
    expect(shellCommandLine(['-c', 'npm run dev'])).toBe('npm run dev');
    expect(shellCommandLine(['--osc', '-c', 'echo hi && pwd'])).toBe('echo hi && pwd');
    expect(shellCommandLine(['--osc'])).toBeUndefined();
    expect(shellCommandLine([])).toBeUndefined();
  });

  it('runs the line once, prints its output and exits with its code', async () => {
    const shim = await createShim({ 'a.txt': 'alpha' });

    const ok = await shim.spawn('/bin/jsh', ['-c', 'echo hi && cat a.txt']);
    const okOut = collect(ok);
    await expect(ok.exit).resolves.toBe(0);
    await waitFor(() => okOut.done);
    expect(okOut.text).toBe('hi\r\nalpha');
    expect(okOut.text).not.toContain(OSC_PROMPT);

    const failed = await shim.spawn('/bin/jsh', ['-c', 'false']);
    await expect(failed.exit).resolves.toBe(1);

    const unsupported = await shim.spawn('jsh', ['-c', 'tsc -b']);
    collect(unsupported);
    await expect(unsupported.exit).resolves.toBe(127);
  });

  it('npm run build exits 0 and writes dist/index.html, even though the starter script is "tsc -b && vite build"', async () => {
    const shim = await createShim(VITE_STARTER);

    const build = await shim.spawn('/bin/jsh', ['-c', 'npm run build']);
    const out = collect(build);
    await expect(build.exit).resolves.toBe(0);
    await waitFor(() => out.done);

    expect(out.text).toContain('Building for production');
    expect(out.text).toContain('dist/index.html');
    expect(out.text).toMatch(/built in \d+ms/);
    expect(await shim.fs.readFile('dist/index.html', 'utf-8')).toContain('hello one');
  });

  it('npm run dev keeps running, prints the ready line and emits port and server-ready', async () => {
    const shim = await createShim(VITE_STARTER);
    const ready = vi.fn();
    shim.on('server-ready', ready);

    const dev = await shim.spawn('/bin/jsh', ['-c', 'cd /home/project && npm run dev']);
    const out = collect(dev);
    await waitFor(() => out.text.includes('Preview ready'));

    expect(out.text).toMatch(/built in \d+ms/);
    expect(ready).toHaveBeenCalledWith(PREVIEW_PORT, PREVIEW_URL);
    expect(shim.getPreviewHtml(PREVIEW_PORT)).toContain('hello one');
    expect(out.done).toBe(false);

    dev.kill();
    await expect(dev.exit).resolves.toBe(143);
    expect(shim.previewRuntime).toBeUndefined();
  });

  it('a build error prints the file and line and exits 1', async () => {
    const shim = await createShim({
      ...VITE_STARTER,
      'src/App.tsx': "import Missing from './Missing';\nexport default () => <Missing />;",
    });

    const build = await shim.spawn('/bin/jsh', ['-c', 'npm run build']);
    const out = collect(build);
    await expect(build.exit).resolves.toBe(1);
    await waitFor(() => out.done);

    expect(out.text).toContain('Build failed');
    expect(out.text).toContain('src/App.tsx:1:');
  });
});

describe('npm run build', () => {
  it('writes dist/index.html and exits 0', async () => {
    const shim = await createShim(REACT_PROJECT);

    const result = await run(shim, 'npm run build');

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('dist/index.html');
    expect(await shim.fs.readFile('dist/index.html', 'utf-8')).toContain('hello one');
  });

  it('prints the BuildError and exits 1', async () => {
    const shim = await createShim({ 'src/main.ts': `import './missing';` });

    const result = await run(shim, 'npm run build');

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Build failed:');
    expect(result.output).toContain('src/main.ts:1:7: Could not resolve "./missing"');
  });
});

describe('dev server', () => {
  it('emits port open and server-ready with the marker URL and serves HTML', async () => {
    const shim = await createShim(REACT_PROJECT);
    const events: unknown[][] = [];
    shim.on('port', (...args) => events.push(['port', ...args]));
    shim.on('server-ready', (...args) => events.push(['server-ready', ...args]));

    const process = await shim.spawn('npm', ['run', 'dev']);
    const out = collect(process);
    await waitFor(() => events.length === 2);

    expect(events).toEqual([
      ['port', PREVIEW_PORT, 'open', PREVIEW_URL],
      ['server-ready', PREVIEW_PORT, PREVIEW_URL],
    ]);
    expect(PREVIEW_URL).toBe('https://esbuild-preview.invalid/5173/');
    expect(shim.getPreviewHtml(PREVIEW_PORT)).toContain('hello one');
    expect(shim.getPreviewHtml(3000)).toBeUndefined();
    await waitFor(() => out.text.includes('Preview ready'));
    expect(out.done).toBe(false);
  });

  it('passes the stored preview script into the HTML', async () => {
    const shim = await createShim(REACT_PROJECT);
    await shim.setPreviewScript('window.__inspector = true;');

    const process = await shim.spawn('npm', ['run', 'dev']);
    collect(process);
    await waitFor(() => shim.getPreviewHtml(PREVIEW_PORT) !== undefined);

    expect(shim.getPreviewHtml(PREVIEW_PORT)).toContain('window.__inspector = true;');
  });

  it('rebuilds after a file write and reports it in the output', async () => {
    const shim = await createShim(REACT_PROJECT);
    const process = await shim.spawn('npm', ['run', 'dev']);
    const out = collect(process);
    await waitFor(() => shim.previewRuntime?.version === 1);

    await shim.fs.writeFile('src/App.tsx', `export default function App() { return <h1>hello two</h1>; }`);
    await waitFor(() => shim.previewRuntime?.version === 2);

    expect(shim.getPreviewHtml(PREVIEW_PORT)).toContain('hello two');
    await waitFor(() => out.text.includes('page reload (build 2'));
  });

  it('shows build errors in the output and in the preview, then recovers', async () => {
    const shim = await createShim(REACT_PROJECT);
    const process = await shim.spawn('npm', ['run', 'dev']);
    const out = collect(process);
    await waitFor(() => shim.previewRuntime?.version === 1);

    await shim.fs.writeFile('src/App.tsx', `import x from './gone';\nexport default () => x;`);
    await waitFor(() => out.text.includes('Build failed'));

    expect(out.text).toContain('src/App.tsx:1:14: Could not resolve "./gone"');
    expect(shim.getPreviewHtml(PREVIEW_PORT)).toContain('The preview could not be built');

    await shim.fs.writeFile('src/App.tsx', `export default function App() { return <h1>back</h1>; }`);
    await waitFor(() => shim.getPreviewHtml(PREVIEW_PORT)?.includes('back') === true);
  });

  it('puts the error bridge in the HTML with the current token, a new one per build, and reports updates', async () => {
    const shim = await createShim(REACT_PROJECT);
    const updates: string[] = [];
    shim.onPreviewUpdate((update) => updates.push(update.kind));

    collect(await shim.spawn('npm', ['run', 'dev']));
    await waitFor(() => shim.previewRuntime?.version === 1);

    const firstToken = shim.getPreviewBridgeToken(PREVIEW_PORT)!;
    expect(firstToken).toMatch(/^[0-9a-f]{32}$/);
    expect(shim.getPreviewHtml(PREVIEW_PORT)).toContain(`"token":"${firstToken}"`);
    expect(shim.getPreviewHtml(PREVIEW_PORT)).toContain('data-ca-preview-bridge');

    await shim.rebuildPreview(PREVIEW_PORT);

    const secondToken = shim.getPreviewBridgeToken(PREVIEW_PORT);
    expect(secondToken).not.toBe(firstToken);
    expect(shim.getPreviewHtml(PREVIEW_PORT)).toContain(`"token":"${secondToken}"`);

    await shim.fs.writeFile('src/App.tsx', `import x from './gone';\nexport default () => x;`);
    await waitFor(() => updates.includes('build-error'));
    expect(shim.getPreviewBridgeToken(PREVIEW_PORT)).toBeUndefined();
    expect(updates).toEqual(['ready', 'rebuilt', 'build-error']);
  });

  it('kill() stops the runtime and its watcher: no more rebuilds, port closes', async () => {
    const shim = await createShim(REACT_PROJECT);
    const ports = vi.fn();
    shim.on('port', ports);

    const process = await shim.spawn('npm', ['run', 'dev']);
    collect(process);
    await waitFor(() => shim.previewRuntime?.version === 1);

    const runtime = shim.previewRuntime!;

    process.kill();

    expect(runtime.running).toBe(false);
    expect(shim.previewRuntime).toBeUndefined();
    expect(shim.getPreviewHtml(PREVIEW_PORT)).toBeUndefined();
    expect(ports).toHaveBeenLastCalledWith(PREVIEW_PORT, 'close', PREVIEW_URL);
    await expect(process.exit).resolves.toBe(143);

    await shim.fs.writeFile('src/App.tsx', `export default function App() { return <h1>after kill</h1>; }`);
    await sleep(100);

    expect(runtime.version).toBe(1);
  });

  it('starting a second dev server stops the first one', async () => {
    const shim = await createShim(REACT_PROJECT);
    collect(await shim.spawn('npm', ['run', 'dev']));
    await waitFor(() => shim.previewRuntime?.version === 1);

    const first = shim.previewRuntime!;

    collect(await shim.spawn('npx', ['vite']));
    await waitFor(() => shim.previewRuntime !== undefined && shim.previewRuntime !== first);

    expect(first.running).toBe(false);
  });
});

describe('shell marker protocol', () => {
  it('starts with the interactive marker alone in the first chunk, then a prompt', async () => {
    const shim = await createShim();
    const process = await shim.spawn('/bin/jsh', ['--osc']);
    const reader = process.output.getReader();
    processes.push(process);

    // shell.ts only checks the FIRST marker of a chunk for "interactive"
    expect((await reader.read()).value).toBe(OSC_INTERACTIVE);
    expect((await reader.read()).value).toContain(OSC_PROMPT);
  });

  it('answers Ctrl-C while idle with ^C and a new prompt, without an exit marker', async () => {
    const shim = await createShim();
    const process = await shim.spawn('/bin/jsh', ['--osc']);
    const out = collect(process);
    await waitFor(() => out.text.includes(OSC_PROMPT));

    const before = out.text.length;

    await process.input.getWriter().write('\x03');
    await waitFor(() => out.text.slice(before).includes(OSC_PROMPT));

    expect(out.text.slice(before)).toMatch(/^\^C\r\n\x1b\]654;prompt\x07/);
    expect(out.text).not.toContain('654;exit');
  });

  it('works with the real CaShell: exit codes and output for each command', async () => {
    const shim = await createShim({ 'a.txt': 'alpha' });
    const { shell } = await createCaShell(shim);

    const first = await shell.executeCommand('s1', 'echo hi && cat a.txt');
    expect(first).toEqual({ output: expect.stringContaining('hi'), exitCode: 0 });
    expect(first?.output).toContain('alpha');

    expect(await shell.executeCommand('s2', 'false')).toMatchObject({ exitCode: 1 });
    expect(await shell.executeCommand('s3', 'python main.py')).toMatchObject({
      exitCode: 127,
      output: expect.stringContaining('command not supported in the browser preview: python'),
    });
    expect(await shell.executeCommand('s4', 'pwd')).toMatchObject({
      exitCode: 0,
      output: expect.stringContaining('/home/project'),
    });
  });

  it('works with the real CaShell: a dev server runs until the next command interrupts it with exit 130', async () => {
    const shim = await createShim(REACT_PROJECT);
    const ready = vi.fn();
    shim.on('server-ready', ready);

    const { shell } = await createCaShell(shim);

    const dev = shell.executeCommand('dev', 'npm install && npm run dev');
    await waitFor(() => ready.mock.calls.length === 1);
    expect(shell.executionState.get()).toMatchObject({ sessionId: 'dev', active: true });

    // CaShell sends Ctrl-C, waits for the exit marker of the dev server, then the prompt
    const next = await shell.executeCommand('next', 'echo after');

    await expect(dev).resolves.toMatchObject({ exitCode: 130 });
    expect(next).toMatchObject({ exitCode: 0, output: expect.stringContaining('after') });
    expect(shim.previewRuntime).toBeUndefined();
  });

  it('exit ends the shell process with the given code', async () => {
    const shim = await createShim();
    const process = await shim.spawn('/bin/jsh', ['--osc']);
    const out = collect(process);

    await process.input.getWriter().write('exit 3\n');

    await expect(process.exit).resolves.toBe(3);
    await waitFor(() => out.done);
    expect(out.text).toContain(oscExit(3));
  });
});
