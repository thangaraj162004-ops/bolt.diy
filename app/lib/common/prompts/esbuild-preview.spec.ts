import { describe, expect, it } from 'vitest';
import { ESBUILD_ALLOWED_COMMANDS, ESBUILD_APPROVED_PACKAGES, getEsbuildPreviewPrompt } from './esbuild-preview';
import { getFineTunedPrompt } from './new-prompt';
import optimized from './optimized';
import { getProjectToolPrompt } from './project-tools';
import { getTinyTimPrompt } from './tiny-tim';
import { withDevelopmentCommentaryWorkstyle } from '~/lib/.server/llm/prompt-workstyle';
import { ESBUILD_PREVIEW_PROMPT_ID, PromptLibrary, type PromptOptions } from '~/lib/common/prompt-library';
import { MODIFICATIONS_TAG_NAME, WORK_DIR } from '~/utils/constants';
import { allowedHTMLElements } from '~/utils/markdown';

const OPTIONS: PromptOptions = {
  cwd: WORK_DIR,
  allowedHtmlElements: allowedHTMLElements,
  modificationTagName: MODIFICATIONS_TAG_NAME,
  supabase: { isConnected: false, hasSelectedProject: false },
};

/** How stream-text chose the prompt before this change. */
const previousChoice = (promptId: string | undefined) => promptId || 'default';

/** Rough token count: about 4 characters per token for English prose and code. */
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const BANNED_WORDS = [/WebContainer/i, /StackBlitz/i, /\bNode(\.js)?\b/i];

/** Bodies of every shell and start action in a prompt's examples. */
function commandsIn(text: string) {
  return [...text.matchAll(/<boltAction type="(?:shell|start)">([\s\S]*?)<\/boltAction>/g)].map((m) => m[1].trim());
}

describe('prompt selection', () => {
  it.each([undefined, '', 'default', 'tiny-tim', 'experimental-prompt'])(
    'the default engine keeps the previous choice for %j',
    (promptId) => {
      expect(PromptLibrary.resolvePromptId(promptId, 'webcontainer')).toBe(previousChoice(promptId));
    },
  );

  it('the default engine produces exactly the same prompt text as before', () => {
    const resolve = (id: string | undefined) => PromptLibrary.resolvePromptId(id, 'webcontainer');

    expect(PromptLibrary.getPropmtFromLibrary(resolve(undefined), OPTIONS)).toBe(
      getFineTunedPrompt(OPTIONS.cwd, OPTIONS.supabase, OPTIONS.designScheme),
    );
    expect(PromptLibrary.getPropmtFromLibrary(resolve('default'), { ...OPTIONS, projectTools: true })).toBe(
      getProjectToolPrompt({ ...OPTIONS, projectTools: true }),
    );
    expect(PromptLibrary.getPropmtFromLibrary(resolve('tiny-tim'), OPTIONS)).toBe(
      getTinyTimPrompt(OPTIONS.cwd, OPTIONS.supabase, OPTIONS.designScheme),
    );
    expect(PromptLibrary.getPropmtFromLibrary(resolve('experimental-prompt'), OPTIONS)).toBe(optimized(OPTIONS));
  });

  it('the default engine cannot select the esbuild prompt', () => {
    expect(PromptLibrary.resolvePromptId(ESBUILD_PREVIEW_PROMPT_ID, 'webcontainer')).toBe('default');
    expect(PromptLibrary.getList('webcontainer').map((prompt) => prompt.id)).toEqual([
      'default',
      'tiny-tim',
      'experimental-prompt',
    ]);
  });

  it.each([undefined, 'default', 'tiny-tim', 'experimental-prompt'])(
    'the esbuild engine always selects esbuild-preview (requested %j)',
    (promptId) => {
      expect(PromptLibrary.resolvePromptId(promptId, 'esbuild')).toBe('esbuild-preview');
    },
  );

  it('settings list only the esbuild prompt with the esbuild engine', () => {
    expect(PromptLibrary.getList('esbuild').map((prompt) => prompt.id)).toEqual(['esbuild-preview']);
  });

  it('the build default (no VITE_PREVIEW_ENGINE in tests) is the WebContainer engine', () => {
    expect(PromptLibrary.resolvePromptId(undefined)).toBe('default');
  });
});

