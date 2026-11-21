/**
 * Fake shell and command runner for the browser preview shim.
 *
 * `spawn('/bin/jsh', ...)` returns an interactive shell process that speaks
 * the same OSC 654 marker protocol as WebContainer's jsh, which is what
 * `app/utils/shell.ts` (BoltShell) waits for:
 *
 *   - `ESC ] 654 ; interactive BEL`  once, as the FIRST marker of its own output
 *     chunk (shell.ts only checks the first marker of each chunk for it)
 *   - `ESC ] 654 ; prompt BEL`       whenever the shell is ready for a command,
 *     including after Ctrl-C (`\x03`) while idle
 *   - `ESC ] 654 ; exit=0:<code> BEL` when a command finishes; shell.ts reads the
 *     exit code from the number after the colon. It is always followed by a prompt.
 *
 * Any other command (`spawn('npm', ['run', 'build'])`) runs once as its own
 * process: plain output, then the stream closes and `exit` resolves.
 */
import type { MemoryFileSystem } from './memory-fs';
import { BuildError } from './preview/compiler';
import type { ProductionBuildResult } from './preview/runtime';
import type { WebContainerProcess } from '~/lib/webcontainer/types';
import { path as pathUtils } from '~/utils/path';

export const OSC_INTERACTIVE = '\x1b]654;interactive\x07';
export const OSC_PROMPT = '\x1b]654;prompt\x07';
export const oscExit = (code: number) => `\x1b]654;exit=0:${code}\x07`;

export const EXIT_INTERRUPTED = 130;
export const EXIT_KILLED = 143;
export const EXIT_NOT_SUPPORTED = 127;

const HOME = '/home';
const CLEAR_SCREEN = '\x1b[2J\x1b[3J\x1b[H';
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;

export interface DevServerHandle {
  url: string;

  /** Stops the preview runtime and its file watcher. Safe to call twice. */
  stop(): void;
}

/** What the commands need from the shim. */
export interface CommandHost {
  fs: MemoryFileSystem;

  /** Starts the preview runtime; resolves after the first build. `write` receives runtime messages. */
  startDevServer(write: (text: string) => void): Promise<DevServerHandle>;

  /** `npm run build`: writes dist/index.html; throws a BuildError on failure. */
  buildForProduction(): Promise<ProductionBuildResult>;
}

type AbortReason = 'interrupt' | 'kill';

/* -------------------------------------------------------------- parsing */

export interface ParsedCommand {
  argv: string[];

  /** How this command connects to the NEXT one. */
  next?: '&&' | '||' | ';';
}

export class ShellSyntaxError extends Error {}

/** Splits a command line on `&&`, `||` and `;`, honouring quotes and backslashes. */
export function parseCommandLine(line: string): ParsedCommand[] {
  const commands: ParsedCommand[] = [];

  let argv: string[] = [];
  let word = '';
  let hasWord = false;
  let quote: '"' | "'" | undefined;

  const endWord = () => {
    if (hasWord) {
      argv.push(word);
    }

    word = '';
    hasWord = false;
  };

  const endCommand = (next?: ParsedCommand['next']) => {
    endWord();

    if (argv.length === 0) {
      if (next) {
        throw new ShellSyntaxError(`syntax error near unexpected token '${next}'`);
      }

      return;
    }

    commands.push({ argv, next });
    argv = [];
  };

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else if (char === '\\' && quote === '"' && i + 1 < line.length) {
        word += line[++i];
      } else {
        word += char;
      }

      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      hasWord = true;
    } else if (char === '\\' && i + 1 < line.length) {
      word += line[++i];
      hasWord = true;
    } else if (/\s/.test(char)) {
      endWord();
    } else if (char === '&' && line[i + 1] === '&') {
      endCommand('&&');
      i++;
    } else if (char === '|' && line[i + 1] === '|') {
      endCommand('||');
      i++;
    } else if (char === ';') {
      endCommand(';');
    } else if (char === '|' || char === '>' || char === '<' || char === '&') {
      throw new ShellSyntaxError(
        `'${char}' (pipes, redirects and background jobs) is not supported in the browser preview`,
      );
    } else {
      word += char;
      hasWord = true;
    }
  }

  if (quote) {
    throw new ShellSyntaxError('unterminated quote');
  }

  endCommand();

  const last = commands[commands.length - 1];

  if (last?.next === '&&' || last?.next === '||') {
    throw new ShellSyntaxError(`syntax error: nothing after '${last.next}'`);
  }

  return commands;
}

