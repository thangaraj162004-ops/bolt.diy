import { describe, expect, it } from 'vitest';
import { toEsmShUrl } from './bare-imports';
import {
  BuildError,
  MAX_ASSET_BYTES,
  buildProject,
  findModuleScriptSrc,
  projectFilesFromFileSystem,
  projectFilesFromRecord,
  stripJsonComments,
} from './compiler';
import { MemoryFileSystem } from '~/lib/webcontainer/shim/memory-fs';

/*
 * Runs the real esbuild-wasm under Node. No network: every bare import is
 * turned into an https://esm.sh URL and kept external, never fetched.
 */

const APP = `
import { useState } from 'react';
export default function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>count is {count}</button>;
}
`;

const MAIN = `
import { createRoot } from 'react-dom/client';
import App from './App';
createRoot(document.getElementById('root')!).render(<App />);
`;

function build(files: Record<string, string | Uint8Array>, env?: Record<string, string>) {
  return buildProject({ files: projectFilesFromRecord(files), env });
}

async function buildError(files: Record<string, string | Uint8Array>): Promise<BuildError> {
  try {
    await build(files);
  } catch (error) {
    expect(error).toBeInstanceOf(BuildError);
    return error as BuildError;
  }

  throw new Error('expected the build to fail');
}

/** The bundle without its inline source map, so source text in the map does not count. */
function code(js: string) {
  return js.replace(/\/\/# sourceMappingURL=.*$/m, '');
}

describe('buildProject', () => {
  it('compiles a simple React app into one ES module with React from esm.sh', async () => {
    const result = await build({ 'src/main.tsx': MAIN, 'src/App.tsx': APP });

    expect(result.entry).toBe('src/main.tsx');
    expect(code(result.js)).toContain('from "https://esm.sh/react-dom@18.3.1/client"');
    expect(code(result.js)).toContain('from "https://esm.sh/react@18.3.1"');
    expect(code(result.js)).toContain('from "https://esm.sh/react@18.3.1/jsx-runtime"');
    expect(code(result.js)).toContain('count is ');
    expect(result.js).toContain('//# sourceMappingURL=data:application/json;base64,');
    expect(result.css).toBe('');
    expect(result.usesTailwind).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it('uses the src/index.* entry, then the module script in index.html', async () => {
    expect((await build({ 'src/index.jsx': 'console.log(1)' })).entry).toBe('src/index.jsx');

    const fromHtml = await build({
      'index.html':
        '<html><body><div id="root"></div><script type="module" src="/app/start.ts"></script></body></html>',
      'app/start.ts': 'console.log("start")',
    });
    expect(fromHtml.entry).toBe('app/start.ts');
  });

  it('fails clearly when there is no entry file', async () => {
    const error = await buildError({ 'README.md': '# hi' });
    expect(error.message).toContain('No entry file found');
  });

  it('maps bare imports with a subpath and adds ?deps for React', async () => {
    const result = await build({
      'src/main.ts': `import debounce from 'lodash/debounce'; import { z } from '@scope/pkg/sub/path'; console.log(debounce, z);`,
      'package.json': JSON.stringify({ dependencies: { lodash: '^4.17.21' } }),
    });

    expect(code(result.js)).toContain('"https://esm.sh/lodash@4.17.21/debounce?deps=react@18.3.1,react-dom@18.3.1"');
    expect(code(result.js)).toContain('"https://esm.sh/@scope/pkg/sub/path?deps=react@18.3.1,react-dom@18.3.1"');
  });

  it('takes versions from package.json dependencies and devDependencies', async () => {
    const result = await build({
      'src/main.tsx': `import { createRoot } from 'react-dom/client'; import { motion } from 'framer-motion'; console.log(createRoot, motion);`,
      'package.json': JSON.stringify({
        dependencies: { react: '^18.2.0', 'react-dom': '~18.2.0' },
        devDependencies: { 'framer-motion': '11.0.3' },
      }),
    });

    expect(code(result.js)).toContain('"https://esm.sh/react-dom@18.2.0/client"');
    expect(code(result.js)).toContain('"https://esm.sh/framer-motion@11.0.3?deps=react@18.2.0,react-dom@18.2.0"');
  });

  it('defaults React to 18.3.1 and other packages to latest (no version in the URL)', () => {
    expect(toEsmShUrl('react')).toBe('https://esm.sh/react@18.3.1');
    expect(toEsmShUrl('react-dom/client')).toBe('https://esm.sh/react-dom@18.3.1/client');
    expect(toEsmShUrl('clsx')).toBe('https://esm.sh/clsx?deps=react@18.3.1,react-dom@18.3.1');
    expect(toEsmShUrl('clsx', { dependencies: { clsx: '*' } })).toBe(
      'https://esm.sh/clsx?deps=react@18.3.1,react-dom@18.3.1',
    );
  });

  it('leaves https:// imports external and untouched', async () => {
    const result = await build({ 'src/main.ts': `import x from 'https://cdn.example.com/x.js'; console.log(x);` });
    expect(code(result.js)).toContain('from "https://cdn.example.com/x.js"');
  });

  it('resolves tsconfig.json path aliases (with comments in the file)', async () => {
    const result = await build({
      'tsconfig.json': `{
        // Vite template style
        "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"], }, },
      }`,
      'src/main.tsx': `import { Button } from '@/components/Button'; console.log(Button);`,
      'src/components/Button/index.tsx': `export const Button = () => <button>alias works</button>;`,
    });

    expect(code(result.js)).toContain('alias works');
  });

  it('resolves extensions and index files for relative imports', async () => {
    const result = await build({
      'src/main.ts': `import a from './a'; import b from './lib'; import c from '../shared/c.js'; console.log(a, b, c);`,
      'src/a.jsx': 'export default "from-a";',
      'src/lib/index.ts': 'export default "from-lib-index";',
      'shared/c.js': 'export default "from-c";',
    });

    expect(code(result.js)).toContain('from-a');
    expect(code(result.js)).toContain('from-lib-index');
    expect(code(result.js)).toContain('from-c');
  });

  it('collects CSS in import order, including @import and relative url()', async () => {
    const result = await build({
      'src/main.ts': `import './first.css'; import './App'; import './last.css';`,
      'src/App.ts': `import './app.css'; console.log('app');`,
      'src/first.css': `@import "./theme.css"; .first { color: red; }`,
      'src/theme.css': `.theme { color: green; }`,
      'src/app.css': `.app { background: url(./dot.png); }`,
      'src/dot.png': new Uint8Array([137, 80, 78, 71]),
      'src/last.css': `.last { color: blue; }`,
    });

    const order = ['.theme', '.first', '.app', '.last'].map((selector) => result.css.indexOf(selector));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(result.css).toContain('url(data:image/png;base64,');
  });

  it('warns that CSS modules are not supported yet', async () => {
    const result = await build({
      'src/main.ts': `import styles from './Card.module.css'; console.log(styles);`,
      'src/Card.module.css': `.card { padding: 1rem; }`,
    });

    expect(result.css).toContain('.card');
    expect(result.warnings).toEqual([
      expect.objectContaining({ file: 'src/Card.module.css', text: expect.stringContaining('CSS modules') }),
    ]);
  });

  it('imports JSON files', async () => {
    const result = await build({
      'src/main.ts': `import data from './data.json'; console.log(data.greeting);`,
      'src/data.json': JSON.stringify({ greeting: 'hello from json' }),
    });

    expect(code(result.js)).toContain('hello from json');
  });

  it('inlines images as data URLs and refuses files over the limit', async () => {
    const result = await build({
      'src/main.ts': `import logo from './logo.svg'; console.log(logo);`,
      'src/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    });
    expect(code(result.js)).toContain('data:image/svg+xml');

    const error = await buildError({
      'src/main.ts': `import big from './big.png'; console.log(big);`,
      'src/big.png': new Uint8Array(MAX_ASSET_BYTES + 1),
    });
    expect(error.message).toContain('src/big.png');
    expect(error.message).toContain('limited to 200 KB');
  });

  it('serves root-absolute imports from public/ like Vite', async () => {
    const result = await build({
      'src/main.ts': `import icon from '/vite.svg'; console.log(icon);`,
      'public/vite.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });

    expect(code(result.js)).toContain('data:image/svg+xml');
  });

  it('explains that Node built-ins are not available', async () => {
    const error = await buildError({
      'src/main.ts': `import fs from 'fs';\nimport { join } from 'node:path';\nconsole.log(fs, join);`,
    });

    expect(error.messages).toHaveLength(2);
    expect(error.message).toContain('"fs" is a Node.js built-in module and is not available in the browser preview');
    expect(error.message).toContain('"node:path" is a Node.js built-in module');
  });

  it('allows a built-in name when package.json installs it as a package', async () => {
    const result = await build({
      'src/main.ts': `import { Buffer } from 'buffer'; console.log(Buffer);`,
      'package.json': JSON.stringify({ dependencies: { buffer: '6.0.3' } }),
    });

    expect(code(result.js)).toContain('"https://esm.sh/buffer@6.0.3?deps=');
  });

  it('reports a missing file with the importing file, line and column', async () => {
    const error = await buildError({
      'src/main.tsx': `import App from './App';\nimport Missing from './components/Missing';\nconsole.log(App, Missing);`,
      'src/App.tsx': APP,
    });

    expect(error.messages).toEqual([
      expect.objectContaining({
        file: 'src/main.tsx',
        line: 2,
        column: 20,
        text: 'Could not resolve "./components/Missing": no such file in the project',
      }),
    ]);
    expect(error.message).toBe(
      'src/main.tsx:2:20: Could not resolve "./components/Missing": no such file in the project',
    );
  });

  it('reports syntax errors with file and line', async () => {
    const error = await buildError({ 'src/main.ts': 'const a = 1;\nconst = 2;' });

    expect(error.messages[0]).toMatchObject({ file: 'src/main.ts', line: 2 });
  });

  it('defines import.meta.env with VITE_* values and the Vite defaults', async () => {
    const result = await build(
      {
        'src/main.ts': `console.log(import.meta.env.VITE_API_URL, import.meta.env.MODE, import.meta.env.DEV, import.meta.env.PROD, import.meta.env.BASE_URL, import.meta.env.SECRET_KEY, import.meta.env);`,
      },
      { VITE_API_URL: 'https://api.example.com', SECRET_KEY: 'must-not-leak' },
    );

    const js = code(result.js);
    expect(js).toContain('"https://api.example.com", "development", true, false, "/"');
    expect(js).not.toContain('must-not-leak');
    expect(js).toContain('VITE_API_URL: "https://api.example.com"');
  });

  describe('Tailwind detection', () => {
    it('is true when package.json lists tailwindcss', async () => {
      const result = await build({
        'src/main.ts': 'console.log(1)',
        'package.json': JSON.stringify({ devDependencies: { tailwindcss: '^3.4.0' } }),
      });
      expect(result.usesTailwind).toBe(true);
    });

    it('is true for @tailwind directives', async () => {
      const result = await build({
        'src/main.ts': `import './index.css';`,
        'src/index.css': '@tailwind base;\n@tailwind components;\n@tailwind utilities;',
      });
      expect(result.usesTailwind).toBe(true);
    });

    it('is true for @import "tailwindcss", which is dropped from the CSS', async () => {
      const result = await build({
        'src/main.ts': `import './index.css';`,
        'src/index.css': '@import "tailwindcss";\n.x { color: red; }',
      });
      expect(result.usesTailwind).toBe(true);
      expect(result.css).not.toContain('esm.sh');
      expect(result.css).toContain('.x');
    });

    it('is false otherwise', async () => {
      const result = await build({
        'src/main.ts': `import './index.css';`,
        'src/index.css': '.tailwind { color: red; }',
      });
      expect(result.usesTailwind).toBe(false);
    });
  });

  it('builds from the shim in-memory file system through the adapter', async () => {
    const fs = new MemoryFileSystem('/home/project');
    await fs.mkdir('src', { recursive: true });
    await fs.mkdir('node_modules/react', { recursive: true });
    await fs.writeFile('node_modules/react/index.js', 'ignored');
    await fs.writeFile('src/main.tsx', MAIN);
    await fs.writeFile('src/App.tsx', APP);

    const files = projectFilesFromFileSystem(fs);
    expect(await files.listFiles()).toEqual(['src/App.tsx', 'src/main.tsx']);
    expect(await files.exists('src')).toBe(false);
    expect(await files.exists('src/App.tsx')).toBe(true);

    const result = await buildProject({ files });
    expect(code(result.js)).toContain('count is ');
  });
});

describe('helpers', () => {
  it('finds the module script in index.html', () => {
    expect(findModuleScriptSrc('<script type="module" src="/src/main.tsx"></script>')).toBe('/src/main.tsx');
    expect(findModuleScriptSrc(`<script src='x.js'></script><script type=module src='./a.js'></script>`)).toBe(
      './a.js',
    );
    expect(findModuleScriptSrc('<script type="module" src="https://cdn/x.js"></script>')).toBeUndefined();
  });

  it('strips comments and trailing commas from JSON without touching strings', () => {
    const text = `{ "a": "http://x//y", /* c */ "b": [1, 2,], // end\n }`;
    expect(JSON.parse(stripJsonComments(text))).toEqual({ a: 'http://x//y', b: [1, 2] });
  });
});
