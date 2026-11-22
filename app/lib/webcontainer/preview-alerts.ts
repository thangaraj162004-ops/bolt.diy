/**
 * Turns preview problems into workbench alerts, so the user (and the AI loop)
 * can see and fix them. Used by both engines in ~/lib/webcontainer.
 */
import type { WritableAtom } from 'nanostores';
import type { PreviewUpdate } from './shim/shim';
import type { PreviewMessage } from './types';
import type { ActionAlert } from '~/types/actions';

/** Title of the alert shown when the esbuild preview fails to compile. */
export const PREVIEW_BUILD_ERROR_TITLE = 'Preview Build Error';

/** Uncaught exceptions and unhandled rejections in the preview become an alert. */
export function reportPreviewMessage(message: PreviewMessage, actionAlert: WritableAtom<ActionAlert | undefined>) {
  console.log('WebContainer preview message:', message);

  // Handle both uncaught exceptions and unhandled promise rejections
  if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || message.type === 'PREVIEW_UNHANDLED_REJECTION') {
    const isPromise = message.type === 'PREVIEW_UNHANDLED_REJECTION';
    const title = isPromise ? 'Unhandled Promise Rejection' : 'Uncaught Exception';
    actionAlert.set({
      type: 'preview',
      title,
      description: 'message' in message ? message.message : 'Unknown error',
      content: `Error occurred at ${message.pathname}${message.search}${message.hash}\nPort: ${message.port}\n\nStack trace:\n${message.stack || ''}`,
      source: 'preview',
    });
  }
}

/**
 * esbuild engine: compile errors never reach the preview, so they become the
 * same kind of alert. A later good build removes that alert (and only that one).
 */
export function reportPreviewUpdate(update: PreviewUpdate, actionAlert: WritableAtom<ActionAlert | undefined>) {
  if (update.kind === 'build-error') {
    const [first] = update.error.messages;
    actionAlert.set({
      type: 'preview',
      title: PREVIEW_BUILD_ERROR_TITLE,
      description: first?.text ?? 'The preview could not be built',
      content: `Build failed for the preview on port ${update.port}:\n\n${update.error.message}`,
      source: 'preview',
    });
  } else if (update.kind === 'ready' || update.kind === 'rebuilt') {
    if (actionAlert.get()?.title === PREVIEW_BUILD_ERROR_TITLE) {
      actionAlert.set(undefined);
    }
  }
}
