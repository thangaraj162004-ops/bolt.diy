import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME, chatPlaceholder, pageTitle } from './brand';

const OLD_BRAND = /\bCa\b|bolt\.diy|bolt\.new|StackBlitz/i;
const APP_DIR = fileURLToPath(new URL('..', import.meta.url));

/** The open source notices are the one place that must name the original project. */
const ALLOWED_FILES = new Set(['components/open-source/OpenSourceNotices.tsx', 'routes/open-source.tsx']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

    if (statSync(path).isDirectory()) {
      return ['__fixtures__', '__snapshots__', '.server', 'prompts'].includes(name) ? [] : sourceFiles(path);
    }

    return /\.tsx?$/.test(name) && !/\.(spec|test)\.tsx?$/.test(name) ? [path] : [];
  });
}

/** User-visible text in JSX: text between tags, and text attributes people read. */
function visibleStrings(source: string) {
  const found: string[] = [];
  const withoutComments = source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');

  for (const match of withoutComments.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) {
    found.push(match[1].trim());
  }

  for (const match of withoutComments.matchAll(
    /\b(?:title|placeholder|alt|aria-label|label|description)=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{'([^']*)'\})/g,
  )) {
    found.push(match[1] ?? match[2] ?? match[3] ?? match[4]);
  }

  // route meta titles and descriptions
  for (const match of withoutComments.matchAll(/\b(?:title|content):\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g)) {
    found.push(match[1] ?? match[2] ?? match[3]);
  }

  // toasts
  for (const match of withoutComments.matchAll(/toast\.\w+\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g)) {
    found.push(match[1] ?? match[2] ?? match[3]);
  }

  return found.filter(Boolean);
}

describe('brand', () => {
  it('is CodeApp AI', () => {
    expect(PRODUCT_NAME).toBe('CodeApp AI');
    expect(pageTitle()).toBe('CodeApp AI');
    expect(pageTitle('Open source notices')).toBe('Open source notices | CodeApp AI');
  });

  it('the chat placeholder names CodeApp AI', () => {
    expect(chatPlaceholder('build')).toBe('How can CodeApp AI help you today?');
    expect(chatPlaceholder('discuss')).toBe('What would you like to discuss?');
    expect(chatPlaceholder('build')).not.toMatch(OLD_BRAND);
  });

  it('no component or route shows Bolt, bolt.diy, bolt.new or StackBlitz to users (except the open source notices)', () => {
    const offenders: string[] = [];

    for (const file of [...sourceFiles(join(APP_DIR, 'components')), ...sourceFiles(join(APP_DIR, 'routes'))]) {
      const name = relative(APP_DIR, file);

      if (ALLOWED_FILES.has(name)) {
        continue;
      }

      for (const text of visibleStrings(readFileSync(file, 'utf-8'))) {
        if (OLD_BRAND.test(text)) {
          offenders.push(`${name}: ${text}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('the scan really finds visible text (guards against a scan that matches nothing)', () => {
    expect(visibleStrings('<p>Welcome to Bolt</p><input placeholder="Ask Bolt" />')).toEqual([
      'Welcome to Bolt',
      'Ask Bolt',
    ]);
    expect(visibleStrings("export const meta = () => [{ title: 'Bolt' }];")).toEqual(['Bolt']);
  });

  it('no string anywhere in the app says Bolt, bolt.diy, bolt.new or StackBlitz (server code, prompts and errors too)', () => {
    // the credits (MIT license) and the names of old chat markers that are still read from saved chats
    const allowed = new Set([...ALLOWED_FILES, 'lib/persistence/legacyTags.ts']);
    const offenders: string[] = [];

    const files = allSourceFiles(APP_DIR);

    // really covers the server code and the AI prompts
    expect(files.some((file) => file.includes('/.server/'))).toBe(true);
    expect(files.some((file) => file.includes('/prompts/'))).toBe(true);

    for (const file of files) {
      const name = relative(APP_DIR, file);

      if (allowed.has(name)) {
        continue;
      }

      for (const text of stringLiterals(readFileSync(file, 'utf-8'))) {
        if (isOldName(text)) {
          offenders.push(`${name}: ${text}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('no file the app serves from public/ says Bolt or StackBlitz', () => {
    const publicDir = fileURLToPath(new URL('../../public', import.meta.url));

    const offenders = allFiles(publicDir)
      .filter((file) => /\.(html|svg|json|js|txt|webmanifest|css)$/.test(file))
      .filter((file) => isOldName(readFileSync(file, 'utf-8')))
      .map((file) => relative(publicDir, file));

    expect(offenders).toEqual([]);
  });

  it('the string scan finds old names but not lower-case code names like template repositories', () => {
    expect(stringLiterals(`const a = 'Ask Bolt'; // Bolt in a comment\nconst b = "x"; /* StackBlitz */`)).toEqual([
      'Ask Bolt',
      'x',
    ]);
    expect(isOldName('Built with bolt.diy')).toBe(true);
    expect(isOldName('StackBlitz')).toBe(true);
    expect(isOldName('blueberry-llm/bolt-vite-react-ts-template')).toBe(false);
  });
});

function allFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

    return statSync(path).isDirectory() ? allFiles(path) : [path];
  });
}

/** Every .ts/.tsx file of the app except tests and test fixtures. */
function allSourceFiles(dir: string): string[] {
  return allFiles(dir).filter(
    (path) => /\.tsx?$/.test(path) && !/\.(spec|test)\.tsx?$/.test(path) && !/__fixtures__|__snapshots__/.test(path),
  );
}

/** The contents of every quoted string and template literal, without comments. */
function stringLiterals(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

  return [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map(
    (match) => match[1] ?? match[2] ?? match[3],
  );
}

/** "Bolt" as a word (any case of the product names), not lower-case code like "bolt-vite-template". */
function isOldName(text: string): boolean {
  return /\bBolt\b|\bBOLT\b/.test(text) || /bolt\.(diy|new)|stack\s?blitz/i.test(text);
}
