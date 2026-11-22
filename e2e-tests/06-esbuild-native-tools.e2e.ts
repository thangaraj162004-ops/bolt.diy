import { expect, test, type Page } from '@playwright/test';

/*
 * The live AI flow in esbuild mode, without an API key: the native project tools
 * (project_write_file, project_run_command, ...) are called through the same
 * client entry point the chat uses for tool calls (callProjectMcpTool), on a
 * starter layout like the Vite + React + Tailwind template.
 *
 * Needs the dev server started with VITE_PREVIEW_ENGINE=esbuild (and network
 * access to esm.sh for React). Skips itself on any other build.
 *
 *   VITE_PREVIEW_ENGINE=esbuild VITE_PREVIEW_DEMO=1 pnpm exec react-router dev --port 5173
 *   pnpm exec playwright test --config=playwright.config.e2e.ts e2e-tests/06-esbuild-native-tools.e2e.ts
 *
 * Set PW_CHROMIUM_PATH if the installed browser does not match @playwright/test.
 */

test.use(
  process.env.PW_CHROMIUM_PATH
    ? // a matching ffmpeg for video capture may be missing next to a custom browser
      { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH }, video: 'off' }
    : {},
);

const SHOTS = process.env.E2E_SCREENSHOT_DIR ?? 'test-results/esbuild-native-tools';

const STARTER: Record<string, string> = {
  'package.json': JSON.stringify(
    {
      name: 'vite-react-typescript-starter',
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: { dev: 'vite', build: 'tsc -b && vite build', lint: 'eslint .', preview: 'vite preview' },
      dependencies: { 'lucide-react': '0.344.0', react: '18.3.1', 'react-dom': '18.3.1' },
      devDependencies: {
        '@vitejs/plugin-react': '4.3.1',
        autoprefixer: '10.4.18',
        postcss: '8.4.35',
        tailwindcss: '3.4.1',
        typescript: '5.5.3',
        vite: '5.4.2',
      },
    },
    null,
    2,
  ),
  'package-lock.json': '{"name":"vite-react-typescript-starter","lockfileVersion":3,"packages":{}}',
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + TS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  'vite.config.ts': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ['lucide-react'] },
});
`,
  'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
`,
  'postcss.config.js': `export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
`,
  'tsconfig.json':
    '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }] }',
  'tsconfig.app.json':
    '{ "compilerOptions": { "target": "ES2020", "jsx": "react-jsx", "strict": true, "moduleResolution": "bundler" }, "include": ["src"] }',
  'tsconfig.node.json':
    '{ "compilerOptions": { "target": "ES2022", "module": "ESNext" }, "include": ["vite.config.ts"] }',
  'eslint.config.js': 'export default [];\n',
  '.gitignore': 'node_modules\ndist\n',
  'src/vite-env.d.ts': '/// <reference types="vite/client" />\n',
  'src/index.css': '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n',
  'src/main.tsx': `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
  'src/App.tsx': `function App() {
  return <div className="min-h-screen bg-gray-100">Start prompting (or editing) to see magic happen :)</div>;
}

export default App;
`,
};

const APP = `import { useEffect, useState } from 'react';
import { Plus, Minus } from 'lucide-react';

