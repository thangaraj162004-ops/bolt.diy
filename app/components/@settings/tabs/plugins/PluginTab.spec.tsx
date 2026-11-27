import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadMarketplace = vi.fn(async () => ({ plugins: [], fetchedAt: 0 }));
const initialize = vi.fn(async () => undefined);

vi.mock('~/lib/plugins/service', () => ({
  createDraftManifest: vi.fn(),
  exportPluginDraft: vi.fn(),
  fetchMarketplaceChangelog: vi.fn(),
  installFromMarketplace: vi.fn(),
  installLocalPackage: vi.fn(),
  loadMarketplace,
  getPluginUpdates: () => [],
}));

// the installed plugins live in IndexedDB; not needed here
vi.mock('~/lib/stores/plugins', () => {
  const state = {
    plugins: [],
    busy: false,
    error: null,
    logs: [],
    initialize,
    setEnabled: vi.fn(),
    setConfiguration: vi.fn(),
    uninstall: vi.fn(),
    rollback: vi.fn(),
    loadLogs: vi.fn(),
  };

  return { usePluginStore: (select: (value: typeof state) => unknown) => select(state) };
});

const { default: PluginTab } = await import('./PluginTab');
const { PLUGINS_ENABLED } = await import('~/lib/plugins/flags');
const { TAB_DESCRIPTIONS } = await import('~/components/@settings/core/constants');

afterEach(() => {
  cleanup();
  loadMarketplace.mockClear();
  initialize.mockClear();
});

describe('Settings > Plugins', () => {
  it('the marketplace flag is off by default', () => {
    expect(PLUGINS_ENABLED).toBe(false);
    expect(TAB_DESCRIPTIONS.plugins).toBe('Plugins are coming soon');
  });

  it('shows only "Plugins are coming soon." and fetches nothing', async () => {
    const { container } = render(<PluginTab />);
    await act(async () => undefined);

    expect(screen.getByTestId('plugins-coming-soon').textContent).toBe('Plugins are coming soon.');
    expect(loadMarketplace).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();

    // no demo plugins and no developer buttons on the public screen
    expect(container.textContent).not.toMatch(
      /Bolt|Demo Plugin|Example Plugin|Theme Plugin|Text Utilities|Develop Plugin|Install Plugin|Marketplace/,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('the marketplace code is still there behind the flag', async () => {
    render(<PluginTab enabled />);
    await act(async () => undefined);

    expect(loadMarketplace).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Plugin Marketplace')).toBeTruthy();
    expect(screen.queryByTestId('plugins-coming-soon')).toBeNull();
  });
});
