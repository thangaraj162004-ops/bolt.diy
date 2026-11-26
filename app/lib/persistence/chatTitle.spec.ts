import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { chatTitle, isPlaceholderTitle, isPlaceholderUrlId, sidebarEntry, titleFromMessages } from './chatTitle';

const user = (text: string, flags?: string[]): UIMessage =>
  ({ id: text, role: 'user', parts: [{ type: 'text', text }], metadata: flags ? { flags } : undefined }) as UIMessage;

const assistant = (text: string): UIMessage => ({
  id: `a-${text}`,
  role: 'assistant',
  parts: [{ type: 'text', text }],
});

describe('titleFromMessages', () => {
  it('uses the first user message without the model and provider prefix', () => {
    expect(
      titleFromMessages([
        user('[Model: gemini-2.5-flash]\n\n[Provider: Google]\n\nmake a simple landing page'),
        assistant('Done'),
        user('now make it blue'),
      ]),
    ).toBe('make a simple landing page');
  });

  it('skips hidden messages (the snapshot restore) and removes markup', () => {
    expect(
      titleFromMessages([
        user('Restore project from snapshot', ['no-store', 'hidden']),
        user('change <div class="__caSelectedElement__" data-element="x"></div> the   header'),
      ]),
    ).toBe('change the header');
  });

  it('shortens long messages', () => {
    const title = titleFromMessages([user('a'.repeat(200))])!;
    expect(title).toHaveLength(60);
    expect(title.endsWith('…')).toBe(true);
  });

  it('is undefined without a user message', () => {
    expect(titleFromMessages([assistant('hello')])).toBeUndefined();
  });
});

describe('chatTitle', () => {
  const messages = [user('make a simple landing page')];

  it('keeps a real title', () => {
    expect(chatTitle('My shop', messages, 'Artifact')).toBe('My shop');
  });

  it('prefers the first user message over the artifact title for a new chat', () => {
    expect(chatTitle(undefined, messages, 'Landing page')).toBe('make a simple landing page');
  });

  it('replaces the restore placeholder and keeps "(fork)"', () => {
    expect(chatTitle('Restored Project & Setup', messages)).toBe('make a simple landing page');
    expect(chatTitle('Restored Project & Setup (fork)', messages)).toBe('make a simple landing page (fork)');
    expect(chatTitle('Restored Project & Setup (fork) (fork)', messages)).toBe(
      'make a simple landing page (fork) (fork)',
    );
  });

  it('never uses the restore artifact title', () => {
    expect(chatTitle(undefined, [], 'Restored Project & Setup')).toBeUndefined();
    expect(chatTitle(undefined, [], 'Landing page')).toBe('Landing page');
  });
});

describe('placeholders', () => {
  it('knows the restore title and link id', () => {
    expect(isPlaceholderTitle('Restored Project & Setup (fork)')).toBe(true);
    expect(isPlaceholderTitle('Landing page')).toBe(false);
    expect(isPlaceholderUrlId('restored-project-setup')).toBe(true);
    expect(isPlaceholderUrlId('restored-project-setup-2')).toBe(true);
    expect(isPlaceholderUrlId(undefined)).toBe(true);
    expect(isPlaceholderUrlId('landing-page')).toBe(false);
  });
});

describe('sidebarEntry', () => {
  it('shows a chat saved without a title or link id (it used to be hidden)', () => {
    expect(sidebarEntry({ id: '12', messages: [user('make a simple landing page')] })).toEqual(
      expect.objectContaining({ id: '12', urlId: '12', description: 'make a simple landing page' }),
    );
  });

  it('links a chat with the shared restore id by its own id, and fixes its title', () => {
    expect(
      sidebarEntry({
        id: '9',
        urlId: 'restored-project-setup',
        description: 'Restored Project & Setup',
        messages: [user('portfolio site')],
      }),
    ).toEqual(expect.objectContaining({ urlId: '9', description: 'portfolio site' }));
  });

  it('keeps good entries as they are and hides empty chats', () => {
    const good = { id: '1', urlId: 'landing-page', description: 'Landing page', messages: [user('x')] };

    expect(sidebarEntry(good)).toEqual(good);
    expect(sidebarEntry({ id: '2', messages: [] })).toBeUndefined();
  });
});
