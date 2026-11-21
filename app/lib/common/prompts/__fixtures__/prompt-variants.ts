/**
 * Every default-engine prompt variant, rendered with fixed options. Used to
 * prove a rename changed only the shared tag names (see default-prompts.spec.ts).
 */
import { withDevelopmentCommentaryWorkstyle } from '~/lib/.server/llm/prompt-workstyle';
import { getDiligentDanPrompt } from '~/lib/common/prompts/diligent-dan';
import { discussPrompt } from '~/lib/common/prompts/discuss-prompt';
import { CONTINUE_PROMPT as FINE_TUNED_CONTINUE, getFineTunedPrompt } from '~/lib/common/prompts/new-prompt';
import optimized from '~/lib/common/prompts/optimized';
import { getProjectToolPrompt } from '~/lib/common/prompts/project-tools';
import { CONTINUE_PROMPT, getSystemPrompt } from '~/lib/common/prompts/prompts';
import { getSimpleSalPrompt } from '~/lib/common/prompts/simple-sal';
import { CONTINUE_PROMPT as TINY_TIM_CONTINUE, getTinyTimPrompt } from '~/lib/common/prompts/tiny-tim';
import { MODIFICATIONS_TAG_NAME, WORK_DIR } from '~/utils/constants';
import { allowedHTMLElements } from '~/utils/markdown';

const NOT_CONNECTED = { isConnected: false, hasSelectedProject: false };

const CONNECTED = {
  isConnected: true,
  hasSelectedProject: true,
  credentials: { supabaseUrl: 'https://example.supabase.co', anonKey: 'public-anon-key' },
};
const OPTIONS = {
  cwd: WORK_DIR,
  allowedHtmlElements: allowedHTMLElements,
  modificationTagName: MODIFICATIONS_TAG_NAME,
  supabase: NOT_CONNECTED,
};

export function renderDefaultPromptVariants(): Record<string, string> {
  return {
    'default-artifact': getFineTunedPrompt(WORK_DIR, NOT_CONNECTED),
    'default-artifact-supabase': getFineTunedPrompt(WORK_DIR, CONNECTED),
    'default-artifact-build-mode': withDevelopmentCommentaryWorkstyle(
      getFineTunedPrompt(WORK_DIR, NOT_CONNECTED),
      'webcontainer',
    ),
    'default-tools': getProjectToolPrompt({ ...OPTIONS, projectTools: true }),
    'tiny-tim': getTinyTimPrompt(WORK_DIR, NOT_CONNECTED),
    'tiny-tim-supabase': getTinyTimPrompt(WORK_DIR, CONNECTED),
    'experimental-prompt': optimized(OPTIONS),
    'experimental-prompt-supabase': optimized({ ...OPTIONS, supabase: CONNECTED }),
    'system-prompt': getSystemPrompt(WORK_DIR, NOT_CONNECTED),
    'simple-sal': getSimpleSalPrompt(WORK_DIR, NOT_CONNECTED),
    'diligent-dan': getDiligentDanPrompt(WORK_DIR, NOT_CONNECTED),
    discuss: discussPrompt(),
    'continue-system': CONTINUE_PROMPT,
    'continue-fine-tuned': FINE_TUNED_CONTINUE,
    'continue-tiny-tim': TINY_TIM_CONTINUE,
  };
}
