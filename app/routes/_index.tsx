import type { MetaFunction } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { FirstRunOnboarding } from '~/components/onboarding/FirstRunOnboarding';
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

export const loader = () => Response.json({});

/**
 * Landing page component for CodeApp AI
 * Note: Settings functionality should ONLY be accessed through the sidebar menu.
 * Do not add settings button/panel to this landing page as it was intentionally removed
 * to keep the UI clean and consistent with the design system.
 */
export default function Index() {
  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
      <FirstRunOnboarding />
    </div>
  );
}
