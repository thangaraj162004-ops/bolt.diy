/**
 * Compiles a project held in memory into one ES module (plus CSS) for the
 * browser preview, using esbuild-wasm. Pure code: no DOM, no UI wiring.
 *
 * - Project files come from a `ProjectFiles` (see project-files.ts).
 * - Bare imports become esm.sh URLs (see bare-imports.ts) and stay external.
 * - The esbuild .wasm binary is served from our own origin via Vite's `?url`.
 */
import * as esbuild from 'esbuild-wasm';
import esbuildWasmUrl from 'esbuild-wasm/esbuild.wasm?url';
import { isBareImport, isNodeBuiltin, toEsmShUrl, type PackageJson } from './bare-imports';
import type { ProjectFiles } from './project-files';

export type { ProjectFiles } from './project-files';
export { projectFilesFromFileSystem, projectFilesFromRecord } from './project-files';

export const MAX_ASSET_BYTES = 200 * 1024;
export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;

const ENTRY_CANDIDATES = [
  'src/main.tsx',
  'src/main.jsx',
  'src/main.ts',
  'src/main.js',
  'src/index.tsx',
  'src/index.jsx',
  'src/index.ts',
  'src/index.js',
];

const RESOLVE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.json'];

const LOADERS: Record<string, esbuild.Loader> = {
  '.tsx': 'tsx',
  '.ts': 'ts',
  '.mts': 'ts',
  '.cts': 'ts',
  '.jsx': 'jsx',

  // JSX in .js files is common in older React projects; the jsx loader also handles plain JS
  '.js': 'jsx',
  '.mjs': 'js',
  '.cjs': 'js',
  '.json': 'json',
  '.css': 'css',
  '.txt': 'text',
};

const ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2']);

const NAMESPACE = 'project';
const EMPTY_NAMESPACE = 'empty';

/* ------------------------------------------------------------------ types */

export interface BuildInput {
  files: ProjectFiles;

  /** Values for `import.meta.env.*`. Only keys starting with `VITE_` are exposed. */
  env?: Record<string, string>;
}

export interface BuildMessage {
  /** Project-relative path, e.g. `src/App.tsx`. */
  file?: string;
  line?: number;
  column?: number;
  text: string;

  /** The source line the message points at, when known. */
  lineText?: string;
}

export interface BuildResult {
  /** The bundled ES module, with an inline source map. */
  js: string;

  /** All CSS in import order (empty string when there is none). */
  css: string;

  /** The entry file that was used, e.g. `src/main.tsx`. */
  entry: string;
  usesTailwind: boolean;
  warnings: BuildMessage[];
}

export class BuildError extends Error {
  readonly messages: BuildMessage[];

  constructor(messages: BuildMessage[]) {
    super(messages.map(formatBuildMessage).join('\n'));
    this.name = 'BuildError';
    this.messages = messages;
  }
}

/** `src/App.tsx:3:7: Could not resolve "./Missing"` */
export function formatBuildMessage(message: BuildMessage): string {
  if (!message.file) {
    return message.text;
  }

  const position = message.line ? `:${message.line}${message.column !== undefined ? `:${message.column}` : ''}` : '';

  return `${message.file}${position}: ${message.text}`;
}

/* ------------------------------------------------------------------- init */

let initPromise: Promise<void> | undefined;

/**
 * Starts esbuild-wasm once; later calls reuse the same promise. In the browser
 * the .wasm file is loaded from our own origin and run in a worker. Under
 * Node (tests) esbuild-wasm runs the binary itself and takes no URL.
 */
export function initCompiler(): Promise<void> {
  if (!initPromise) {
    const options: esbuild.InitializeOptions =
      typeof document === 'undefined' ? {} : { wasmURL: esbuildWasmUrl, worker: true };

    initPromise = esbuild.initialize(options).catch((error: unknown) => {
      // allow a retry after a failed start (for example a network error loading the .wasm)
      initPromise = undefined;
      throw error;
    });
  }

  return initPromise;
}

/* ------------------------------------------------------------------ build */

