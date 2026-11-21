import { describe, expect, it } from 'vitest';
import { migrateChatMessages } from './db';
import { hasLegacyTags, upgradeLegacyMessageTags, upgradeLegacyTags } from './legacyTags';
import { migrateLegacyMessages } from './messageMigration';
import type { ChatHistoryItem } from './useChatHistory';
import { EnhancedStreamingMessageParser } from '~/lib/runtime/enhanced-message-parser';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';

/* Chats saved before the Bolt -> Ca rename contain the old tag names. */

const OLD_ASSISTANT_TEXT = `Here is your app.

<boltArtifact id="counter" title="Counter">
<boltAction type="file" filePath="src/App.tsx">export default function App() { return <h1>hi</h1>; }</boltAction>
<boltAction type="start">npm run dev</boltAction>
</boltArtifact>`;

const OLD_USER_TEXT = `<bolt_file_modifications>diff</bolt_file_modifications>Fix it<div class="__boltSelectedElement__" data-element="x"></div>`;

describe('upgradeLegacyTags', () => {
  it('rewrites the old artifact and action tags', () => {
    const upgraded = upgradeLegacyTags(OLD_ASSISTANT_TEXT);

    expect(upgraded).toContain('<caArtifact id="counter" title="Counter">');
    expect(upgraded).toContain('<caAction type="file" filePath="src/App.tsx">');
    expect(upgraded).toContain('</caAction>');
    expect(upgraded).toContain('</caArtifact>');
    expect(hasLegacyTags(upgraded)).toBe(false);
  });

  it('rewrites the other stored markers', () => {
    expect(upgradeLegacyTags(OLD_USER_TEXT)).toBe(
      '<ca_file_modifications>diff</ca_file_modifications>Fix it<div class="__caSelectedElement__" data-element="x"></div>',
    );
    expect(
      upgradeLegacyTags(
        '<bolt-quick-actions><bolt-quick-action type="message">x</bolt-quick-action></bolt-quick-actions>',
      ),
    ).toBe('<ca-quick-actions><ca-quick-action type="message">x</ca-quick-action></ca-quick-actions>');
    expect(upgradeLegacyTags('<div class="__boltThought__">t</div>')).toBe('<div class="__caThought__">t</div>');
  });

  it('is idempotent and leaves other text alone', () => {
    const once = upgradeLegacyTags(OLD_ASSISTANT_TEXT);

    expect(upgradeLegacyTags(once)).toBe(once);
    expect(upgradeLegacyTags('A thunderbolt and bolt.diy stay as they are')).toBe(
      'A thunderbolt and bolt.diy stay as they are',
    );
  });
});

describe('upgradeLegacyMessageTags', () => {
  it('rewrites text parts and keeps other parts and fields', () => {
    const fileData = { type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,AAAA' };

    const message = {
      id: 'a1',
      role: 'assistant',
      metadata: { model: 'm' },
      parts: [{ type: 'text', text: OLD_ASSISTANT_TEXT }, fileData],
    };

    const upgraded = upgradeLegacyMessageTags(message);

    expect(upgraded).not.toBe(message);
    expect(upgraded.parts[0]).toEqual({ type: 'text', text: upgradeLegacyTags(OLD_ASSISTANT_TEXT) });
    expect(upgraded.parts[1]).toBe(fileData);
    expect(upgraded.metadata).toBe(message.metadata);
    expect(JSON.stringify(message.parts[0])).toContain('boltArtifact'); // the input is not mutated
  });

  it('returns the same object when there is nothing to change', () => {
    const message = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hello' }] };
    expect(upgradeLegacyMessageTags(message)).toBe(message);
  });
});

describe('loading an old saved chat', () => {
  it('converts stored v5 and v4 messages so the real parser finds the artifact', () => {
    const chat = {
      id: '1',
      urlId: '1',
      description: 'old chat',
      timestamp: '2025-01-01T00:00:00.000Z',
      messages: [
        { id: 'u1', role: 'user', parts: [{ type: 'text', text: OLD_USER_TEXT }] },
        { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: OLD_ASSISTANT_TEXT }] },
        { id: 'a2', role: 'assistant', content: OLD_ASSISTANT_TEXT },
      ],
    } as unknown as ChatHistoryItem;

    const loaded = migrateChatMessages(chat);

    const texts = loaded.messages.map((message) =>
      (message as { parts: Array<{ type: string; text?: string }> }).parts.map((part) => part.text ?? '').join(''),
    );

    texts.forEach((text) => expect(hasLegacyTags(text)).toBe(false));
    expect(texts[0]).toContain('<ca_file_modifications>');

    for (const text of texts.slice(1)) {
      const actions: ActionCallbackData[] = [];

      const parser = new EnhancedStreamingMessageParser({
        callbacks: { onActionOpen: () => undefined, onActionClose: (data) => actions.push(data) },
      });
      parser.parse('m', text, true);

      expect(actions.map((data) => data.action.type)).toEqual(['file', 'start']);
      expect(actions[0].action).toMatchObject({ filePath: 'src/App.tsx' });
    }
  });

  it('is part of migrateLegacyMessages, which the chat store and MCP service use', () => {
    const [message] = migrateLegacyMessages([
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: OLD_ASSISTANT_TEXT }] },
    ]);
    expect(JSON.stringify(message)).toContain('caArtifact');
    expect(JSON.stringify(message)).not.toContain('boltArtifact');
  });
});
