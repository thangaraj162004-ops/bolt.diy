import { redirect, type MetaFunction } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';
import { StarterTemplateImport } from '~/components/chat/StarterTemplateImport.client';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { LoadingOverlay } from '~/components/ui/LoadingOverlay';
import { pageTitle } from '~/lib/brand';
import { getPreviewEngine, usesStarterTemplates } from '~/lib/webcontainer/engine';

export const meta: MetaFunction = () => [{ title: pageTitle('Start a blank app') }];

/** Starter templates are not used with the esbuild engine (see usesStarterTemplates); go to the start page. */
export function loader() {
  if (!usesStarterTemplates(getPreviewEngine())) {
    throw redirect('/');
  }

  return null;
}

export default function Starter() {
  return (
    <div className="flex flex-col h-full w-full bg-ca-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly fallback={<LoadingOverlay message="Loading starter template..." />}>
        {() => <StarterTemplateImport />}
      </ClientOnly>
    </div>
  );
}