export type PackageManagerAction =
  { kind: 'install' } | { kind: 'dev' } | { kind: 'build' } | { kind: 'unsupported'; label: string };

const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn']);

/** Recognises npm/pnpm/yarn/npx/vite forms. Returns undefined for other programs. */
export function classifyPackageManagerCommand(argv: string[]): PackageManagerAction | undefined {
  const [tool, ...rest] = argv;
  const words = rest.filter((arg) => !arg.startsWith('-'));

  if (tool === 'vite' || (tool === 'npx' && words[0] === 'vite')) {
    const sub = tool === 'vite' ? words[0] : words[1];

    if (sub === 'build') {
      return { kind: 'build' };
    }

    if (sub === undefined || sub === 'dev' || sub === 'serve') {
      return { kind: 'dev' };
    }

    return { kind: 'unsupported', label: `vite ${sub}` };
  }

  if (tool === 'npx') {
    return { kind: 'unsupported', label: words[0] ? `npx ${words[0]}` : 'npx' };
  }

  if (!PACKAGE_MANAGERS.has(tool)) {
    return undefined;
  }

  const [sub, script] = words;

  if (sub === undefined) {
    return tool === 'yarn' ? { kind: 'install' } : { kind: 'unsupported', label: tool };
  }

  if (['install', 'i', 'ci', 'add'].includes(sub)) {
    return { kind: 'install' };
  }

  const target = sub === 'run' || sub === 'run-script' ? script : sub;

  if (target === 'dev' || target === 'start') {
    return { kind: 'dev' };
  }

  if (target === 'build') {
    return { kind: 'build' };
  }

  return {
    kind: 'unsupported',
    label: sub === 'run' || sub === 'run-script' ? `${tool} run ${script ?? ''}`.trim() : `${tool} ${sub}`,
  };
}

/* ------------------------------------------------------------- executor */

function errorCode(error: unknown) {
  return (error as { code?: string })?.code;
}

/**
 * Runs command lines against the in-memory file system. Keeps the working
 * directory between commands, like a shell session.
 */
export class CommandExecutor {
  cwd: string;

  /** Set by the `exit` builtin. */
  exitRequested: number | undefined;

  #host: CommandHost;
  #write: (text: string) => void;
  #lastCode = 0;

  constructor(host: CommandHost, write: (text: string) => void) {
    this.#host = host;
    this.#write = (text) => write(text.replace(/\r?\n/g, '\r\n'));
    this.cwd = host.fs.workdir;
  }

  /** `~/project` for the prompt. */
  get displayCwd() {
    return this.cwd === HOME || this.cwd.startsWith(`${HOME}/`) ? `~${this.cwd.slice(HOME.length)}` : this.cwd;
  }

