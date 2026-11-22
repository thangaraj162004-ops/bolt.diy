import { describe, expect, it } from 'vitest';
import { ESBUILD_PREVIEW_PROMPT_ID, PromptLibrary } from '~/lib/common/prompt-library';

describe('native tool prompt', () => {
  const options = { cwd: '/home/project', allowedHtmlElements: [], modificationTagName: 'modifications' };

  it('uses one execution protocol and respects simple requests', () => {
    const prompt = PromptLibrary.getPropmtFromLibrary(ESBUILD_PREVIEW_PROMPT_ID, {
      ...options,
      projectTools: true,
      supabase: { isConnected: true, hasSelectedProject: true },
    });
    expect(prompt).toContain('Use the supplied native tools interface');
    expect(prompt).toContain('A simple or minimal page should stay simple');
    expect(prompt).not.toContain('<caArtifact');
    expect(prompt).not.toContain('<caAction');
    expect(prompt).not.toContain('bespoke masterpieces');
    expect(prompt).toContain('row-level security');
    expect(prompt).not.toMatch(/WebContainer|\bBolt\b/);
  });

  it('keeps the artifact format for builds without the agent tools', () => {
    expect(PromptLibrary.getPropmtFromLibrary(ESBUILD_PREVIEW_PROMPT_ID, options)).toContain('<caArtifact');
  });
});
