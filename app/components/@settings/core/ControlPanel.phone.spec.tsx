import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// each settings page is replaced with a stand-in: this test is about the phone page frame
const page = (name: string) => () => <div data-testid={`page-${name}`}>{name} page</div>;
vi.mock('~/components/@settings/tabs/connectors/ConnectorsTab', () => ({ default: page('connectors') }));
vi.mock('~/components/@settings/tabs/data/DataTab', () => ({ DataTab: page('data') }));
vi.mock('~/components/@settings/tabs/event-logs/EventLogsTab', () => ({ EventLogsTab: page('event-logs') }));
vi.mock('~/components/@settings/tabs/features/FeaturesTab', () => ({ default: page('features') }));
vi.mock('~/components/@settings/tabs/github/GitHubTab', () => ({ default: page('github') }));
vi.mock('~/components/@settings/tabs/gitlab/GitLabTab', () => ({ default: page('gitlab') }));
vi.mock('~/components/@settings/tabs/mcp/McpTab', () => ({ default: page('mcp') }));
vi.mock('~/components/@settings/tabs/netlify/NetlifyTab', () => ({ default: page('netlify') }));
vi.mock('~/components/@settings/tabs/notifications/NotificationsTab', () => ({ default: page('notifications') }));
vi.mock('~/components/@settings/tabs/plugins/PluginTab', () => ({ default: page('plugins') }));
vi.mock('~/components/@settings/tabs/profile/ProfileTab', () => ({ default: page('profile') }));
vi.mock('~/components/@settings/tabs/providers/cloud/CloudProvidersTab', () => ({ default: page('cloud') }));
vi.mock('~/components/@settings/tabs/providers/local/LocalProvidersTab', () => ({ default: page('local') }));
vi.mock('~/components/@settings/tabs/settings/SettingsTab', () => ({ default: page('settings') }));
vi.mock('~/components/@settings/tabs/supabase/SupabaseTab', () => ({ default: page('supabase') }));
vi.mock('~/components/@settings/tabs/vercel/VercelTab', () => ({ default: page('vercel') }));
vi.mock('~/lib/hooks/useFeatures', () => ({
  useFeatures: () => ({ hasNewFeatures: false, unviewedFeatures: [], acknowledgeAllFeatures: vi.fn() }),
}));
vi.mock('~/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ hasUnreadNotifications: false, unreadNotifications: [], markAllAsRead: vi.fn() }),
}));
vi.mock('~/lib/hooks/useConnectionStatus', () => ({
  useConnectionStatus: () => ({ hasConnectionIssues: false, currentIssue: null, acknowledgeIssue: vi.fn() }),
}));

const { ControlPanel } = await import('./ControlPanel');

afterEach(cleanup);

describe('Settings on a phone', () => {
  it('is a full-screen page with a back arrow, a title and one list of big rows', () => {
    const onClose = vi.fn();
    render(<ControlPanel open onClose={onClose} />);

    const frame = screen.getByRole('dialog').firstElementChild!;
    expect(frame.className).toContain('touch:w-screen');
    expect(frame.className).toContain('touch:h-[100dvh]');

    // the desktop side menu and the tile grid are hidden on a phone
    expect(document.querySelector('aside')!.className).toContain('touch:hidden');

    expect(screen.getByTestId('settings-title').textContent).toBe('Settings');

    const list = screen.getByTestId('settings-list');
    expect(list.className).toContain('mouse:hidden');

    const rows = within(list).getAllByTestId('settings-row');
    expect(rows.map((row) => row.getAttribute('data-tab'))).toEqual(
      expect.arrayContaining(['profile', 'settings', 'cloud-providers', 'data', 'event-logs']),
    );
    rows.forEach((row) => expect(row.className).toContain('min-h-[60px]'));

    // the back arrow on the list closes Settings
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back.className).toContain('h-11 w-11');
    fireEvent.click(back);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a row opens its page full screen; the back arrow returns to the list', async () => {
    const onClose = vi.fn();
    render(<ControlPanel open onClose={onClose} />);

    for (const [tab, title] of [
      ['profile', 'Profile'],
      ['data', 'Data Management'],
      ['event-logs', 'Event Logs'],
      ['cloud-providers', 'Cloud Providers'],
    ]) {
      await act(async () => {
        fireEvent.click(document.querySelector(`[data-testid="settings-row"][data-tab="${tab}"]`)!);
      });
      expect(screen.getByTestId('settings-title').textContent).toBe(title);
      expect(screen.queryByTestId('settings-list')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(screen.getByTestId('settings-title').textContent).toBe('Settings');
    }

    expect(onClose).not.toHaveBeenCalled();
  });

  it('the page content fills the phone width with 16 px sides and wraps long text', async () => {
    render(<ControlPanel open onClose={vi.fn()} />);

    await act(async () => {
      fireEvent.click(document.querySelector('[data-testid="settings-row"][data-tab="profile"]')!);
    });

    const wrapper = screen.getByTestId('page-profile').parentElement!;
    expect(wrapper.className).toContain('touch:p-4');
    expect(wrapper.className).toContain('touch:break-words');
  });
});