export default function App() {
  // generated apps often persist state like this; the sandboxed preview must not crash on it
  const [count, setCount] = useState(() => Number(localStorage.getItem('count') ?? 0));

  useEffect(() => {
    localStorage.setItem('count', String(count));
  }, [count]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
      <h1 id="title" className="text-3xl font-bold text-indigo-600">Native tools counter</h1>
      <p id="count" className="text-5xl">{count}</p>
      <div className="flex gap-2">
        <button id="dec" aria-label="decrement" className="rounded bg-slate-200 p-2" onClick={() => setCount(count - 1)}>
          <Minus size={18} />
        </button>
        <button id="inc" aria-label="increment" className="rounded bg-indigo-600 p-2 text-white" onClick={() => setCount(count + 1)}>
          <Plus size={18} />
        </button>
      </div>
    </main>
  );
}
`;

type ToolResult = { isError?: boolean; content: Array<{ type: string; text: string }> };

/** Calls a native project tool through the app's own client entry point. */
async function tool(page: Page, name: string, args: Record<string, unknown>) {
  const result = await page.evaluate(
    async ({ name, args }) => {
      const { callProjectMcpTool } = await import(/* dev-server module URL */ String('/app/lib/runtime/projectMcp.ts'));
      return (await callProjectMcpTool(name, args)) as ToolResult;
    },
    { name, args },
  );

  const text = result.content.map((part) => part.text).join('');

  let data: Record<string, unknown> = {};

  try {
    data = JSON.parse(text);
  } catch {
    // error results are plain text
  }

  return { isError: Boolean(result.isError), text, data };
}

/** Polls project_get_process_output until the check passes. */
async function waitForProcess(page: Page, processId: string, done: (data: Record<string, unknown>) => boolean) {
  let data: Record<string, unknown> = {};

  await expect
    .poll(
      async () => {
        data = (await tool(page, 'project_get_process_output', { processId })).data;
        return done(data);
      },
      { timeout: 45_000 },
    )
    .toBe(true);

  return data;
}

/** Everything written to the terminal by the tools (xterm only renders the visible rows). */
async function terminalLog(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { __terminalLog?: string }).__terminalLog ?? '');
}

/** The rows xterm currently shows. */
async function visibleTerminalText(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('.xterm-rows')].map((rows) => (rows as HTMLElement).innerText).join('\n'),
  );
}

test.describe('esbuild engine: native project tools', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    // init scripts run in every frame; only the app window may (and can) use localStorage
    await page.addInitScript(() => {
      if (window === window.top) {
        localStorage.setItem('ca_onboarding_completed', 'true');
      }
    });
    await page.goto('/', { waitUntil: 'networkidle' });

    const engine = await page
      .evaluate(
        async () =>
          (await import(/* dev-server module URL */ String('/app/lib/webcontainer/engine.ts'))).PREVIEW_ENGINE,
      )
      .catch(() => 'unknown');
    test.skip(engine !== 'esbuild', 'needs the dev server with VITE_PREVIEW_ENGINE=esbuild');

    await page.evaluate(async () => {
      const db = await import(/* dev-server module URL */ String('/app/lib/persistence/db.ts'));
      const handle = await db.openDatabase();
      await db.setMessages(
        handle!,
        'e2e-native-tools',
        [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Build a counter' }] }] as never,
        'e2e-native-tools',
        'E2E native tools',
      );
    });
    await page.goto('/chat/e2e-native-tools', { waitUntil: 'networkidle' });
    await page.evaluate(async () =>
      (
        await import(/* dev-server module URL */ String('/app/lib/stores/workbench.ts'))
      ).workbenchStore.showWorkbench.set(true),
    );

    // record what the tools write to the terminal
    await page.evaluate(async () => {
      const { workbenchStore } = await import(/* dev-server module URL */ String('/app/lib/stores/workbench.ts'));
      const log = window as unknown as { __terminalLog?: string };
      const write = workbenchStore.writeToCaTerminal.bind(workbenchStore);
      log.__terminalLog = '';

      workbenchStore.writeToCaTerminal = (data: string) => {
        log.__terminalLog += data;
        write(data);
      };
    });

    for (const [path, content] of Object.entries(STARTER)) {
      const written = await tool(page, 'project_write_file', {
        path,
        content,
        overwrite: true,
        replacementReason: 'starter',
      });
      expect(written.isError, `${path}: ${written.text}`).toBe(false);
    }
  });

  test('dev and build print output, build writes dist/index.html, the preview appears', async ({ page }) => {
    // the model's edits
    expect((await tool(page, 'project_read_file', { path: 'src/App.tsx' })).text).toContain('Start prompting');
    expect(
      (
        await tool(page, 'project_write_file', {
          path: 'src/App.tsx',
          content: APP,
          overwrite: true,
          replacementReason: 'counter app',
        })
      ).isError,
    ).toBe(false);

    // patching requires reading the file first, like the model is told to
    expect((await tool(page, 'project_read_file', { path: 'src/index.css' })).text).toContain('@tailwind base;');
    expect(
      (
        await tool(page, 'project_patch_file', {
          path: 'src/index.css',
          oldText: '@tailwind utilities;',
          newText: '@tailwind utilities;\n\nbody { font-family: system-ui, sans-serif; }',
        })
      ).isError,
    ).toBe(false);

    // npm run dev: keeps running, prints the ready line, the preview store gets the port
    const dev = await tool(page, 'project_run_command', { command: 'npm run dev', purpose: 'run' });
    expect(dev.isError, dev.text).toBe(false);

    const devId = String(dev.data.processId);
    const devOutput = await waitForProcess(page, devId, (data) => String(data.output).includes('Preview ready'));
    expect(devOutput.status).toBe('running');
    expect(String(devOutput.output)).toMatch(/built in \d+ms/);
    expect(devOutput.previewReady).toBe(true);

    const previews = await page.evaluate(async () =>
      (await import(/* dev-server module URL */ String('/app/lib/stores/workbench.ts'))).workbenchStore.previews.get(),
    );
    expect(previews).toEqual([
      expect.objectContaining({ port: 5173, ready: true, baseUrl: 'https://esbuild-preview.invalid/5173/' }),
    ]);

    // npm run build (the starter's script is "tsc -b && vite build"): exits 0 and writes dist/index.html
    const build = await tool(page, 'project_run_command', { command: 'npm run build', purpose: 'other' });
    const buildOutput = await waitForProcess(page, String(build.data.processId), (data) => data.status === 'exited');
    expect(buildOutput.exitCode, String(buildOutput.output)).toBe(0);
    expect(String(buildOutput.output)).toContain('dist/index.html');
    expect(String(buildOutput.output)).toMatch(/built in \d+ms/);

    const dist = await tool(page, 'project_read_file', { path: 'dist/index.html' });
    expect(dist.isError).toBe(false);
    expect(dist.text).toContain('Native tools counter');

    // npm run dev again reuses the running server
    const again = await tool(page, 'project_run_command', { command: 'npm run dev', purpose: 'run' });
    expect(again.data).toMatchObject({ processId: devId, reused: true, status: 'running' });

    // the terminal shows the output, not just the command lines
    await page.getByText('Preview', { exact: true }).first().click();

    const terminal = await terminalLog(page);
    expect(terminal).toContain('$ npm run dev');
    expect(terminal).toContain('Preview ready');
    expect(terminal).toContain('$ npm run build');
    expect(terminal).toContain('dist/index.html');
    expect(terminal).toMatch(/built in \d+ms/);
    expect(terminal).toContain('[Command exited with code 0]');
    expect(await visibleTerminalText(page)).toMatch(/built in \d+ms/);

    // the preview renders the app and responds to clicks
    const frame = page.frameLocator('iframe[title="preview"]');
    await expect(frame.locator('#title')).toHaveText('Native tools counter', { timeout: 30_000 });
    await frame.locator('#inc').click();
    await frame.locator('#inc').click();
    await expect(frame.locator('#count')).toHaveText('2');

    // no false "Preview Error" alert (for example from storage access in the sandbox)
    const alert = await page.evaluate(
      async () =>
        (
          await import(/* dev-server module URL */ String('/app/lib/stores/workbench.ts'))
        ).workbenchStore.actionAlert.get() ?? null,
    );
    expect(alert).toBeNull();
    await page.screenshot({ path: `${SHOTS}/native-tools-preview.png` });
  });

  test('a build error shows the file and line, and the command fails', async ({ page }) => {
    await tool(page, 'project_write_file', {
      path: 'src/App.tsx',
      content:
        "import Missing from './components/Missing';\n\nexport default function App() {\n  return <Missing />;\n}\n",
      overwrite: true,
      replacementReason: 'broken import',
    });

    const build = await tool(page, 'project_run_command', { command: 'npm run build', purpose: 'other' });
    const output = await waitForProcess(page, String(build.data.processId), (data) => data.status === 'exited');

    expect(output.exitCode).toBe(1);
    expect(String(output.output)).toContain('Build failed');
    expect(String(output.output)).toContain('src/App.tsx:1:');
    expect(String(output.output)).toContain('Could not resolve "./components/Missing"');
    expect(await terminalLog(page)).toContain('src/App.tsx:1:');
    expect(await terminalLog(page)).toContain('[Command exited with code 1]');
  });
});
