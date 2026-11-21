import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME, chatPlaceholder, pageTitle } from './brand';

const OLD_BRAND = /\bBolt\b|bolt\.diy|bolt\.new|StackBlitz/i;
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
  it('is CodeWriterAI', () => {
    expect(PRODUCT_NAME).toBe('CodeWriterAI');
    expect(pageTitle()).toBe('CodeWriterAI');
    expect(pageTitle('Open source notices')).toBe('Open source notices | CodeWriterAI');
  });

  it('the chat placeholder names CodeWriterAI', () => {
    expect(chatPlaceholder('build')).toBe('How can CodeWriterAI help you today?');
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
});
