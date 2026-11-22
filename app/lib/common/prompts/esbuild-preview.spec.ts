import { describe, expect, it } from 'vitest';
import {
  ESBUILD_ALLOWED_COMMANDS,
  ESBUILD_APPROVED_PACKAGES,
  LUCIDE_BRAND_ICONS,
  LUCIDE_REACT_VERSION,
  LUCIDE_VERIFIED_ICONS,
  getEsbuildPreviewPrompt,
} from './esbuild-preview';
import { withDevelopmentCommentaryWorkstyle } from '~/lib/.server/llm/prompt-workstyle';
import { ESBUILD_PREVIEW_PROMPT_ID, PromptLibrary, type PromptOptions } from '~/lib/common/prompt-library';
import { toEsmShUrl } from '~/lib/webcontainer/shim/preview/bare-imports';
import { buildProject, projectFilesFromRecord } from '~/lib/webcontainer/shim/preview/compiler';
import { MODIFICATIONS_TAG_NAME, WORK_DIR } from '~/utils/constants';
import { allowedHTMLElements } from '~/utils/markdown';

const OPTIONS: PromptOptions = {
  cwd: WORK_DIR,
  allowedHtmlElements: allowedHTMLElements,
  modificationTagName: MODIFICATIONS_TAG_NAME,
  supabase: { isConnected: false, hasSelectedProject: false },
};

/** Rough token count: about 4 characters per token for English prose and code. */
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const BANNED_WORDS = [/WebContainer/i, /StackBlitz/i, /\bNode(\.js)?\b/i];

/** filePath -> content of every file action in a prompt's examples. */
function exampleFiles(text: string) {
  return Object.fromEntries(
    [...text.matchAll(/<caAction type="file" filePath="([^"]+)">([\s\S]*?)<\/caAction>/g)].map((m) => [m[1], m[2]]),
  );
}

/** Bodies of every shell and start action in a prompt's examples. */
function commandsIn(text: string) {
  return [...text.matchAll(/<caAction type="(?:shell|start)">([\s\S]*?)<\/caAction>/g)].map((m) => m[1].trim());
}

describe('prompt selection', () => {
  it.each([undefined, '', 'default', 'tiny-tim', 'experimental-prompt', 'esbuild-preview'])(
    'every request uses esbuild-preview (requested %j)',
    (promptId) => {
      expect(PromptLibrary.resolvePromptId(promptId)).toBe(ESBUILD_PREVIEW_PROMPT_ID);
    },
  );

  it('esbuild-preview is the only prompt in the library', () => {
    expect(Object.keys(PromptLibrary.library)).toEqual([ESBUILD_PREVIEW_PROMPT_ID]);
  });
});

