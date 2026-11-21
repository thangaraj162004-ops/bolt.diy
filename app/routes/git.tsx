import type { LoaderFunctionArgs } from 'react-router';
import type { MetaFunction } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { GitUrlImport } from '~/components/git/GitUrlImport.client';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from '~/lib/brand';

export const meta: MetaFunction = () => [
  { title: PRODUCT_NAME },
  { name: 'description', content: PRODUCT_DESCRIPTION },
  { property: 'og:title', content: PRODUCT_NAME },
  { property: 'og:description', content: PRODUCT_DESCRIPTION },
  { property: 'og:site_name', content: PRODUCT_NAME },
  { name: 'twitter:title', content: PRODUCT_NAME },
  { name: 'twitter:description', content: PRODUCT_DESCRIPTION },
];

export async function loader(args: LoaderFunctionArgs) {
  return Response.json({ url: args.params.url });
}

export default function Index() {
  return (
    <div className="flex flex-col h-full w-full bg-ca-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly fallback={<BaseChat />}>{() => <GitUrlImport />}</ClientOnly>
    </div>
  );
}