export async function buildProject(input: BuildInput): Promise<BuildResult> {
  await initCompiler();

  const { files } = input;
  const decoder = new TextDecoder();
  const readText = async (path: string) => decoder.decode(await files.readFile(path));

  const packageJson = await readJson<PackageJson & Record<string, unknown>>(files, 'package.json');
  const tsconfigPaths = await readTsconfigPaths(files);
  const entry = await findEntry(files, readText);

  const warnings: BuildMessage[] = [];

  let usesTailwind = Boolean(packageJson?.dependencies?.tailwindcss || packageJson?.devDependencies?.tailwindcss);

  const existsCache = new Map<string, Promise<boolean>>();

  const exists = (path: string) => {
    let cached = existsCache.get(path);

    if (!cached) {
      cached = files.exists(path);
      existsCache.set(path, cached);
    }

    return cached;
  };

  /** Finds `path`, `path.tsx`, ..., `path/index.tsx`, ... */
  const resolveFile = async (path: string): Promise<string | undefined> => {
    const candidates = [
      path,
      ...RESOLVE_EXTENSIONS.map((ext) => path + ext),
      ...RESOLVE_EXTENSIONS.map((ext) => `${path}/index${ext}`),
    ];

    for (const candidate of candidates) {
      if (candidate && (await exists(candidate))) {
        return candidate;
      }
    }

    return undefined;
  };

  const plugin: esbuild.Plugin = {
    name: 'bolt-preview-project',
    setup(build) {
      build.onResolve({ filter: /.*/ }, async (args) => {
        const specifier = args.path;
        const isCss = args.kind === 'import-rule' || args.kind === 'url-token' || args.kind === 'composes-from';

        if (args.kind === 'entry-point') {
          return { path: `/${entry}`, namespace: NAMESPACE };
        }

        if (/^https?:\/\//i.test(specifier) || specifier.startsWith('//') || /^data:/i.test(specifier)) {
          return { path: specifier, external: true };
        }

        // Tailwind v4 style `@import "tailwindcss"`: the Tailwind browser script handles it
        if (args.kind === 'import-rule' && /^tailwindcss(\/.*)?$/.test(specifier)) {
          usesTailwind = true;
          return { path: specifier, namespace: EMPTY_NAMESPACE };
        }

        const importerDir = args.importer ? dirname(args.importer.replace(/^\//, '')) : '';

        // relative and root-absolute imports
        if (!isBareImport(specifier)) {
          const target = specifier.startsWith('/')
            ? normalize(specifier)
            : normalize(importerDir ? `${importerDir}/${specifier}` : specifier);

          let resolved = await resolveFile(target);

          // Vite serves `/logo.svg` from public/
          if (!resolved && specifier.startsWith('/')) {
            resolved = await resolveFile(`public/${target}`);
          }

          if (resolved) {
            return { path: `/${resolved}`, namespace: NAMESPACE };
          }

          // absolute URLs in CSS (`url(/fonts/x.woff)`) are left for the browser
          if (isCss && specifier.startsWith('/')) {
            return { path: specifier, external: true };
          }

          return { errors: [{ text: `Could not resolve "${specifier}": no such file in the project` }] };
        }

        // in CSS, `url(img.png)` and `@import "theme.css"` are relative first
        if (isCss) {
          const resolved = await resolveFile(normalize(importerDir ? `${importerDir}/${specifier}` : specifier));

          if (resolved) {
            return { path: `/${resolved}`, namespace: NAMESPACE };
          }
        }

        // tsconfig "paths" aliases, e.g. "@/*" → "src/*"
        for (const alias of tsconfigPaths) {
          const match = alias.match(specifier);

          if (match === undefined) {
            continue;
          }

          for (const target of alias.targets) {
            const resolved = await resolveFile(normalize(target.replace('*', match)));

            if (resolved) {
              return { path: `/${resolved}`, namespace: NAMESPACE };
            }
          }

          return {
            errors: [{ text: `Could not resolve "${specifier}" through the tsconfig.json alias "${alias.pattern}"` }],
          };
        }

        if (isNodeBuiltin(specifier, packageJson)) {
          return {
            errors: [
              {
                text: `"${specifier}" is a Node.js built-in module and is not available in the browser preview`,
              },
            ],
          };
        }

        return { path: toEsmShUrl(specifier, packageJson, { css: isCss }), external: true };
      });

      build.onLoad({ filter: /.*/, namespace: EMPTY_NAMESPACE }, () => ({ contents: '', loader: 'css' }));

      build.onLoad({ filter: /.*/, namespace: NAMESPACE }, async (args) => {
        const path = args.path.replace(/^\//, '');
        const ext = extname(path);
        const bytes = await files.readFile(path);

        if (ASSET_EXTENSIONS.has(ext)) {
          if (bytes.byteLength > MAX_ASSET_BYTES) {
            return {
              errors: [
                {
                  text: `"${path}" is ${formatKb(bytes.byteLength)}; files embedded in the preview are limited to ${formatKb(MAX_ASSET_BYTES)}`,
                },
              ],
            };
          }

          return { contents: bytes, loader: 'dataurl' };
        }

        if (path.endsWith('.module.css')) {
          warnings.push({
            file: path,
            text: 'CSS modules are not supported in the preview yet: the styles are applied globally and imported class names are undefined',
          });

          return { contents: bytes, loader: 'css' };
        }

        const loader = LOADERS[ext];

        if (!loader) {
          return { errors: [{ text: `"${path}": files of type "${ext || path}" are not supported in the preview` }] };
        }

        if (loader === 'css') {
          const text = decoder.decode(bytes);

          if (/@tailwind\b|@import\s+(?:url\()?\s*["']tailwindcss/.test(text)) {
            usesTailwind = true;
          }

          return { contents: text, loader };
        }

        return { contents: bytes, loader };
      });
    },
  };

  let result: esbuild.BuildResult<{ write: false }>;

  try {
    result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'esm',
      target: 'es2020',
      sourcemap: 'inline',
      jsx: 'automatic',
      outdir: '/out',
      charset: 'utf8',
      logLevel: 'silent',
      define: buildDefines(input.env),
      plugins: [plugin],
    });
  } catch (error) {
    const failure = error as Partial<esbuild.BuildFailure>;

    if (Array.isArray(failure.errors) && failure.errors.length > 0) {
      throw new BuildError(failure.errors.map(toBuildMessage));
    }

    throw error;
  }

  const js = result.outputFiles.find((file) => file.path.endsWith('.js'))?.text ?? '';
  const css = result.outputFiles.find((file) => file.path.endsWith('.css'))?.text ?? '';
  const size = new TextEncoder().encode(js).byteLength + new TextEncoder().encode(css).byteLength;

  if (size > MAX_BUNDLE_BYTES) {
    throw new BuildError([
      {
        text: `The preview bundle is ${formatKb(size)}, which is over the ${formatKb(MAX_BUNDLE_BYTES)} limit. Remove large files or imports.`,
      },
    ]);
  }

  return { js, css, entry, usesTailwind, warnings: [...warnings, ...result.warnings.map(toBuildMessage)] };
}

/* ---------------------------------------------------------------- helpers */

async function findEntry(files: ProjectFiles, readText: (path: string) => Promise<string>): Promise<string> {
  for (const candidate of ENTRY_CANDIDATES) {
    if (await files.exists(candidate)) {
      return candidate;
    }
  }

  if (await files.exists('index.html')) {
    const html = await readText('index.html');
    const src = findModuleScriptSrc(html);

    if (src) {
      const path = normalize(src.replace(/^\.?\//, ''));

      if (await files.exists(path)) {
        return path;
      }

      throw new BuildError([{ file: 'index.html', text: `The script "${src}" in index.html does not exist` }]);
    }
  }

  throw new BuildError([
    {
      text: `No entry file found. Add src/main.tsx (or main.jsx/.ts/.js, src/index.*) or a <script type="module" src="..."> in index.html.`,
    },
  ]);
}

/** The `src` of the first local `<script type="module" src="...">` in an HTML document. */
export function findModuleScriptSrc(html: string): string | undefined {
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attributes = match[1];

    if (!/\btype\s*=\s*["']?module\b/i.test(attributes)) {
      continue;
    }

    const src = attributes.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const value = src?.[1] ?? src?.[2] ?? src?.[3];

    if (value && !/^(https?:)?\/\//i.test(value)) {
      return value;
    }
  }

  return undefined;
}

function buildDefines(env: Record<string, string> = {}): Record<string, string> {
  const values: Record<string, string | boolean> = {
    BASE_URL: '/',
    MODE: 'development',
    DEV: true,
    PROD: false,
  };

  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('VITE_')) {
      values[key] = value;
    }
  }

  const defines: Record<string, string> = { 'import.meta.env': JSON.stringify(values) };

  for (const [key, value] of Object.entries(values)) {
    defines[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return defines;
}

interface PathAlias {
  pattern: string;
  targets: string[];

  /** Returns the text matched by `*` ('' for exact aliases), or undefined when there is no match. */
  match(specifier: string): string | undefined;
}

async function readTsconfigPaths(files: ProjectFiles): Promise<PathAlias[]> {
  for (const name of ['tsconfig.json', 'tsconfig.app.json', 'jsconfig.json']) {
    const config = await readJson<{ compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } }>(
      files,
      name,
    );

    const paths = config?.compilerOptions?.paths;

    if (!paths) {
      continue;
    }

    const baseUrl = normalize(config?.compilerOptions?.baseUrl ?? '.');

    return Object.entries(paths).map(([pattern, targets]) => {
      const star = pattern.indexOf('*');
      const prefix = star === -1 ? pattern : pattern.slice(0, star);
      const suffix = star === -1 ? '' : pattern.slice(star + 1);

      return {
        pattern,
        targets: targets.map((target) => (baseUrl ? `${baseUrl}/${target}` : target)),
        match(specifier) {
          if (star === -1) {
            return specifier === pattern ? '' : undefined;
          }

          if (
            specifier.length >= prefix.length + suffix.length &&
            specifier.startsWith(prefix) &&
            specifier.endsWith(suffix)
          ) {
            return specifier.slice(prefix.length, specifier.length - suffix.length);
          }

          return undefined;
        },
      };
    });
  }

  return [];
}

/** Reads a JSON file that may contain comments and trailing commas (tsconfig style). */
async function readJson<T>(files: ProjectFiles, path: string): Promise<T | undefined> {
  if (!(await files.exists(path))) {
    return undefined;
  }

  const text = new TextDecoder().decode(await files.readFile(path));

  try {
    return JSON.parse(stripJsonComments(text)) as T;
  } catch (error) {
    throw new BuildError([{ file: path, text: `Invalid JSON: ${(error as Error).message}` }]);
  }
}

export function stripJsonComments(text: string): string {
  let output = '';
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      output += char;

      if (char === '\\') {
        output += text[++i] ?? '';
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
      output += char;
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') {
        i++;
      }
      output += '\n';
    } else if (char === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2);
      i = i === -1 ? text.length : i + 1;
    } else {
      output += char;
    }
  }

  return output.replace(/,(\s*[}\]])/g, '$1');
}

function toBuildMessage(message: esbuild.Message): BuildMessage {
  const location = message.location;

  return {
    file: location?.file ? location.file.replace(new RegExp(`^${NAMESPACE}:`), '').replace(/^\//, '') : undefined,
    line: location?.line,
    column: location?.column,
    lineText: location?.lineText,
    text: message.text,
  };
}

/** POSIX normalize for project-relative paths: no leading slash, no `.`/`..` segments. */
function normalize(path: string): string {
  const parts: string[] = [];

  for (const part of path.split('/')) {
    if (part === '' || part === '.') {
      continue;
    }

    if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join('/');
}

function dirname(path: string) {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

function extname(path: string) {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');

  return dot <= 0 ? '' : name.slice(dot).toLowerCase();
}

function formatKb(bytes: number) {
  return `${Math.round(bytes / 1024)} KB`;
}
