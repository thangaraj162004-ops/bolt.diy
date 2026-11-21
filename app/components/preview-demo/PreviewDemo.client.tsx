/**
 * /preview-demo: try the esbuild preview without an AI key. Each button writes
 * a small project into the shim's in-memory file system and runs
 * `npm run dev` through the shim. The preview uses the same sandboxed iframe
 * as the workbench (EsbuildPreviewFrame). Only enabled behind build flags.
 */
import { useStore } from '@nanostores/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEMO_PROJECTS, replaceHeading, type DemoProject } from './demo-projects';
import { EsbuildPreviewFrame, useEsbuildPreview } from '~/components/workbench/EsbuildPreviewFrame';
import { workbenchStore } from '~/lib/stores/workbench';
import { webcontainer } from '~/lib/webcontainer';
import type { WebContainerShim } from '~/lib/webcontainer/shim/shim';
import type { WebContainerProcess } from '~/lib/webcontainer/types';

interface LogEntry {
  id: number;
  time: string;
  text: string;
  tone: 'info' | 'good' | 'bad';
}

const MAX_LOG = 50;

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

async function getShim(): Promise<WebContainerShim | undefined> {
  const instance = (await webcontainer) as unknown as WebContainerShim;
  return typeof instance.getPreviewHtml === 'function' ? instance : undefined;
}

async function writeProject(shim: WebContainerShim, files: Record<string, string>) {
  // start from an empty project folder
  for (const entry of await shim.fs.readdir('.')) {
    await shim.fs.rm(entry, { recursive: true, force: true });
  }

  for (const [path, content] of Object.entries(files)) {
    const slash = path.lastIndexOf('/');

    if (slash > 0) {
      await shim.fs.mkdir(path.slice(0, slash), { recursive: true });
    }

    await shim.fs.writeFile(path, content);
  }
}

