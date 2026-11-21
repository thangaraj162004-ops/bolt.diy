import { getEsbuildPreviewPrompt } from './prompts/esbuild-preview';
import { getFineTunedPrompt } from './prompts/new-prompt';
import optimized from './prompts/optimized';
import { getProjectToolPrompt } from './prompts/project-tools';
import { getTinyTimPrompt } from './prompts/tiny-tim';
import { PREVIEW_ENGINE, type PreviewEngine } from '~/lib/webcontainer/engine';
import type { DesignScheme } from '~/types/design-scheme';

/** The prompt used for every build request when the preview engine is esbuild. */
export const ESBUILD_PREVIEW_PROMPT_ID = 'esbuild-preview';

export interface PromptOptions {
  cwd: string;
  allowedHtmlElements: string[];
  modificationTagName: string;
  designScheme?: DesignScheme;
  projectTools?: boolean;
  supabase?: {
    isConnected: boolean;
    hasSelectedProject: boolean;
    credentials?: {
      anonKey?: string;
      supabaseUrl?: string;
    };
  };
}

export class PromptLibrary {
  static library: Record<
    string,
    {
      label: string;
      description: string;
      get: (options: PromptOptions) => string;
    }
  > = {
    default: {
      label: 'Default Prompt',
      description: 'Optimized prompt with improved tool usage and error recovery',
      get: (options) =>
        options.projectTools
          ? getProjectToolPrompt(options)
          : getFineTunedPrompt(options.cwd, options.supabase, options.designScheme),
    },
    'tiny-tim': {
      label: 'Tiny Tim',
      description: 'Optimized for small models with terse format and modern 2026 standards',
      get: (options) => getTinyTimPrompt(options.cwd, options.supabase, options.designScheme),
    },
    'experimental-prompt': {
      label: 'Experimental Prompt',
      description: 'Experimental version of the prompt for lower token usage',
      get: (options) => optimized(options),
    },
    [ESBUILD_PREVIEW_PROMPT_ID]: {
      label: 'Browser Preview (esbuild)',
      description: 'For the in-browser esbuild preview: browser-only React apps, no terminal or server',
      get: (options) => getEsbuildPreviewPrompt(options),
    },
  };

  /**
   * The prompt to use for a request. With the esbuild engine every request uses
   * the esbuild-preview prompt (the others assume a terminal and a server). With
   * the default engine the requested prompt is used exactly as before, and the
   * esbuild-preview prompt cannot be selected. The engine is fixed at build time.
   */
  static resolvePromptId(requested: string | undefined, engine: PreviewEngine = PREVIEW_ENGINE): string {
    if (engine === 'esbuild') {
      return ESBUILD_PREVIEW_PROMPT_ID;
    }

    return !requested || requested === ESBUILD_PREVIEW_PROMPT_ID ? 'default' : requested;
  }

  /** Prompts offered in settings: only the esbuild-preview prompt with that engine, all others otherwise. */
  static getList(engine: PreviewEngine = PREVIEW_ENGINE) {
    return Object.entries(this.library)
      .filter(([key]) => (engine === 'esbuild') === (key === ESBUILD_PREVIEW_PROMPT_ID))
      .map(([key, value]) => {
        const { label, description } = value;
        return {
          id: key,
          label,
          description,
        };
      });
  }
  static getPropmtFromLibrary(promptId: string, options: PromptOptions) {
    const prompt = this.library[promptId];

    if (!prompt) {
      throw 'Prompt Now Found';
    }

    return this.library[promptId]?.get(options);
  }
}
