import { WebContainer } from '@webcontainer/api';
import { reportPreviewMessage, reportPreviewUpdate } from './preview-alerts';
import { WORK_DIR_NAME } from '~/utils/constants';

interface WebContainerContext {
  loaded: boolean;
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data.webcontainerContext ?? {
  loaded: false,
};

if (import.meta.hot) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

export let webcontainer: Promise<WebContainer> = new Promise(() => {
  // noop for ssr
});

if (!import.meta.env.SSR) {
  webcontainer =
    import.meta.hot?.data.webcontainer ??
    Promise.resolve()
      .then(async () => {
        // Preview engine switch: 'webcontainer' (default) or 'esbuild' (in-memory shim, no WebContainer boot).
        if (import.meta.env.VITE_PREVIEW_ENGINE === 'esbuild') {
          const shimModule = await import('./shim/shim');

          // the shim implements our own `~/lib/webcontainer/types` interface, not the full upstream class
          return new shimModule.WebContainerShim() as unknown as WebContainer;
        }

        return WebContainer.boot({
          coep: 'credentialless',
          workdirName: WORK_DIR_NAME,
          forwardPreviewErrors: true, // Enable error forwarding from iframes
        });
      })
      .then(async (webcontainer) => {
        webcontainerContext.loaded = true;

        const { workbenchStore } = await import('~/lib/stores/workbench');

        const response = await fetch('/inspector-script.js');
        const inspectorScript = await response.text();
        await webcontainer.setPreviewScript(inspectorScript);

        // Listen for preview errors (for the esbuild engine they come through the iframe error bridge)
        webcontainer.on('preview-message', (message) => reportPreviewMessage(message, workbenchStore.actionAlert));

        // esbuild engine: compile errors never reach the preview, so they become the same kind of alert
        if (import.meta.env.VITE_PREVIEW_ENGINE === 'esbuild') {
          const shim = webcontainer as unknown as import('./shim/shim').WebContainerShim;
          shim.onPreviewUpdate((update) => reportPreviewUpdate(update, workbenchStore.actionAlert));
        }

        return webcontainer;
      });

  if (import.meta.hot) {
    import.meta.hot.data.webcontainer = webcontainer;
  }
}
