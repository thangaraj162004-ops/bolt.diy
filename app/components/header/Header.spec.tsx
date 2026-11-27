import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// the chat title component reads chat history (IndexedDB); not needed for the logo
vi.mock('~/lib/persistence/ChatDescription.client', () => ({ ChatDescription: () => null }));

// shown only after a chat starts; it loads the workbench store
vi.mock('./HeaderActionButtons.client', () => ({ HeaderActionButtons: () => null }));

const { Header } = await import('./Header');
import ChatAlert from '~/components/chat/ChatAlert';
import DeployChatAlert from '~/components/deploy/DeployAlert';

const OLD_BRAND = /\bCa\b|bolt\.diy|bolt\.new|StackBlitz/i;

describe('Header', () => {
  it('shows the CodeApp AI wordmark and no Bolt logo', () => {
    const { container } = render(<Header />);

    const wordmark = screen.getByTestId('brand-wordmark');
    expect(wordmark.getAttribute('aria-label')).toBe('CodeApp AI');
    expect(wordmark.textContent).toBe('CodeApp AI');
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.textContent).not.toMatch(OLD_BRAND);
    expect(container.innerHTML).not.toMatch(/logo-(light|dark)/);
  });
});

describe('Header on a phone', () => {
  it('has a 44 px menu button that opens the chat history', async () => {
    const { sidebarOpen } = await import('~/lib/stores/layout');
    sidebarOpen.set(false);
    render(<Header />);

    const [button] = screen.getAllByRole('button', { name: 'Open menu' });
    expect(button.className).toContain('max-md:w-11 max-md:h-11');

    fireEvent.click(button);
    expect(sidebarOpen.get()).toBe(true);
  });
});

describe('alerts', () => {
  it('the preview/terminal alert asks CodeApp AI, not Bolt', () => {
    const { container } = render(
      <ChatAlert
        alert={{ type: 'preview', title: 'Uncaught Exception', description: 'boom', content: 'x', source: 'preview' }}
        clearAlert={() => undefined}
        postMessage={() => undefined}
      />,
    );

    expect(screen.getByText('Ask CodeApp AI')).toBeTruthy();
    expect(container.textContent).toContain('Would you like CodeApp AI to analyze');
    expect(container.textContent).not.toMatch(OLD_BRAND);
  });

  it('the deploy alert asks CodeApp AI, not Bolt', () => {
    const { container } = render(
      <DeployChatAlert
        alert={{
          type: 'error',
          title: 'Build Failed',
          description: 'x',
          content: 'log',
          stage: 'building',
          source: 'netlify',
        }}
        clearAlert={() => undefined}
        postMessage={() => undefined}
      />,
    );

    expect(container.textContent).not.toMatch(OLD_BRAND);
    expect(container.textContent).toContain('Ask CodeApp AI');
  });
});
