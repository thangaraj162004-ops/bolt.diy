import { describe, expect, it } from 'vitest';
import { discussPrompt } from './discuss-prompt';

describe('discuss-mode prompt', () => {
  const prompt = discussPrompt();

  it('never mentions WebContainer, StackBlitz, a terminal or a shell', () => {
    expect(prompt).not.toMatch(/WebContainer|StackBlitz|terminal|shell|\bzsh\b|Node\.js/i);
  });

  it('describes the browser-only environment', () => {
    expect(prompt).toContain('<environment>');
    expect(prompt).toContain("compiled in the user's browser by esbuild");
    expect(prompt).toContain('never ask the user to run commands');
  });

  it('keeps the plan and quick-action formats the app parses', () => {
    expect(prompt).toContain('## The Plan');
    expect(prompt).toContain('<ca-quick-actions>');
    expect(prompt).toContain('<ca-quick-action type="implement"');
    expect(prompt).toContain('<ca-quick-action type="file" path="src/App.tsx">');
  });

  it('points to no outside product support pages', () => {
    expect(prompt).not.toMatch(/support\.bolt\.new|\bBolt\b/);
  });
});