describe('esbuild-preview prompt', () => {
  const artifactPrompt = PromptLibrary.getPropmtFromLibrary(ESBUILD_PREVIEW_PROMPT_ID, OPTIONS);
  const toolPrompt = PromptLibrary.getPropmtFromLibrary(ESBUILD_PREVIEW_PROMPT_ID, { ...OPTIONS, projectTools: true });

  it('keeps the artifact format the app parses: file, shell and start actions', () => {
    expect(artifactPrompt).toContain('<caArtifact id="kebab-case-id" title="Short title">');
    expect(artifactPrompt).toContain('<caAction type="file" filePath="src/App.tsx">');
    expect(artifactPrompt).toContain('<caAction type="shell">npm install</caAction>');
    expect(artifactPrompt).toContain('<caAction type="start">npm run dev</caAction>');
  });

  it('names the assistant CodeApp AI in both versions, never Bolt', () => {
    expect(artifactPrompt.startsWith('You are CodeApp AI, a website and app builder')).toBe(true);
    expect(toolPrompt.startsWith('You are CodeApp AI,')).toBe(true);
    expect(artifactPrompt).not.toMatch(/\bCa\b/);
    expect(toolPrompt).not.toMatch(/\bCa\b/);
    expect(artifactPrompt).not.toMatch(/\bBolt\b/);
    expect(toolPrompt).not.toMatch(/\bBolt\b/);
  });

  it('keeps first versions simple and runs the dev server once, never a build', () => {
    for (const text of [
      'Never run "npm run build"',
      'Run "npm run dev" only once, at the end',
      'never run it again',
      'Keep the first version simple and small',
      'No sounds, confetti',
      'history',
      'themes',
      'single src/App.tsx where possible',
      'under about 150 lines',
    ]) {
      expect(artifactPrompt).toContain(text);
      expect(toolPrompt).toContain(text);
    }

    expect(toolPrompt).toContain('Start the preview with "npm run dev" once, at the end; never run "npm run build".');
    expect(commandsIn(artifactPrompt)).not.toContain('npm run build');
  });

  it('forbids brand icons, lists only verified icons and explains the one-write fix', () => {
    for (const text of [artifactPrompt, toolPrompt]) {
      expect(text).toContain(`lucide-react pinned to "${LUCIDE_REACT_VERSION}"`);
      expect(text).toContain(LUCIDE_VERIFIED_ICONS.join(', '));
      expect(text).toContain('Never import brand logos from lucide-react');

      for (const brand of LUCIDE_BRAND_ICONS.filter((name) => name !== 'X')) {
        expect(text).toContain(brand);
      }

      expect(text).toContain('or X as a logo');
      expect(text).toContain('For social links use a small inline <svg> or a plain text link');
      expect(text).toContain('does not provide an export named NAME');
      expect(text).toContain('rewrite the whole src/App.tsx in ONE file write');
      expect(text).toContain('do not use patch edits for this fix');
      expect(text).toContain('Keep every file small, so that rewriting a whole file is cheap');
    }

    expect(LUCIDE_VERIFIED_ICONS).toEqual([
      'Menu',
      'X',
      'Check',
      'Plus',
      'Minus',
      'Star',
      'Heart',
      'Phone',
      'Mail',
      'MapPin',
      'Clock',
      'ArrowRight',
      'ChevronDown',
      'Search',
      'User',
      'ShoppingBag',
      'Globe',
      'Share2',
    ]);
  });

  it('example code uses no brand icon and imports only verified lucide icons', () => {
    const files = exampleFiles(artifactPrompt);
    const code = Object.values(files).join('\n');

    expect(Object.keys(files)).toContain('src/App.tsx');

    for (const brand of LUCIDE_BRAND_ICONS) {
      expect(code).not.toMatch(new RegExp(`\\b${brand}\\b`));
    }

    const imported = [...code.matchAll(/import \{([^}]*)\} from 'lucide-react'/g)].flatMap((m) =>
      m[1].split(',').map((name) => name.trim()),
    );

    expect(imported.length).toBeGreaterThan(0);
    imported.forEach((name) => expect(LUCIDE_VERIFIED_ICONS).toContain(name));
  });

  it('example package.json pins the verified lucide-react version, which the shim loads from esm.sh', async () => {
    const files = exampleFiles(artifactPrompt);
    const packageJson = JSON.parse(files['package.json']);

    expect(packageJson.dependencies['lucide-react']).toBe(LUCIDE_REACT_VERSION);
    expect(toEsmShUrl('lucide-react', packageJson)).toBe(
      `https://esm.sh/lucide-react@${LUCIDE_REACT_VERSION}?deps=react@18.3.1,react-dom@18.3.1`,
    );

    const result = await buildProject({ files: projectFilesFromRecord(files) });
    expect(result.js).toContain(`https://esm.sh/lucide-react@${LUCIDE_REACT_VERSION}?deps=`);
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
    ['artifact prompt with the build-mode workstyle', () => withDevelopmentCommentaryWorkstyle(artifactPrompt)],
    ['tool prompt with the build-mode workstyle', () => withDevelopmentCommentaryWorkstyle(toolPrompt)],
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

  it('the build-mode workstyle names the browser preview', () => {
    expect(withDevelopmentCommentaryWorkstyle('Build mode')).toContain('lightweight in the browser preview:');
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

    console.info(`[prompt size] esbuild artifact ≈ ${artifactTokens} tokens, esbuild tool ≈ ${toolTokens} tokens`);

    expect(artifactTokens).toBeLessThan(3000);
    expect(toolTokens).toBeLessThan(3500);
  });
});
