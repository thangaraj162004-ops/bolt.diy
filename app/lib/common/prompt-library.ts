import { getEsbuildPreviewPrompt } from './prompts/esbuild-preview';
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

/**
 * The build prompt. There is one: esbuild-preview (browser-only React apps,
 * compiled in the browser). It covers both the artifact format and the native
 * project tools. Any promptId stored by older versions is ignored.
 */
export class PromptLibrary {
  static library: Record<
    string,
    {
      label: string;
      description: string;
      get: (options: PromptOptions) => string;
    }
  > = {
    [ESBUILD_PREVIEW_PROMPT_ID]: {
      label: 'Browser Preview (esbuild)',
      description: 'Browser-only React apps, compiled in the browser; no terminal or server',
      get: (options) => getEsbuildPreviewPrompt(options),
    },
  };

  /** The prompt to use for every build request: always esbuild-preview, whatever was requested or stored. */
  static resolvePromptId(_requested?: string): string {
    return ESBUILD_PREVIEW_PROMPT_ID;
  }

  static getPropmtFromLibrary(promptId: string, options: PromptOptions) {
    const prompt = this.library[promptId];

    if (!prompt) {
      throw 'Prompt Now Found';
    }

    return prompt.get(options);
  }
}
