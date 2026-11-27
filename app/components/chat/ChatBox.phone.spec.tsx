import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The real provider/model picker and API key row are replaced with small
 * stand-ins: this test checks that the phone chat box puts them behind the
 * model chip, in the bottom sheet, wired to the same props.
 */
vi.mock('~/components/chat/ModelSelector', () => ({
  ModelSelector: (props: { provider?: { name: string }; setProvider?: (p: { name: string }) => void }) => (
    <div data-testid="model-selector">
      <span>provider {props.provider?.name}</span>
      <button type="button" onClick={() => props.setProvider?.({ name: 'Google' })}>
        Pick Google
      </button>
    </div>
  ),
}));
vi.mock('./APIKeyManager', () => ({
  APIKeyManager: (props: { provider: { name: string }; setApiKey: (key: string) => void }) => (
    <div data-testid="api-key-row">
      {props.provider.name} API Key
      <button type="button" onClick={() => props.setApiKey('free-google-key')}>
        Save key
      </button>
    </div>
  ),
}));
vi.mock('./MCPTools', () => ({ McpTools: () => null }));
vi.mock('./SupabaseConnection', () => ({ SupabaseConnection: () => null }));
vi.mock('~/components/workbench/ExpoQrModal', () => ({ ExpoQrModal: () => null }));

const { ChatBox } = await import('./ChatBox');

afterEach(cleanup);

function renderChatBox(overrides: Record<string, unknown> = {}) {
  const props = {
    isModelSettingsCollapsed: false,
    setIsModelSettingsCollapsed: vi.fn(),
    provider: { name: 'Anthropic' },
    providerList: [{ name: 'Anthropic' }, { name: 'Google' }],
    modelList: [],
    apiKeys: {},
    isModelLoading: undefined,
    onApiKeysChange: vi.fn(),
    uploadedFiles: [],
    imageDataList: [],
    textareaRef: { current: null },
    input: '',
    handlePaste: vi.fn(),
    TEXTAREA_MIN_HEIGHT: 44,
    TEXTAREA_MAX_HEIGHT: 112,
    isStreaming: false,
    handleSendMessage: vi.fn(),
    isListening: false,
    startListening: vi.fn(),
    stopListening: vi.fn(),
    chatStarted: false,
    qrModalOpen: false,
    setQrModalOpen: vi.fn(),
    handleFileUpload: vi.fn(),
    setProvider: vi.fn(),
    model: 'claude-3-5-sonnet',
    setModel: vi.fn(),
    ...overrides,
  };

  render(<ChatBox {...(props as any)} />);

  return props;
}

describe('ChatBox on a phone', () => {
  it('hides the inline provider, model and key row below 768 px and keeps them on desktop', () => {
    renderChatBox();

    const inline = screen.getByTestId('model-selector').parentElement!;
    expect(inline.className).toContain('touch:hidden');
    expect(inline.className).not.toContain('mouse:hidden ');
    expect(screen.getByTestId('model-chip').className).toContain('mouse:hidden');
  });

  it('starts as a one-line text box that grows to about four lines', () => {
    renderChatBox();

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.rows).toBe(1);
    expect(textarea.style.minHeight).toBe('44px');
    expect(textarea.style.maxHeight).toBe('112px');
  });

  it('the model chip shows the model and opens a sheet with provider, model and API key', async () => {
    const props = renderChatBox();

    const chip = screen.getByTestId('model-chip');
    expect(chip.textContent).toContain('claude-3-5-sonnet');
    expect(chip.getAttribute('aria-label')).toBe('Model: claude-3-5-sonnet');
    expect(chip.className).toContain('min-h-11');
    expect(screen.queryByTestId('model-sheet')).toBeNull();

    await act(async () => {
      fireEvent.click(chip);
    });

    const sheet = await screen.findByTestId('model-sheet');
    expect(sheet.textContent).toContain('Model and API key');
    expect(sheet.querySelector('[data-testid="model-selector"]')).toBeTruthy();
    expect(sheet.querySelector('[data-testid="api-key-row"]')).toBeTruthy();
    expect(sheet.textContent).toContain('Tool approval');

    // the controls in the sheet still work: pick Google and set its (free) key
    const sheetButtons = (name: string) =>
      [...sheet.querySelectorAll('button')].find((button) => button.textContent?.trim() === name)!;
    fireEvent.click(sheetButtons('Pick Google'));
    expect(props.setProvider).toHaveBeenCalledWith({ name: 'Google' });
    fireEvent.click(sheetButtons('Save key'));
    expect(props.onApiKeysChange).toHaveBeenCalledWith('Anthropic', 'free-google-key');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    });
    expect(screen.queryByTestId('model-sheet')).toBeNull();
  });

  it('every chat box button is at least 44 px on a phone', () => {
    renderChatBox({ input: 'hello' });

    expect(screen.getByRole('button', { name: 'Send message' }).className).toContain('touch:w-11 touch:h-11');
    expect(screen.getByRole('button', { name: /^Mode:/ }).className).toContain('touch:min-h-11 touch:min-w-11');
  });
});
