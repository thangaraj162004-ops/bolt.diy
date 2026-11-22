import { reportPreviewMessage, reportPreviewUpdate } from './preview-alerts';
import type { WebContainerShim } from './shim/shim';

/*
 * The app's preview runtime: the in-memory esbuild shim (./shim/shim). It is
 * the only implementation of ~/lib/webcontainer/types. The shim module is
 * loaded on first use so esbuild-wasm stays out of the first page load.
 */

interface WebContainerContext {
  loaded: boolean;
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data.webcontainerContext ?? {
  loaded: false,
};

if (import.meta.hot) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

export let webcontainer: Promise<WebContainerShim> = new Promise(() => {
  // noop for ssr
});

if (!import.meta.env.SSR) {
  webcontainer =
    import.meta.hot?.data.webcontainer ??
    import('./shim/shim')
      .then((shimModule) => new shimModule.WebContainerShim())
      .then(async (shim) => {
        webcontainerContext.loaded = true;

        const { workbenchStore } = await import('~/lib/stores/workbench');

        const response = await fetch('/inspector-script.js');
        const inspectorScript = await response.text();
        await shim.setPreviewScript(inspectorScript);

        // preview errors come through the iframe error bridge
        shim.on('preview-message', (message) => reportPreviewMessage(message, workbenchStore.actionAlert));

        // compile errors never reach the preview, so they become the same kind of alert
        shim.onPreviewUpdate((update) => reportPreviewUpdate(update, workbenchStore.actionAlert));

        return shim;
      });

  if (import.meta.hot) {
    import.meta.hot.data.webcontainer = webcontainer;
  }
}
