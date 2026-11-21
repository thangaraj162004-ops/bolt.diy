/**
 * Tag and marker names used before the Bolt -> Ca rename. Saved chats (and
 * imported chat files) may still contain them; `upgradeLegacyTags` rewrites
 * them to the current names so the parser and renderer recognise them.
 * The rewrite is idempotent: text that is already upgraded is unchanged.
 */
const LEGACY_TAGS: ReadonlyArray<readonly [RegExp, string]> = [
  [/__boltArtifact__/g, '__caArtifact__'],
  [/__boltThought__/g, '__caThought__'],
  [/__boltQuickAction__/g, '__caQuickAction__'],
  [/__boltSelectedElement__/g, '__caSelectedElement__'],
  [/boltArtifact/g, 'caArtifact'],
  [/boltAction/g, 'caAction'],
  [/bolt_file_modifications/g, 'ca_file_modifications'],
  [/bolt_running_commands/g, 'ca_running_commands'],
  [/bolt_quick_actions/g, 'ca_quick_actions'],
  [/bolt-quick-action/g, 'ca-quick-action'],
];

const ANY_LEGACY =
  /bolt(?:Artifact|Action|_file_modifications|_running_commands|_quick_actions|-quick-action|Thought|QuickAction|SelectedElement)/;

export function hasLegacyTags(text: string): boolean {
  return ANY_LEGACY.test(text);
}

export function upgradeLegacyTags(text: string): string {
  if (!hasLegacyTags(text)) {
    return text;
  }

  return LEGACY_TAGS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}

/**
 * Rewrites the text of a stored message (v5+ `parts`, and a legacy v4
 * `content` string) when it still contains old tags. Other fields are kept.
 */
export function upgradeLegacyMessageTags<T>(message: T): T {
  if (!message || typeof message !== 'object') {
    return message;
  }

  const record = message as Record<string, unknown>;

  let changed = false;

  const next: Record<string, unknown> = { ...record };

  if (typeof record.content === 'string' && hasLegacyTags(record.content)) {
    next.content = upgradeLegacyTags(record.content);
    changed = true;
  }

  if (Array.isArray(record.parts)) {
    const parts = record.parts.map((part) => {
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        const text = (part as { text: string }).text;

        if (hasLegacyTags(text)) {
          changed = true;
          return { ...part, text: upgradeLegacyTags(text) };
        }
      }

      return part;
    });

    if (changed) {
      next.parts = parts;
    }
  }

  return changed ? (next as T) : message;
}
