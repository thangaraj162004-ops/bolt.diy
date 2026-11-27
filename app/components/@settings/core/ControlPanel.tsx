import { useStore } from '@nanostores/react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { useState, useEffect, useMemo } from 'react';
import { AvatarDropdown } from './AvatarDropdown';
import { TAB_LABELS, TAB_ICONS, DEFAULT_TAB_CONFIG, TAB_DESCRIPTIONS } from './constants';
import type { TabType, Profile } from './types';
import { TabTile } from '~/components/@settings/shared/components/TabTile';

// Import all tab components
import ConnectorsTab from '~/components/@settings/tabs/connectors/ConnectorsTab';
import { DataTab } from '~/components/@settings/tabs/data/DataTab';
import { EventLogsTab } from '~/components/@settings/tabs/event-logs/EventLogsTab';
import FeaturesTab from '~/components/@settings/tabs/features/FeaturesTab';
import GitHubTab from '~/components/@settings/tabs/github/GitHubTab';
import GitLabTab from '~/components/@settings/tabs/gitlab/GitLabTab';
import McpTab from '~/components/@settings/tabs/mcp/McpTab';
import NetlifyTab from '~/components/@settings/tabs/netlify/NetlifyTab';
import NotificationsTab from '~/components/@settings/tabs/notifications/NotificationsTab';
import PluginTab from '~/components/@settings/tabs/plugins/PluginTab';
import ProfileTab from '~/components/@settings/tabs/profile/ProfileTab';
import CloudProvidersTab from '~/components/@settings/tabs/providers/cloud/CloudProvidersTab';
import LocalProvidersTab from '~/components/@settings/tabs/providers/local/LocalProvidersTab';
import SettingsTab from '~/components/@settings/tabs/settings/SettingsTab';
import SupabaseTab from '~/components/@settings/tabs/supabase/SupabaseTab';
import VercelTab from '~/components/@settings/tabs/vercel/VercelTab';
import { DialogTitle } from '~/components/ui/Dialog';
import { useConnectionStatus } from '~/lib/hooks/useConnectionStatus';
import { useFeatures } from '~/lib/hooks/useFeatures';
import { useNotifications } from '~/lib/hooks/useNotifications';
import { profileStore } from '~/lib/stores/profile';
import { tabConfigurationStore, resetTabConfiguration } from '~/lib/stores/settings';
import { classNames } from '~/utils/classNames';

interface ControlPanelProps {
  open: boolean;
  onClose: () => void;
  initialTab?: TabType;
}

// Beta status for experimental features
const BETA_TABS = new Set<TabType>(['local-providers', 'mcp']);

const BetaLabel = () => (
  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-purple-500/10 dark:bg-purple-500/20">
    <span className="text-[10px] font-medium text-purple-600 dark:text-purple-400">BETA</span>
  </div>
);

/** A settings page; on a phone it fills the width with 16 px sides and long text wraps. */
const phonePage = 'mx-auto max-w-5xl touch:max-w-full touch:min-w-0 touch:p-4 touch:break-words';

const NAV_GROUPS: { label: string; tabs: TabType[] }[] = [
  { label: 'Preferences', tabs: ['settings'] },
  { label: 'Account', tabs: ['profile', 'notifications'] },
  { label: 'Workspace', tabs: ['features', 'data', 'event-logs'] },
  { label: 'AI Providers', tabs: ['cloud-providers', 'local-providers'] },
  { label: 'Integrations', tabs: ['connectors', 'mcp'] },
  { label: 'Extensions', tabs: ['plugins'] },
];

