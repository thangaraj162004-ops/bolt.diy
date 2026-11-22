import { getEsbuildPreviewPrompt } from './prompts/esbuild-preview';
import { getFineTunedPrompt } from './prompts/new-prompt';
import optimized from './prompts/optimized';
import { getProjectToolPrompt } from './prompts/project-tools';
import { getTinyTimPrompt } from './prompts/tiny-tim';
import type { DesignScheme } from '~/types/design-scheme';

/** The prompt used for every build request. */
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

  /** The prompt to use for every build request: always esbuild-preview, whatever was requested or stored. */
  static resolvePromptId(_requested?: string): string {
    return ESBUILD_PREVIEW_PROMPT_ID;
  }

  /** Prompts offered in settings: only the esbuild-preview prompt. */
  static getList() {
    return Object.entries(this.library)
      .filter(([key]) => key === ESBUILD_PREVIEW_PROMPT_ID)
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