  /** Runs a full command line; resolves with the exit code of the last command that ran. */
  async run(line: string, signal: AbortSignal): Promise<number> {
    let commands: ParsedCommand[];

    try {
      commands = parseCommandLine(line);
    } catch (error) {
      this.#write(`${red(`jsh: ${(error as Error).message}`)}\n`);
      return (this.#lastCode = 2);
    }

    let code = this.#lastCode;
    let previous: ParsedCommand['next'];

    for (const command of commands) {
      const skip = (previous === '&&' && code !== 0) || (previous === '||' && code === 0);

      if (!skip) {
        code = await this.#runOne(command.argv, signal);
        this.#lastCode = code;
      }

      if (signal.aborted || this.exitRequested !== undefined) {
        break;
      }

      previous = command.next;
    }

    return code;
  }

  async #runOne(argv: string[], signal: AbortSignal): Promise<number> {
    const [name, ...args] = argv;

    try {
      switch (name) {
        case 'echo':
          return this.#echo(args);
        case 'pwd':
          this.#write(`${this.cwd}\n`);
          return 0;
        case 'cd':
          return await this.#cd(args);
        case 'ls':
          return await this.#ls(args);
        case 'cat':
          return await this.#cat(args);
        case 'mkdir':
          return await this.#mkdir(args);
        case 'rm':
          return await this.#rm(args);
        case 'touch':
          return await this.#touch(args);
        case 'clear':
          this.#write(CLEAR_SCREEN);
          return 0;
        case 'exit': {
          const code = args[0] === undefined ? this.#lastCode : Number.parseInt(args[0], 10);
          this.exitRequested = Number.isNaN(code) ? 2 : code;

          return this.exitRequested;
        }
        case 'true':
          return 0;
        case 'false':
          return 1;
      }

      const action = classifyPackageManagerCommand(argv);

      switch (action?.kind) {
        case 'install':
          this.#write(
            'Packages are loaded from https://esm.sh when the preview runs, so nothing needs to be installed.\n',
          );
          return 0;
        case 'dev':
          return await this.#dev(signal);
        case 'build':
          return await this.#build();
        case 'unsupported':
          return this.#notSupported(action.label);
      }

      return this.#notSupported(name);
    } catch (error) {
      this.#write(`${red(`${name}: ${(error as Error).message}`)}\n`);
      return 1;
    }
  }

  #notSupported(label: string) {
    this.#write(`${red(`command not supported in the browser preview: ${label}`)}\n`);
    return EXIT_NOT_SUPPORTED;
  }

  #resolve(target: string) {
    if (target === '~' || target.startsWith('~/')) {
      return pathUtils.normalize(HOME + target.slice(1));
    }

    const absolute = target.startsWith('/') ? target : `${this.cwd}/${target}`;
    const normalized = pathUtils.normalize(absolute);

    return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
  }

  async #isDirectory(absolute: string) {
    try {
      await this.#host.fs.readdir(absolute);
      return true;
    } catch {
      return false;
    }
  }

  #echo(args: string[]) {
    const noNewline = args[0] === '-n';
    const text = (noNewline ? args.slice(1) : args).join(' ');
    this.#write(noNewline ? text : `${text}\n`);

    return 0;
  }

  async #cd(args: string[]) {
    const target = args[0] ?? '~';
    const absolute = this.#resolve(target);

    try {
      await this.#host.fs.readdir(absolute);
    } catch (error) {
      const reason = errorCode(error) === 'ENOTDIR' ? 'not a directory' : 'no such file or directory';
      this.#write(`cd: ${reason}: ${target}\n`);

      return 1;
    }

    this.cwd = absolute;

    return 0;
  }

  async #ls(args: string[]) {
    const flags = args.filter((arg) => arg.startsWith('-')).join('');
    const showHidden = flags.includes('a');
    const onePerLine = flags.includes('l') || flags.includes('1');
    const targets = args.filter((arg) => !arg.startsWith('-'));

    let code = 0;

    for (const [index, target] of (targets.length ? targets : ['.']).entries()) {
      const absolute = this.#resolve(target);

      let names: string[];

      try {
        names = (await this.#host.fs.readdir(absolute)).filter((name) => showHidden || !name.startsWith('.'));
      } catch (error) {
        if (errorCode(error) === 'ENOTDIR') {
          this.#write(`${target}\n`);
          continue;
        }

        this.#write(`ls: cannot access '${target}': No such file or directory\n`);
        code = 2;
        continue;
      }

      if (targets.length > 1) {
        this.#write(`${index > 0 ? '\n' : ''}${target}:\n`);
      }

      if (names.length) {
        this.#write(`${names.join(onePerLine ? '\n' : '  ')}\n`);
      }
    }

    return code;
  }

  async #cat(args: string[]) {
    let code = 0;

    for (const target of args) {
      try {
        this.#write(await this.#host.fs.readFile(this.#resolve(target), 'utf-8'));
      } catch (error) {
        const reason = errorCode(error) === 'EISDIR' ? 'Is a directory' : 'No such file or directory';
        this.#write(`cat: ${target}: ${reason}\n`);
        code = 1;
      }
    }

    return code;
  }

  async #mkdir(args: string[]) {
    const parents = args.some((arg) => /^-[a-z]*p/.test(arg));
    const targets = args.filter((arg) => !arg.startsWith('-'));

    if (!targets.length) {
      this.#write('mkdir: missing operand\n');
      return 1;
    }

    let code = 0;

    for (const target of targets) {
      try {
        if (parents) {
          await this.#host.fs.mkdir(this.#resolve(target), { recursive: true });
        } else {
          await this.#host.fs.mkdir(this.#resolve(target));
        }
      } catch (error) {
        const reason = errorCode(error) === 'EEXIST' ? 'File exists' : 'No such file or directory';
        this.#write(`mkdir: cannot create directory '${target}': ${reason}\n`);
        code = 1;
      }
    }

    return code;
  }

  async #rm(args: string[]) {
    const flags = args.filter((arg) => arg.startsWith('-')).join('');
    const recursive = /[rR]/.test(flags);
    const force = flags.includes('f');
    const targets = args.filter((arg) => !arg.startsWith('-'));

    if (!targets.length) {
      if (force) {
        return 0;
      }

      this.#write('rm: missing operand\n');

      return 1;
    }

    let code = 0;

    for (const target of targets) {
      const absolute = this.#resolve(target);

      if (!recursive && (await this.#isDirectory(absolute))) {
        this.#write(`rm: cannot remove '${target}': Is a directory\n`);
        code = 1;
        continue;
      }

      try {
        await this.#host.fs.rm(absolute, { recursive, force });
      } catch (error) {
        const reason = errorCode(error) === 'ENOENT' ? 'No such file or directory' : (error as Error).message;
        this.#write(`rm: cannot remove '${target}': ${reason}\n`);
        code = 1;
      }
    }

    return code;
  }

  async #touch(args: string[]) {
    let code = 0;

    for (const target of args.filter((arg) => !arg.startsWith('-'))) {
      const absolute = this.#resolve(target);

      try {
        await this.#host.fs.readFile(absolute);
      } catch (error) {
        if (errorCode(error) === 'EISDIR') {
          continue;
        }

        try {
          await this.#host.fs.writeFile(absolute, '');
        } catch {
          this.#write(`touch: cannot touch '${target}': No such file or directory\n`);
          code = 1;
        }
      }
    }

    return code;
  }

  async #dev(signal: AbortSignal): Promise<number> {
    if (signal.aborted) {
      return abortCode(signal);
    }

    this.#write(`${cyan('Starting the browser preview (esbuild)...')}\n`);

    const handle = await this.#host.startDevServer((text) => this.#write(text));

    if (signal.aborted) {
      handle.stop();
      return abortCode(signal);
    }

    this.#write(`\n  ${green('➜')}  Preview ready: ${handle.url}\n  Press Ctrl+C to stop.\n\n`);

    return new Promise<number>((resolve) => {
      signal.addEventListener(
        'abort',
        () => {
          // synchronous, so the runtime and its watcher are stopped before kill() returns
          handle.stop();
          resolve(abortCode(signal));
        },
        { once: true },
      );
    });
  }

  async #build(): Promise<number> {
    this.#write(`${cyan('Building for production (esbuild)...')}\n`);

    const startedAt = Date.now();

    try {
      const result = await this.#host.buildForProduction();

      for (const warning of result.warnings) {
        this.#write(`warning: ${warning.file ? `${warning.file}: ` : ''}${warning.text}\n`);
      }

      this.#write(`dist/index.html  ${(result.bytes / 1024).toFixed(1)} kB\n`);
      this.#write(`${green(`✓ built in ${Date.now() - startedAt}ms`)}\n`);

      return 0;
    } catch (error) {
      const message = error instanceof BuildError ? error.message : (error as Error).message;
      this.#write(`${red('Build failed:')}\n${message}\n`);

      return 1;
    }
  }
}

