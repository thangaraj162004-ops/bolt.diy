/**
 * The esbuild-engine preview iframe and its wiring, shared by the workbench
 * Preview and the /preview-demo page so there is one definition of how the
 * generated code is shown:
 *
 * - `EsbuildPreviewFrame`: a `srcDoc` iframe with ESBUILD_PREVIEW_SANDBOX
 *   (from engine.ts; never allow-same-origin), no `src`, no `allow`.
 * - `useEsbuildPreview`: keeps the HTML in sync with the shim (ready, rebuilt,
 *   build-error) and runs the one listener for the preview's error bridge.
 */
import { forwardRef, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { webcontainer } from '~/lib/webcontainer';
import { ESBUILD_PREVIEW_SANDBOX } from '~/lib/webcontainer/engine';
import { createPreviewBridgeListener } from '~/lib/webcontainer/shim/preview/bridge';
import type { WebContainerShim } from '~/lib/webcontainer/shim/shim';

interface EsbuildPreviewFrameProps {
  srcDoc: string | undefined;
  title?: string;
  className?: string;
  style?: CSSProperties;
}

/** A short, cheap fingerprint of a document (FNV-1a), used as the iframe key. */
function documentKey(html: string) {
  let hash = 0x811c9dc5;

  for (let i = 0; i < html.length; i++) {
    hash ^= html.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return `${html.length}-${(hash >>> 0).toString(16)}`;
}

/*
 * Every new document gets a new iframe element (keyed by its content), and no
 * iframe exists before the first document. Updating `srcdoc` on an iframe whose
 * previous srcdoc is still loading can be dropped by Chromium, which left the
 * preview blank when the first build arrived right after the iframe mounted
 * with an empty document.
 */
export const EsbuildPreviewFrame = forwardRef<HTMLIFrameElement, EsbuildPreviewFrameProps>(
  ({ srcDoc, title = 'preview', className, style }, ref) => {
    const key = useMemo(() => (srcDoc === undefined ? 'pending' : documentKey(srcDoc)), [srcDoc]);

    if (srcDoc === undefined) {
      return (
        <div
          data-testid="esbuild-preview-pending"
          className={className}
          style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="text-sm text-ca-elements-textSecondary">Starting the preview…</span>
        </div>
      );
    }

    return (
      <iframe
        key={key}
        ref={ref}
        title={title}
        className={className}
        style={style}
        srcDoc={srcDoc}
        sandbox={ESBUILD_PREVIEW_SANDBOX}
      />
    );
  },
);

EsbuildPreviewFrame.displayName = 'EsbuildPreviewFrame';

export interface EsbuildPreview {
  /** The HTML to show (latest build or the build error page). */
  srcDoc: string | undefined;

  /** The shim, once the app's webcontainer promise has resolved to it. */
  shim: WebContainerShim | undefined;

  /** Rebuilds now; the new HTML (new bridge token) reloads the iframe. */
  rebuild: () => void;
}

/**
 * @param port the esbuild dev port to show, or undefined to do nothing
 * @param iframeRef the iframe whose window may talk through the error bridge
 */
export function useEsbuildPreview(
  port: number | undefined,
  iframeRef: RefObject<HTMLIFrameElement | null>,
): EsbuildPreview {
  const shimRef = useRef<WebContainerShim | undefined>(undefined);
  const [shim, setShim] = useState<WebContainerShim | undefined>();
  const [srcDoc, setSrcDoc] = useState<string | undefined>();

  // show the shim's latest HTML and update it after every build
  useEffect(() => {
    if (port === undefined) {
      setSrcDoc(undefined);
      return undefined;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void webcontainer.then((instance) => {
      const candidate = instance as unknown as WebContainerShim;

      if (cancelled || typeof candidate.getPreviewHtml !== 'function') {
        return;
      }

      shimRef.current = candidate;
      setShim(candidate);

      const refresh = () => setSrcDoc(candidate.getPreviewHtml(port));
      refresh();
      unsubscribe = candidate.onPreviewUpdate((update) => {
        if (update.port === port) {
          refresh();
        }
      });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [port]);

  /*
   * The one listener for the preview's error bridge. A message counts only if
   * it comes from this iframe's window, carries the current build's token and
   * has a valid shape; it then goes to the shim's `preview-message` event
   * (handled in ~/lib/webcontainer, which sets the workbench alert).
   */
  useEffect(() => {
    if (port === undefined) {
      return undefined;
    }

    const listener = createPreviewBridgeListener({
      getFrameWindow: () => iframeRef.current?.contentWindow,
      getToken: () => shimRef.current?.getPreviewBridgeToken(port),
      onMessage: (message) => shimRef.current?.events.emit('preview-message', message),
    });

    window.addEventListener('message', listener);

    return () => window.removeEventListener('message', listener);
  }, [port, iframeRef]);

  return {
    srcDoc,
    shim,
    rebuild: () => {
      if (port !== undefined) {
        void shimRef.current?.rebuildPreview(port);
      }
    },
  };
}
