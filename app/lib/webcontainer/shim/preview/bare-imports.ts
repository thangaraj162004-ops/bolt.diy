/**
 * Maps bare imports (`react`, `lodash/debounce`, `@scope/pkg/sub`) to esm.sh
 * URLs and recognises Node built-in modules.
 *
 * URL shape, from the esm.sh README: `https://esm.sh/PKG[@SEMVER][/PATH]`,
 * with `?deps=react@x,react-dom@y` to pin the React copy that a package
 * imports. Leaving the version out means "latest" (the README does not
 * document an `@latest` tag, so we do not write one).
 */

export const ESM_SH_ORIGIN = 'https://esm.sh';
export const DEFAULT_REACT_VERSION = '18.3.1';

const NODE_BUILTINS = new Set([
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
]);

export interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** Splits `@scope/name/sub/path` into `{ name: '@scope/name', subpath: 'sub/path' }`. */
export function parseBareImport(specifier: string): { name: string; subpath: string } {
  const parts = specifier.split('/');
  const nameLength = specifier.startsWith('@') ? 2 : 1;

  return { name: parts.slice(0, nameLength).join('/'), subpath: parts.slice(nameLength).join('/') };
}

/** True for bare specifiers (not relative, absolute, or a URL). */
export function isBareImport(specifier: string) {
  return !/^(\.{1,2}\/|\.{1,2}$|\/|[a-z][a-z0-9+.-]*:)/i.test(specifier) || specifier.startsWith('node:');
}

/**
 * True for `fs`, `node:fs`, `fs/promises`, ... A package the project lists in
 * package.json (for example the `buffer` polyfill) is not treated as built-in.
 */
export function isNodeBuiltin(specifier: string, packageJson?: PackageJson) {
  if (specifier.startsWith('node:')) {
    return true;
  }

  const { name } = parseBareImport(specifier);

  return NODE_BUILTINS.has(name) && !findDeclaredVersion(name, packageJson);
}

function findDeclaredVersion(name: string, packageJson?: PackageJson) {
  return packageJson?.dependencies?.[name] ?? packageJson?.devDependencies?.[name];
}

/**
 * The version to put in the URL: package.json range without `^`/`~`,
 * React's default, or `undefined` for "latest".
 */
export function resolvePackageVersion(name: string, packageJson?: PackageJson): string | undefined {
  const declared = findDeclaredVersion(name, packageJson)
    ?.trim()
    .replace(/^[\^~]/, '');

  // keep plain versions and dist-tags; ranges such as "*", ">=1", "workspace:*" or "file:..." fall back
  if (declared && /^[0-9A-Za-z][0-9A-Za-z.+-]*$/.test(declared) && declared !== 'latest') {
    return declared;
  }

  if (name === 'react' || name === 'react-dom') {
    return DEFAULT_REACT_VERSION;
  }

  return undefined;
}

/** `react` → `https://esm.sh/react@18.3.1`, `lodash/debounce` → `https://esm.sh/lodash/debounce?deps=...` */
export function toEsmShUrl(specifier: string, packageJson?: PackageJson, options: { css?: boolean } = {}): string {
  const { name, subpath } = parseBareImport(specifier);
  const version = resolvePackageVersion(name, packageJson);

  let url = `${ESM_SH_ORIGIN}/${name}${version ? `@${version}` : ''}${subpath ? `/${subpath}` : ''}`;

  // CSS files (from `@import` or `url()`) are plain files, so they get no `?deps`
  if (!options.css && name !== 'react' && name !== 'react-dom') {
    const react = resolvePackageVersion('react', packageJson);
    const reactDom = resolvePackageVersion('react-dom', packageJson);
    url += `?deps=react@${react},react-dom@${reactDom}`;
  }

  return url;
}
