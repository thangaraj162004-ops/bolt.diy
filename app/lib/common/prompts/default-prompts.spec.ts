import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderDefaultPromptVariants } from './__fixtures__/prompt-variants';
import { upgradeLegacyTags } from '~/lib/persistence/legacyTags';

/*
 * The default-engine prompts must stay word-for-word. The only allowed change
 * is the Bolt -> Ca rename of the shared tags (boltArtifact -> caArtifact, ...),
 * which the parser and the esbuild prompt share. `pre-rename-prompts/` holds
 * the prompts exactly as they were before that rename.
 */

const FROZEN_DIR = join(process.cwd(), 'app/lib/common/prompts/__fixtures__/pre-rename-prompts');

const frozen = Object.fromEntries(
  readdirSync(FROZEN_DIR)
    .filter((name) => name.endsWith('.txt'))
    .map((name) => [name.replace(/\.txt$/, ''), readFileSync(join(FROZEN_DIR, name), 'utf-8')]),
);

const current = renderDefaultPromptVariants();

describe('default-engine prompts after the tag rename', () => {
  it('covers every prompt variant', () => {
    expect(Object.keys(current).sort()).toEqual(Object.keys(frozen).sort());
    expect(Object.keys(current).length).toBeGreaterThanOrEqual(14);
  });

  it.each(Object.keys(frozen).sort())('%s equals the previous prompt with only the tags renamed', (name) => {
    expect(current[name]).toBe(upgradeLegacyTags(frozen[name]));
  });

  it('really renamed the tags (the previous prompts used the old ones)', () => {
    expect(frozen['default-artifact']).toContain('<boltArtifact');
    expect(current['default-artifact']).toContain('<caArtifact');
    expect(current['default-artifact']).not.toMatch(/boltArtifact|boltAction/);

    // everything else is untouched, including the assistant's name in these prompts
    expect(current['default-artifact']).toContain('You are Bolt, an expert AI assistant');
  });
});
