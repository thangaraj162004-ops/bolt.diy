/**
 * Small projects for the /preview-demo page. Each one is a complete Vite-style
 * React app: index.html, src/main.tsx, src/App.tsx, package.json. React comes
 * from esm.sh at run time; nothing here calls an AI or needs a key.
 */

export interface DemoProject {
  id: string;
  label: string;
  description: string;
  files: Record<string, string>;
}

/** The heading every demo uses, so "Edit heading" can find and change it. */
export const HEADING_PATTERN = /(<h1\b[^>]*>)([^<{]*)(<\/h1>)/;

function project(id: string, label: string, description: string, app: string, extra: Record<string, string> = {}) {
  const usesTailwind = 'src/index.css' in extra;

  return {
    id,
    label,
    description,
    files: {
      'package.json': JSON.stringify(
        {
          name: `demo-${id}`,
          private: true,
          type: 'module',
          scripts: { dev: 'vite', build: 'vite build' },
          dependencies: { react: '18.3.1', 'react-dom': '18.3.1' },
          ...(usesTailwind ? { devDependencies: { tailwindcss: '3.4.17' } } : {}),
        },
        null,
        2,
      ),
      'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${label}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
      'src/main.tsx': `import { createRoot } from 'react-dom/client';
import App from './App';
${usesTailwind ? "import './index.css';\n" : ''}
createRoot(document.getElementById('root')!).render(<App />);
`,
      'src/App.tsx': app,
      ...extra,
    },
  } satisfies DemoProject;
}

const BASE_STYLE = `{ fontFamily: 'system-ui, sans-serif', padding: 20, lineHeight: 1.4 }`;

export const DEMO_PROJECTS: DemoProject[] = [
  project(
    'counter',
    'Counter',
    'A button that counts.',
    `import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <main style={${BASE_STYLE}}>
      <h1>Counter</h1>
      <p id="count">Count is {count}</p>
      <button id="inc" style={{ fontSize: 18, padding: '8px 16px' }} onClick={() => setCount(count + 1)}>
        Add one
      </button>
    </main>
  );
}
`,
  ),
  project(
    'todo',
    'Todo list',
    'Add and tick off items (React state).',
    `import { useState } from 'react';

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([
    { id: 1, text: 'Try the esbuild preview', done: true },
    { id: 2, text: 'Add a todo', done: false },
  ]);
  const [text, setText] = useState('');

  const add = () => {
    if (!text.trim()) return;
    setTodos([...todos, { id: Date.now(), text: text.trim(), done: false }]);
    setText('');
  };

  return (
    <main style={${BASE_STYLE}}>
      <h1>Todo list</h1>
      <form onSubmit={(event) => { event.preventDefault(); add(); }} style={{ display: 'flex', gap: 8 }}>
        <input id="new-todo" value={text} onChange={(event) => setText(event.target.value)} placeholder="New todo" style={{ flex: 1, fontSize: 16, padding: 8 }} />
        <button id="add" type="submit" style={{ fontSize: 16 }}>Add</button>
      </form>
      <ul style={{ paddingLeft: 0, listStyle: 'none' }}>
        {todos.map((todo) => (
          <li key={todo.id} style={{ padding: '6px 0' }}>
            <label>
              <input type="checkbox" checked={todo.done} onChange={() => setTodos(todos.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)))} />{' '}
              <span style={{ textDecoration: todo.done ? 'line-through' : 'none' }}>{todo.text}</span>
            </label>
          </li>
        ))}
      </ul>
      <p id="left">{todos.filter((todo) => !todo.done).length} left</p>
    </main>
  );
}
`,
  ),
  project(
    'tailwind',
    'Tailwind',
    'Tailwind classes plus an @tailwind CSS file.',
    `import { useState } from 'react';

export default function App() {
  const [liked, setLiked] = useState(false);

  return (
    <main className="min-h-screen bg-slate-100 p-6 font-sans">
      <div className="mx-auto max-w-sm rounded-2xl bg-white p-6 shadow-lg">
        <h1 className="text-2xl font-bold text-indigo-600">Tailwind card</h1>
        <p className="mt-2 text-slate-600">Styled by the Tailwind browser script.</p>
        <button
          id="like"
          className={\`mt-4 rounded-lg px-4 py-2 font-semibold text-white \${liked ? 'bg-pink-500' : 'bg-indigo-500'}\`}
          onClick={() => setLiked(!liked)}
        >
          {liked ? 'Liked' : 'Like'}
        </button>
      </div>
    </main>
  );
}
`,
    {
      'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

h1 {
  @apply tracking-tight;
}
`,
    },
  ),
  project(
    'runtime-error',
    'Runtime error',
    'Throws when you press the button.',
    `export default function App() {
  return (
    <main style={${BASE_STYLE}}>
      <h1>Runtime error demo</h1>
      <p>Press the button to throw an error inside the preview.</p>
      <button
        id="boom"
        style={{ fontSize: 18, padding: '8px 16px' }}
        onClick={() => {
          throw new Error('Demo error: the button exploded');
        }}
      >
        Throw an error
      </button>
    </main>
  );
}
`,
  ),
  project(
    'compile-error',
    'Compile error',
    'Imports a file that does not exist.',
    `import Missing from './components/Missing';

export default function App() {
  return (
    <main style={${BASE_STYLE}}>
      <h1>Compile error demo</h1>
      <Missing />
    </main>
  );
}
`,
  ),
];

/** Replaces the <h1> text in an App.tsx; returns undefined when there is no plain-text <h1>. */
export function replaceHeading(source: string, heading: string): string | undefined {
  if (!HEADING_PATTERN.test(source)) {
    return undefined;
  }

  return source.replace(
    HEADING_PATTERN,
    (_match, open: string, _text: string, close: string) => `${open}${heading}${close}`,
  );
}