export const ControlPanel = ({ open, onClose, initialTab }: ControlPanelProps) => {
  // State
  const [activeTab, setActiveTab] = useState<TabType | null>(null);
  const [loadingTab, setLoadingTab] = useState<TabType | null>(null);
  const [hasVisitedCloudProviders, setHasVisitedCloudProviders] = useState(false);

  // Store values
  const tabConfiguration = useStore(tabConfigurationStore);
  const profile = useStore(profileStore) as Profile;

  // Status hooks
  const { hasNewFeatures, unviewedFeatures, acknowledgeAllFeatures } = useFeatures();
  const { hasUnreadNotifications, unreadNotifications, markAllAsRead } = useNotifications();
  const { hasConnectionIssues, currentIssue, acknowledgeIssue } = useConnectionStatus();

  // Memoize the base tab configurations to avoid recalculation
  const baseTabConfig = useMemo(() => {
    return new Map(DEFAULT_TAB_CONFIG.map((tab) => [tab.id, tab]));
  }, []);

  // Add visibleTabs logic using useMemo with optimized calculations
  const visibleTabs = useMemo(() => {
    if (!tabConfiguration?.userTabs || !Array.isArray(tabConfiguration.userTabs)) {
      console.warn('Invalid tab configuration, resetting to defaults');
      resetTabConfiguration();

      return [];
    }

    const notificationsDisabled = profile?.preferences?.notifications === false;

    // Optimize user mode tab filtering
    return tabConfiguration.userTabs
      .filter((tab) => {
        if (!tab?.id) {
          return false;
        }

        if (tab.id === 'notifications' && notificationsDisabled) {
          return false;
        }

        return tab.visible && tab.window === 'user';
      })
      .sort((a, b) => a.order - b.order);
  }, [tabConfiguration, profile?.preferences?.notifications, baseTabConfig]);

  // Reset to default view when modal opens/closes
  useEffect(() => {
    if (!open) {
      // Reset when closing
      setActiveTab(null);
      setLoadingTab(null);
    } else {
      // When opening, set initial tab if provided
      if (initialTab) {
        setActiveTab(initialTab);
        setLoadingTab(null);

        if (initialTab === 'cloud-providers') {
          setHasVisitedCloudProviders(true);
        }
      } else {
        setActiveTab(null);
      }
    }
  }, [open, initialTab]);

  // Handle closing
  const handleClose = () => {
    setActiveTab(null);
    setLoadingTab(null);
    onClose();
  };

  // Handlers
  const getTabComponent = (tabId: TabType) => {
    switch (tabId) {
      case 'profile':
        return <ProfileTab />;
      case 'settings':
        return <SettingsTab />;
      case 'notifications':
        return <NotificationsTab />;
      case 'features':
        return <FeaturesTab />;
      case 'data':
        return <DataTab />;
      case 'cloud-providers':
        return <CloudProvidersTab />;
      case 'local-providers':
        return <LocalProvidersTab />;
      case 'connectors':
        return <ConnectorsTab />;
      case 'github':
        return <GitHubTab />;
      case 'gitlab':
        return <GitLabTab />;
      case 'supabase':
        return <SupabaseTab />;
      case 'vercel':
        return <VercelTab />;
      case 'netlify':
        return <NetlifyTab />;
      case 'event-logs':
        return <EventLogsTab />;
      case 'mcp':
        return <McpTab />;
      case 'plugins':
        return <PluginTab />;

      default:
        return null;
    }
  };

  const getTabUpdateStatus = (tabId: TabType): boolean => {
    switch (tabId) {
      case 'features':
        return hasNewFeatures;
      case 'notifications':
        return hasUnreadNotifications;
      case 'connectors':
      case 'github':
      case 'gitlab':
      case 'supabase':
      case 'vercel':
      case 'netlify':
        return hasConnectionIssues;
      default:
        return false;
    }
  };

  const getStatusMessage = (tabId: TabType): string => {
    switch (tabId) {
      case 'features':
        return `${unviewedFeatures.length} new feature${unviewedFeatures.length === 1 ? '' : 's'} to explore`;
      case 'notifications':
        return `${unreadNotifications.length} unread notification${unreadNotifications.length === 1 ? '' : 's'}`;
      case 'connectors':
      case 'github':
      case 'gitlab':
      case 'supabase':
      case 'vercel':
      case 'netlify':
        return currentIssue === 'disconnected'
          ? 'Connection lost'
          : currentIssue === 'high-latency'
            ? 'High latency detected'
            : 'Connection issues detected';
      default:
        return '';
    }
  };

  const handleTabClick = (tabId: TabType) => {
    setLoadingTab(tabId);
    setActiveTab(tabId);

    if (tabId === 'cloud-providers') {
      setHasVisitedCloudProviders(true);
    }

    // Acknowledge notifications based on tab
    switch (tabId) {
      case 'features':
        acknowledgeAllFeatures();
        break;
      case 'notifications':
        markAllAsRead();
        break;
      case 'connectors':
      case 'github':
      case 'gitlab':
      case 'supabase':
      case 'vercel':
      case 'netlify':
        acknowledgeIssue();
        break;
    }

    // Clear loading state after a delay
    setTimeout(() => setLoadingTab(null), 500);
  };

  const navigationTabs = NAV_GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.filter((id) => id !== 'notifications' || profile?.preferences?.notifications !== false),
  }));

  return (
    <RadixDialog.Root open={open}>
      <RadixDialog.Portal>
        <div className="fixed inset-0 flex items-center justify-center z-[100] modern-scrollbar">
          <RadixDialog.Overlay className="absolute inset-0 bg-black/70 dark:bg-black/80 backdrop-blur-sm transition-opacity duration-200" />

          <RadixDialog.Content
            aria-describedby={undefined}
            onEscapeKeyDown={handleClose}
            onPointerDownOutside={handleClose}
            className="relative z-[101]"
          >
            <div
              className={classNames(
                'w-[min(1440px,calc(100vw-2rem))] h-[90vh]',

                // phone: a full-screen page
                'touch:w-screen touch:h-[100dvh] touch:!rounded-none touch:!border-0',
                'bg-ca-elements-background-depth-1 text-ca-elements-textPrimary',
                'rounded-2xl shadow-2xl',
                'border border-ca-elements-borderColor',
                'flex flex-col overflow-hidden',
                'relative',
                'transform transition-all duration-200 ease-out',
                open ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4',
              )}
            >
              <div className="relative z-10 flex h-full min-h-0">
                <aside className="touch:hidden flex w-[248px] shrink-0 flex-col border-r border-ca-elements-borderColor bg-ca-elements-background-depth-2">
                  <button
                    onClick={handleClose}
                    className="mx-4 mt-4 flex appearance-none items-center gap-2 border-0 border-b border-solid border-ca-elements-borderColor bg-transparent px-2 pb-5 pt-2 text-left text-sm font-semibold text-ca-elements-textPrimary hover:text-ca-elements-item-contentAccent"
                  >
                    <span className="i-ph:arrow-left w-4 h-4" /> Back to project
                  </button>
                  <nav className="min-h-0 flex-1 overflow-y-auto modern-scrollbar px-3 py-4">
                    {navigationTabs.map((group) => (
                      <div key={group.label} className="mb-5">
                        <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wide text-ca-elements-textTertiary">
                          {group.label}
                        </p>
                        {group.tabs.map((tabId) => {
                          const Icon = TAB_ICONS[tabId];
                          const selected = activeTab === tabId;

                          return (
                            <button
                              key={tabId}
                              onClick={() => handleTabClick(tabId)}
                              className={classNames(
                                'flex w-full appearance-none items-center gap-3 rounded-md border-0 px-2 py-2 text-left text-sm transition-colors',
                                selected
                                  ? 'bg-ca-elements-item-backgroundAccent text-ca-elements-item-contentAccent'
                                  : 'bg-transparent text-ca-elements-textSecondary hover:bg-ca-elements-item-backgroundActive hover:text-ca-elements-textPrimary',
                              )}
                            >
                              <Icon className="h-4 w-4" /> {TAB_LABELS[tabId]}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </nav>
                  <div className="flex h-16 items-center border-t border-ca-elements-borderColor px-3">
                    <AvatarDropdown onSelectTab={handleTabClick} />
                  </div>
                </aside>
                <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden modern-scrollbar p-6 touch:p-0 mouse:px-10 mouse:py-8">
                  {/* phone: a top bar with a back arrow and the page title */}
                  <div className="mouse:hidden sticky top-0 z-20 flex h-14 items-center gap-1 border-b border-ca-elements-borderColor bg-ca-elements-background-depth-1 px-1">
                    <button
                      type="button"
                      aria-label="Back"
                      onClick={() => (activeTab ? setActiveTab(null) : handleClose())}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-transparent text-ca-elements-textPrimary"
                    >
                      <span className="i-ph:arrow-left text-xl" aria-hidden="true" />
                    </button>
                    <h2 data-testid="settings-title" className="min-w-0 truncate text-base font-semibold">
                      {activeTab ? TAB_LABELS[activeTab] : 'Settings'}
                    </h2>
                  </div>
                  {activeTab && activeTab !== 'cloud-providers' ? (
                    <div className={phonePage}>{getTabComponent(activeTab)}</div>
                  ) : !activeTab ? (
                    <div className="mx-auto max-w-5xl">
                      <DialogTitle className="mb-1 text-2xl font-semibold text-ca-elements-textPrimary touch:sr-only">
                        Control Panel
                      </DialogTitle>
                      <p className="mb-6 text-sm text-ca-elements-textSecondary touch:hidden">
                        Manage your account, preferences, providers, and connected services.
                      </p>

                      {/* phone: one list of big rows, in the same groups as the desktop side menu */}
                      <div className="mouse:hidden py-2" data-testid="settings-list">
                        {navigationTabs.map((group) => (
                          <section key={group.label} className="mb-2">
                            <h3 className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-ca-elements-textTertiary">
                              {group.label}
                            </h3>
                            <ul>
                              {group.tabs.map((tabId) => {
                                const Icon = TAB_ICONS[tabId];

                                return (
                                  <li key={tabId}>
                                    <button
                                      type="button"
                                      data-testid="settings-row"
                                      data-tab={tabId}
                                      onClick={() => handleTabClick(tabId)}
                                      className="flex min-h-[60px] w-full items-center gap-3 bg-transparent px-4 py-2 text-left hover:bg-ca-elements-item-backgroundActive"
                                    >
                                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ca-elements-background-depth-3 text-ca-elements-textSecondary">
                                        <Icon className="h-5 w-5" />
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block text-base text-ca-elements-textPrimary">
                                          {TAB_LABELS[tabId]}
                                          {BETA_TABS.has(tabId) && (
                                            <span className="ml-2 rounded-full bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:text-purple-400">
                                              BETA
                                            </span>
                                          )}
                                        </span>
                                        <span className="block break-words text-sm text-ca-elements-textSecondary">
                                          {getTabUpdateStatus(tabId)
                                            ? getStatusMessage(tabId)
                                            : TAB_DESCRIPTIONS[tabId]}
                                        </span>
                                      </span>
                                      <span
                                        className="i-ph:caret-right shrink-0 text-ca-elements-textTertiary"
                                        aria-hidden="true"
                                      />
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </section>
                        ))}
                      </div>

                      <div className="touch:hidden grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {visibleTabs.map((tab, index) => (
                          <div
                            key={tab.id}
                            className="relative min-h-[160px]"
                            style={{
                              animationDelay: `${index * 30}ms`,
                              animation: open ? 'fadeInUp 200ms ease-out forwards' : 'none',
                            }}
                          >
                            <TabTile
                              tab={tab}
                              onClick={() => handleTabClick(tab.id as TabType)}
                              isActive={activeTab === tab.id}
                              hasUpdate={getTabUpdateStatus(tab.id)}
                              statusMessage={getStatusMessage(tab.id)}
                              description={TAB_DESCRIPTIONS[tab.id]}
                              isLoading={loadingTab === tab.id}
                              className="h-full relative"
                            />
                            {BETA_TABS.has(tab.id) && <BetaLabel />}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {hasVisitedCloudProviders && (
                    <div
                      aria-hidden={activeTab !== 'cloud-providers'}
                      className={classNames(phonePage, activeTab !== 'cloud-providers' && 'hidden')}
                    >
                      <CloudProvidersTab />
                    </div>
                  )}
                </main>
              </div>
            </div>
          </RadixDialog.Content>
        </div>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
};