describe('esbuild-preview prompt', () => {
  const artifactPrompt = PromptLibrary.getPropmtFromLibrary(ESBUILD_PREVIEW_PROMPT_ID, OPTIONS);
  const toolPrompt = PromptLibrary.getPropmtFromLibrary(ESBUILD_PREVIEW_PROMPT_ID, { ...OPTIONS, projectTools: true });

  it('keeps the artifact format the app parses: file, shell and start actions', () => {
    expect(artifactPrompt).toContain('<boltArtifact id="kebab-case-id" title="Short title">');
    expect(artifactPrompt).toContain('<boltAction type="file" filePath="src/App.tsx">');
    expect(artifactPrompt).toContain('<boltAction type="shell">npm install</boltAction>');
    expect(artifactPrompt).toContain('<boltAction type="start">npm run dev</boltAction>');
  });

  it('names the assistant CodeApp AI in both versions, never Bolt', () => {
    expect(artifactPrompt.startsWith('You are CodeApp AI, a website and app builder')).toBe(true);
    expect(toolPrompt.startsWith('You are CodeApp AI,')).toBe(true);
    expect(artifactPrompt).not.toMatch(/\bCa\b/);
    expect(toolPrompt).not.toMatch(/\bCa\b/);

    // the default engine's prompts keep their original wording
    expect(getProjectToolPrompt(OPTIONS).startsWith('You are Bolt,')).toBe(true);
    expect(getFineTunedPrompt()).toContain('You are Bolt');
  });

  it('every shell and start action it shows is one of the allowed commands', () => {
    const commands = commandsIn(artifactPrompt);

    expect(commands.length).toBeGreaterThan(0);
    commands.forEach((command) => expect(ESBUILD_ALLOWED_COMMANDS).toContain(command));
  });

  it('states the environment rules', () => {
    for (const text of [
      'There is no terminal and no server',
      "compiled in the user's browser by esbuild",
      'Next.js, Express',
      '"18.3.1"',
      '<div id="root"></div>',
      'src/main.tsx',
      'src/index.css',
      'The only commands that work are "npm install" and "npm run dev"',
      'no cd, ls, rm, mkdir, cat, git, npx, curl',
      'esm.sh',
      ESBUILD_APPROVED_PACKAGES.join(', '),
      '@tailwind base;\n  @tailwind components;\n  @tailwind utilities;',
      'Do not create vite.config, tailwind.config, postcss.config',
      'Do not use CSS modules',
      'no file over 200 KB',
      'import.meta.env.VITE_SUPABASE_URL',
      'import.meta.env.VITE_SUPABASE_ANON_KEY',
      'fall back to local demo data',
      'Never put a service_role key',
      'hosted payment link',
      'Every import must resolve to a file in the project',
      MODIFICATIONS_TAG_NAME,
      'Keep answers short',
    ]) {
      expect(artifactPrompt).toContain(text);
    }
  });

  it.each([
    ['artifact prompt', () => artifactPrompt],
    ['tool prompt', () => toolPrompt],
    [
      'artifact prompt with the build-mode workstyle',
      () => withDevelopmentCommentaryWorkstyle(artifactPrompt, 'esbuild'),
    ],
    ['tool prompt with the build-mode workstyle', () => withDevelopmentCommentaryWorkstyle(toolPrompt, 'esbuild')],
  ])('the %s mentions none of WebContainer, StackBlitz or Node', (_label, get) => {
    const text = get();

    for (const banned of BANNED_WORDS) {
      expect(text).not.toMatch(banned);
    }
  });

  it('the tool prompt keeps the tool protocol but limits commands to the two allowed ones', () => {
    expect(toolPrompt).toContain('<project_mcp_workflow>');
    expect(toolPrompt).toContain('project_patch_file');
    expect(toolPrompt).toContain('With project_run_command, run only "npm install" or "npm run dev"');
    expect(toolPrompt).toContain('<environment>');
    expect(toolPrompt).not.toContain('Prefer Vite for a new web project');
  });

  it('the build-mode workstyle is unchanged for the default engine', () => {
    const base = getFineTunedPrompt();
    expect(withDevelopmentCommentaryWorkstyle(base, 'webcontainer')).toBe(withDevelopmentCommentaryWorkstyle(base));
    expect(withDevelopmentCommentaryWorkstyle(base, 'webcontainer')).toContain('lightweight in WebContainer:');
    expect(withDevelopmentCommentaryWorkstyle(base, 'esbuild')).toContain('lightweight in the browser preview:');
  });

  it('includes the design scheme when given', () => {
    const designScheme = {
      palette: { primary: '#123456' },
      features: [],
      font: [],
    } as unknown as PromptOptions['designScheme'];
    expect(getEsbuildPreviewPrompt({ ...OPTIONS, designScheme })).toContain('#123456');
  });

  it('stays under a sensible size (token estimate)', () => {
    const artifactTokens = estimateTokens(artifactPrompt);
    const toolTokens = estimateTokens(toolPrompt);
    const defaultTokens = estimateTokens(getFineTunedPrompt());

    console.info(
      `[prompt size] esbuild artifact ≈ ${artifactTokens} tokens, esbuild tool ≈ ${toolTokens} tokens, default ≈ ${defaultTokens} tokens`,
    );

    expect(artifactTokens).toBeLessThan(3000);
    expect(toolTokens).toBeLessThan(3500);
    expect(artifactTokens).toBeLessThan(defaultTokens);
  });
});