export function PreviewDemo() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const processRef = useRef<WebContainerProcess | undefined>(undefined);
  const pendingRef = useRef<{ what: string; startedAt: number } | undefined>(undefined);
  const logId = useRef(0);

  const [port, setPort] = useState<number | undefined>();
  const [current, setCurrent] = useState<DemoProject | undefined>();
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const alert = useStore(workbenchStore.actionAlert);
  const preview = useEsbuildPreview(port, iframeRef);

  const addLog = useCallback((text: string, tone: LogEntry['tone'] = 'info') => {
    setLog((entries) => [{ id: ++logId.current, time: now(), text, tone }, ...entries].slice(0, MAX_LOG));
  }, []);

  // build timings and the dev server's port, straight from the shim
  useEffect(() => {
    let cancelled = false;

    const unsubscribers: Array<() => void> = [];

    void getShim().then((shim) => {
      if (cancelled) {
        return;
      }

      if (!shim) {
        setUnavailable(true);
        return;
      }

      unsubscribers.push(shim.on('server-ready', (readyPort) => setPort(readyPort)));
      unsubscribers.push(
        shim.onPreviewUpdate((update) => {
          const pending = pendingRef.current;

          const since = pending
            ? `, ${Math.round(performance.now() - pending.startedAt)} ms after ${pending.what}`
            : '';
          pendingRef.current = undefined;

          if (update.kind === 'ready') {
            addLog(`First build: ${update.durationMs} ms${since}`, 'good');
          } else if (update.kind === 'rebuilt') {
            addLog(`Rebuild #${update.version}: ${update.durationMs} ms${since}`, 'good');
          } else if (update.kind === 'build-error') {
            addLog(`Build failed${since}: ${update.error.messages[0]?.text ?? update.error.message}`, 'bad');
          }
        }),
      );
    });

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [addLog]);

  // preview error alerts (set by the same handler the workbench uses)
  useEffect(() => {
    if (alert) {
      addLog(`Alert: ${alert.title}: ${alert.description}`, 'bad');
    }
  }, [alert, addLog]);

  // stop the dev server when leaving the page
  useEffect(() => () => processRef.current?.kill(), []);

  const start = async (project: DemoProject) => {
    const shim = await getShim();

    if (!shim || busy) {
      return;
    }

    setBusy(true);

    try {
      processRef.current?.kill();
      workbenchStore.actionAlert.set(undefined);
      await writeProject(shim, project.files);
      setCurrent(project);
      addLog(`Started "${project.label}"`);

      pendingRef.current = { what: 'start', startedAt: performance.now() };

      const process = await shim.spawn('npm', ['run', 'dev']);
      processRef.current = process;

      // keep the output stream flowing; the log above shows what matters
      void process.output.pipeTo(new WritableStream()).catch(() => undefined);
    } catch (error) {
      addLog(`Could not start: ${(error as Error).message}`, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const editHeading = async () => {
    const shim = await getShim();

    if (!shim || !current) {
      return;
    }

    let source: string;

    try {
      source = await shim.fs.readFile('src/App.tsx', 'utf-8');
    } catch {
      addLog('src/App.tsx not found', 'bad');
      return;
    }

    const updated = replaceHeading(source, `Edited at ${now()}`);

    if (!updated) {
      addLog('No plain <h1> heading to edit in src/App.tsx', 'bad');
      return;
    }

    pendingRef.current = { what: 'the edit', startedAt: performance.now() };
    await shim.fs.writeFile('src/App.tsx', updated);
    addLog('Edited the heading in src/App.tsx');
  };

  if (unavailable) {
    return (
      <div className="p-4 text-ca-elements-textPrimary">
        The esbuild preview engine is not active in this build (VITE_PREVIEW_ENGINE=esbuild is required).
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-y-auto bg-ca-elements-background-depth-1 text-ca-elements-textPrimary">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-3">
        <header>
          <h1 className="text-xl font-semibold">Preview demo</h1>
          <p className="text-sm text-ca-elements-textSecondary">
            Test projects for the in-browser esbuild preview. No AI, no keys. Not for public launch.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DEMO_PROJECTS.map((project) => (
            <button
              key={project.id}
              type="button"
              disabled={busy}
              onClick={() => void start(project)}
              className={`rounded-lg border px-3 py-3 text-left text-sm ${
                current?.id === project.id
                  ? 'border-ca-elements-borderColorActive bg-ca-elements-background-depth-3'
                  : 'border-ca-elements-borderColor bg-ca-elements-background-depth-2'
              }`}
            >
              <span className="block font-medium">{project.label}</span>
              <span className="block text-xs text-ca-elements-textSecondary">{project.description}</span>
            </button>
          ))}
          <button
            type="button"
            disabled={!current || busy}
            onClick={() => void editHeading()}
            className="rounded-lg border border-ca-elements-borderColor bg-ca-elements-background-depth-2 px-3 py-3 text-left text-sm disabled:opacity-50"
          >
            <span className="block font-medium">Edit heading</span>
            <span className="block text-xs text-ca-elements-textSecondary">Change the h1 and time the rebuild.</span>
          </button>
        </div>

        <div className="h-[60vh] min-h-[320px] overflow-hidden rounded-lg border border-ca-elements-borderColor bg-white">
          {port === undefined || !current ? (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-gray-500">
              Pick a project to start the preview.
            </div>
          ) : (
            <EsbuildPreviewFrame ref={iframeRef} srcDoc={preview.srcDoc} className="h-full w-full border-none" />
          )}
        </div>

        <section aria-label="Build log">
          <h2 className="mb-1 text-sm font-semibold">Log</h2>
          <ol className="max-h-60 overflow-y-auto rounded-lg border border-ca-elements-borderColor bg-ca-elements-background-depth-2 p-2 font-mono text-xs">
            {log.length === 0 && <li className="text-ca-elements-textSecondary">Nothing yet.</li>}
            {log.map((entry) => (
              <li
                key={entry.id}
                className={entry.tone === 'bad' ? 'text-red-500' : entry.tone === 'good' ? 'text-green-600' : undefined}
              >
                {entry.time} {entry.text}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