function abortCode(signal: AbortSignal) {
  return (signal.reason as AbortReason) === 'kill' ? EXIT_KILLED : EXIT_INTERRUPTED;
}

/* ------------------------------------------------------------ processes */

/** Output stream + exit promise shared by both process kinds. */
class ProcessChannel {
  readonly output: ReadableStream<string>;
  readonly exit: Promise<number>;

  #controller!: ReadableStreamDefaultController<string>;
  #resolveExit!: (code: number) => void;
  #closed = false;

  constructor() {
    this.output = new ReadableStream<string>({
      start: (controller) => {
        this.#controller = controller;
      },
    });
    this.exit = new Promise((resolve) => {
      this.#resolveExit = resolve;
    });
  }

  get closed() {
    return this.#closed;
  }

  write(text: string) {
    if (!this.#closed && text) {
      this.#controller.enqueue(text);
    }
  }

  close(code: number) {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.#controller.close();
    this.#resolveExit(code);
  }
}

/** One command, run once: `spawn('npm', ['run', 'build'])`. */
export function createCommandProcess(host: CommandHost, command: string, args: string[]): WebContainerProcess {
  const channel = new ProcessChannel();
  const abort = new AbortController();
  const executor = new CommandExecutor(host, (text) => channel.write(text));

  // quote arguments so `spawn('echo', ['a b'])` keeps one argument
  const line = [command, ...args]
    .map((arg) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`))
    .join(' ');

  void executor.run(line, abort.signal).then(
    (code) => channel.close(code),
    () => channel.close(1),
  );

  return {
    output: channel.output,
    exit: channel.exit,
    input: new WritableStream<string>({
      write() {
        // one-off commands do not read input
      },
    }),
    kill() {
      abort.abort('kill' satisfies AbortReason);
      channel.close(EXIT_KILLED);
    },
    resize() {
      // no terminal size to track
    },
  };
}

/** The interactive shell: `spawn('/bin/jsh', ['--osc'])`. */
export function createShellProcess(host: CommandHost): WebContainerProcess {
  const channel = new ProcessChannel();
  const executor = new CommandExecutor(host, (text) => channel.write(text));

  let line = '';
  let running: { abort: AbortController } | undefined;

  const queued: string[] = [];

  let skipEscape = false;
  let lastWasCarriageReturn = false;

  const writePrompt = () => {
    channel.write(`${OSC_PROMPT}\x1b[1;34m${executor.displayCwd}\x1b[0m\r\n\x1b[1;35m❯\x1b[0m `);
  };

  const execute = (commandLine: string) => {
    if (!commandLine.trim()) {
      writePrompt();
      return;
    }

    const abort = new AbortController();
    running = { abort };

    void executor
      .run(commandLine, abort.signal)
      .catch(() => 1)
      .then((code) => {
        running = undefined;
        channel.write(oscExit(code));

        if (executor.exitRequested !== undefined) {
          channel.close(executor.exitRequested);
          return;
        }

        writePrompt();

        const next = queued.shift();

        if (next !== undefined) {
          channel.write(`${next}\r\n`);
          execute(next);
        }
      });
  };

  const handleInput = (chunk: string) => {
    let echo = '';

    for (const char of chunk) {
      if (channel.closed) {
        return;
      }

      // drop escape sequences such as arrow keys (ESC [ ... letter)
      if (skipEscape) {
        if (/[A-Za-z~]/.test(char)) {
          skipEscape = false;
        }

        continue;
      }

      if (char === '\x1b') {
        skipEscape = true;
        continue;
      }

      const isNewline = char === '\r' || char === '\n';

      if (char === '\n' && lastWasCarriageReturn) {
        lastWasCarriageReturn = false;
        continue;
      }

      lastWasCarriageReturn = char === '\r';

      if (char === '\x03') {
        line = '';
        queued.length = 0;

        if (running) {
          channel.write(`${echo}^C\r\n`);
          echo = '';
          running.abort.abort('interrupt' satisfies AbortReason);
        } else {
          channel.write(`${echo}^C\r\n`);
          echo = '';
          writePrompt();
        }

        continue;
      }

      if (isNewline) {
        const commandLine = line;
        line = '';

        if (running) {
          queued.push(commandLine);
        } else {
          channel.write(`${echo}\r\n`);
          echo = '';
          execute(commandLine);
        }

        continue;
      }

      if (char === '\x7f' || char === '\b') {
        if (line) {
          line = line.slice(0, -1);

          if (!running) {
            echo += '\b \b';
          }
        }

        continue;
      }

      if (char >= ' ') {
        line += char;

        if (!running) {
          echo += char;
        }
      }
    }

    channel.write(echo);
  };

  // shell.ts looks only at the first OSC marker of a chunk, so `interactive` goes alone and first
  channel.write(OSC_INTERACTIVE);
  writePrompt();

  return {
    output: channel.output,
    exit: channel.exit,
    input: new WritableStream<string>({
      write(chunk) {
        handleInput(chunk);
      },
    }),
    kill() {
      running?.abort.abort('kill' satisfies AbortReason);
      channel.close(EXIT_KILLED);
    },
    resize() {
      // line output does not depend on the terminal size
    },
  };
}
