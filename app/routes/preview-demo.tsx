import { lazy, Suspense } from 'react';
import type { MetaFunction } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';
import { isPreviewDemoEnabled } from '~/lib/webcontainer/engine';

/*
 * /preview-demo: try the esbuild preview without an AI key.
 * Exists only when VITE_PREVIEW_ENGINE=esbuild AND VITE_PREVIEW_DEMO=1 (both
 * read at build time); otherwise every request gets a 404. Keep it off for any
 * public launch.
 */

const PreviewDemo = lazy(() =>
  import('~/components/preview-demo/PreviewDemo.client').then((m) => ({ default: m.PreviewDemo })),
);

export const meta: MetaFunction = () => [{ title: 'Preview demo' }, { name: 'robots', content: 'noindex, nofollow' }];

export function loader() {
  if (!isPreviewDemoEnabled()) {
    throw new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  return null;
}

export default function PreviewDemoRoute() {
  if (!isPreviewDemoEnabled()) {
    return null;
  }

  return (
    <ClientOnly fallback={null}>
      {() => (
        <Suspense fallback={null}>
          <PreviewDemo />
        </Suspense>
      )}
    </ClientOnly>
  );
}
