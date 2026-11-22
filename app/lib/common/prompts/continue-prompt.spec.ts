import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTINUE_PROMPT } from './continue-prompt';
import { upgradeLegacyTags } from '~/lib/persistence/legacyTags';

/*
 * The continue prompt is the one earlier prompt that is still used. It must stay
 * word for word as it was before the tag rename (see pre-rename-prompts/).
 * The other frozen prompts were removed with their prompt files.
 */

const FROZEN = join(process.cwd(), 'app/lib/common/prompts/__fixtures__/pre-rename-prompts/continue-system.txt');

describe('continue prompt', () => {
  it('is unchanged', () => {
    expect(CONTINUE_PROMPT).toBe(upgradeLegacyTags(readFileSync(FROZEN, 'utf-8')));
  });
});
