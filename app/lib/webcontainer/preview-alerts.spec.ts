import { atom } from 'nanostores';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_BUILD_ERROR_TITLE, reportPreviewMessage, reportPreviewUpdate } from './preview-alerts';
import { BuildError } from './shim/preview/compiler';
import type { ActionAlert } from '~/types/actions';

const base = { previewId: '5173', port: 5173, pathname: 'srcdoc', search: '', hash: '' };

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('reportPreviewMessage', () => {
  it('turns an uncaught exception into a preview alert', () => {
    const alert = atom<ActionAlert | undefined>(undefined);

    reportPreviewMessage(
      { ...base, type: 'PREVIEW_UNCAUGHT_EXCEPTION', message: 'x is not defined', stack: 'ReferenceError: x' },
      alert,
    );

    expect(alert.get()).toMatchObject({
      type: 'preview',
      title: 'Uncaught Exception',
      description: 'x is not defined',
      source: 'preview',
    });
    expect(alert.get()?.content).toContain('Port: 5173');
  });

  it('turns an unhandled rejection into a preview alert', () => {
    const alert = atom<ActionAlert | undefined>(undefined);

    reportPreviewMessage({ ...base, type: 'PREVIEW_UNHANDLED_REJECTION', message: 'nope', stack: undefined }, alert);

    expect(alert.get()?.title).toBe('Unhandled Promise Rejection');
  });

  it('does not alert for console.error, like the WebContainer engine', () => {
    const alert = atom<ActionAlert | undefined>(undefined);

    reportPreviewMessage({ ...base, type: 'PREVIEW_CONSOLE_ERROR', args: ['x'], stack: '' }, alert);

    expect(alert.get()).toBeUndefined();
  });
});

describe('reportPreviewUpdate', () => {
  const error = new BuildError([{ file: 'src/App.tsx', line: 3, column: 7, text: 'Could not resolve "./Missing"' }]);

  it('turns a build error into a preview alert with file and line', () => {
    const alert = atom<ActionAlert | undefined>(undefined);

    reportPreviewUpdate({ port: 5173, kind: 'build-error', error }, alert);

    expect(alert.get()).toMatchObject({
      type: 'preview',
      title: PREVIEW_BUILD_ERROR_TITLE,
      description: 'Could not resolve "./Missing"',
      source: 'preview',
    });
    expect(alert.get()?.content).toContain('src/App.tsx:3:7: Could not resolve "./Missing"');
  });

  it('clears its own alert after a good build, but leaves other alerts alone', () => {
    const alert = atom<ActionAlert | undefined>(undefined);

    reportPreviewUpdate({ port: 5173, kind: 'build-error', error }, alert);
    reportPreviewUpdate({ port: 5173, kind: 'rebuilt', version: 2, durationMs: 20 }, alert);
    expect(alert.get()).toBeUndefined();

    const other: ActionAlert = { type: 'error', title: 'Terminal error', description: '', content: '' };
    alert.set(other);
    reportPreviewUpdate({ port: 5173, kind: 'ready', version: 1, durationMs: 20 }, alert);
    expect(alert.get()).toBe(other);
  });
});

describe('a new build clears an old runtime error (Task 9F)', () => {
  it('so a fixed "x is not defined" is not reported to the agent as still failing', () => {
    const alert = atom<ActionAlert | undefined>(undefined);

    reportPreviewMessage(
      { ...base, type: 'PREVIEW_UNCAUGHT_EXCEPTION', message: 'cartCount is not defined', stack: '' },
      alert,
    );
    expect(alert.get()?.title).toBe('Uncaught Exception');

    reportPreviewUpdate({ port: 5173, kind: 'rebuilt', version: 3, durationMs: 20 }, alert);
    expect(alert.get()).toBeUndefined();

    // terminal alerts are not preview errors and stay
    const terminal = {
      type: 'error',
      title: 'Command failed',
      description: 'x',
      content: 'x',
      source: 'terminal',
    } as const;
    alert.set(terminal);
    reportPreviewUpdate({ port: 5173, kind: 'rebuilt', version: 3, durationMs: 20 }, alert);
    expect(alert.get()).toEqual(terminal);
  });
});
