import {
  getMessageParts,
  getMessageText,
  getToolCallId,
  getToolInput,
  getToolName,
  getToolOutput,
  getToolState,
  type AnyMessage,
} from '~/lib/persistence/messageMigration';

/** Most agent steps for one message (across the browser's follow-up requests). */
export const MAX_AGENT_STEPS = 25;

/** "Command not found": the browser preview cannot run it (no such tool or npm script). */
export const CANNOT_RUN_EXIT_CODE = 127;

/** The same project action failing this many times stops the agent. */
export const MAX_IDENTICAL_FAILURES = 2;

/**
 * Helper or check files an agent sometimes writes into the user's project to
 * test something (for example src/test-check.ts). They must not stay there.
 * Matches whole name parts only: "checkout.tsx" or "spellcheck.ts" do not count.
 */
const HELPER_FILE = /(?:^|[-_.])(?:test-check|check|checks|verify|smoke|scratch|tmp|temp|debug)(?:[-_.]|$)/i;

export function isHelperFile(path: string): boolean {
  const name = path.split('/').pop() ?? '';

  return /\.(?:[cm]?[jt]sx?)$/.test(name) && HELPER_FILE.test(name.replace(/\.(?:[cm]?[jt]sx?)$/, ''));
}

/** A short label for a project action, to tell identical failures apart. */
function actionLabel(name: string, input: Record<string, unknown> | undefined): string {
  const target = input?.command ?? input?.path ?? input?.processId ?? '';

  return `${name}:${typeof target === 'string' ? target.trim() : JSON.stringify(target)}`;
}

function errorText(output: Record<string, unknown> | undefined): string {
  const value = output?.error ?? output?.message ?? '';

  return (typeof value === 'string' ? value : JSON.stringify(value)).replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** These tools execute on the server and must never receive a client approval result. */
export function isServerAgentTool(name: string | undefined): boolean {
  return name === 'agent_plan' || name === 'agent_complete';
}

export interface AgentPlan {
  goal: string;
  steps: string[];
  criteria: Array<{ id: string; description: string }>;
  requiresPreview: boolean;
}

export function isAgentPlan(value: unknown): value is AgentPlan {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const plan = value as Partial<AgentPlan>;

  return (
    typeof plan.goal === 'string' &&
    Array.isArray(plan.steps) &&
    plan.steps.every((step) => typeof step === 'string') &&
    Array.isArray(plan.criteria) &&
    plan.criteria.length > 0 &&
    plan.criteria.every(
      (criterion) => typeof criterion?.id === 'string' && typeof criterion.description === 'string',
    ) &&
    typeof plan.requiresPreview === 'boolean'
  );
}

export function getAgentLoopProgress(messages: AnyMessage[], enabled: boolean) {
  const userIndex = messages.findLastIndex((message) => message.role === 'user');

  const text =
    userIndex >= 0
      ? getMessageText(messages[userIndex])
          .replace(/\[(?:Model|Provider):[^\]]*\]/g, '')
          .trim()
      : '';
  const informational =
    /^(?:(?:please|can you|could you)\s+)*(?:explain|tell me|what|where|when|why|how|which|who|find|search|research)\b/i.test(
      text,
    ) && !/\b(?:build|create|implement|make|add|change|edit|fix|update|remove|move|replace|refactor)\b/i.test(text);

  let plan: AgentPlan | undefined;
  let lastEdit = -1;
  let lastFailure = -1;
  let lastPassingTest = -1;
  let lastRun = -1;
  let lastPlan = -1;
  let previewReady = false;
  let denied = false;
  let completedAt = -1;
  let blocked = false;
  let steps = 0;
  let position = 0;

  const evidence: string[] = [];
  const starts = new Map<string, number>();

  // reasons to stop instead of looping
  const failureCounts = new Map<string, number>();

  let repeatedFailure: string | undefined;
  let cannotRun: string | undefined;
  let previewError: string | undefined;
  let lastPreviewErrorAt = -1;
  let previewErrorEpisodes = 0;
  let previewStillFailing: string | undefined;

  // helper files the agent created in this task and has not deleted yet
  const helperFiles = new Set<string>();

  let pendingProjectCalls = false;

  for (const message of messages.slice(userIndex + 1)) {
    if (message.role !== 'assistant') {
      continue;
    }

    const parts = getMessageParts(message) ?? [];
    steps +=
      parts.filter((part) => part.type === 'step-start').length || (parts.some((part) => getToolName(part)) ? 1 : 0);

    for (const part of parts) {
      const name = getToolName(part);

      if (!name) {
        continue;
      }

      position++;

      const output = getToolOutput(part) as Record<string, unknown> | undefined;
      const state = getToolState(part);
      denied ||= state === 'output-denied' || output?.denied === true;

      if (
        name.startsWith('project_') &&
        (state === 'input-available' || state === 'input-streaming' || state === 'approval-requested')
      ) {
        pendingProjectCalls = true;
      }

      const input = getToolInput(part) as Record<string, unknown> | undefined;

      const noteFailure = (detail: string) => {
        const key = `${actionLabel(name, input)}|${detail}`;
        const count = (failureCounts.get(key) ?? 0) + 1;
        failureCounts.set(key, count);

        if (count >= MAX_IDENTICAL_FAILURES && !repeatedFailure) {
          repeatedFailure = actionLabel(name, input).replace(/^project_[a-z_]+:/, '') || name;
        }
      };

      if (name.startsWith('project_') && state === 'output-error') {
        lastFailure = position;
        noteFailure(errorText(output) || String((part as { errorText?: unknown }).errorText ?? ''));
      }

      if (state !== 'output-available' || !output) {
        continue;
      }

      if (name === 'agent_complete' && output.blocked === true) {
        blocked = true;
      }

      const commandResult = name === 'project_run_command' || name === 'project_get_process_output';

      /*
       * Exit code 127 is "command not found": the browser preview has no such
       * tool or npm script (for example `npm run lint` or `npm run test`). That
       * is not a failure to repair and retry; the agent stops and says so.
       */
      if (commandResult && output.exitCode === CANNOT_RUN_EXIT_CODE) {
        const command = output.command ?? input?.command;
        cannotRun ??= typeof command === 'string' && command.trim() ? command.trim() : 'This command';

        continue;
      }

      const failed = output.isError === true || (typeof output.exitCode === 'number' && output.exitCode !== 0);

      if (commandResult && typeof output.previewReady === 'boolean') {
        previewReady = output.previewReady;
      }

      /*
       * The preview's own build or runtime error ("cartCount is not defined").
       * It must be fixed before completing; one fix is tried, and if the
       * preview still fails after that, the agent stops.
       */
      if (commandResult) {
        const shown =
          typeof output.previewError === 'string' && output.previewError.trim() ? output.previewError : undefined;

        if (shown) {
          if (lastPreviewErrorAt < 0 || lastEdit > lastPreviewErrorAt) {
            previewErrorEpisodes++;
          }

          lastPreviewErrorAt = position;
          lastFailure = position;

          if (previewErrorEpisodes >= 2) {
            previewStillFailing ??= shown;
          }
        }

        previewError = shown;
      }

      if (failed && name.startsWith('project_')) {
        noteFailure(errorText(output) || `exit ${String(output.exitCode ?? '')}`);
      }

      if (name === 'project_stop_process' && output.stopped === true && output.purpose === 'run') {
        previewReady = false;
      }

      if (failed) {
        if (name.startsWith('project_')) {
          lastFailure = position;
        }

        continue;
      }

      if (name === 'agent_plan' && isAgentPlan(output.plan)) {
        plan = output.plan;
        lastPlan = position;
      }

      if (name === 'agent_complete' && output.completed === true) {
        completedAt = position;
      }

      const outputPath = typeof output.path === 'string' ? output.path : undefined;

      if (name === 'project_write_file' && output.created === true && outputPath && isHelperFile(outputPath)) {
        helperFiles.add(outputPath);
      }

      if (name === 'project_delete_path' && output.deleted === true && outputPath) {
        helperFiles.delete(outputPath);
      }

      if (name === 'project_write_file' || name === 'project_patch_file' || name === 'project_delete_path') {
        if (
          output.changed !== false &&
          (output.written === true || output.patched === true || output.deleted === true)
        ) {
          lastEdit = position;
        }
      }

      const processId = typeof output.processId === 'string' ? output.processId : undefined;

      if (name === 'project_run_command' && processId) {
        starts.set(processId, position);
      }

      if (commandResult) {
        const purpose = output.purpose ?? (name === 'project_run_command' ? input?.purpose : undefined);
        const startedAt = processId ? starts.get(processId) : undefined;

        if (
          purpose === 'run' &&
          !previewError &&
          output.status === 'exited' &&
          output.exitCode === 0 &&
          startedAt !== undefined &&
          startedAt > lastEdit
        ) {
          lastRun = position;
        }

        if (
          purpose === 'test' &&
          output.status === 'exited' &&
          output.exitCode === 0 &&
          startedAt !== undefined &&
          startedAt > lastEdit &&
          startedAt > lastFailure &&
          (lastRun > lastEdit || previewReady)
        ) {
          lastPassingTest = position;
        }
      }

      const id = getToolCallId(part);

      if (id && name.startsWith('project_') && (output.status !== 'running' || output.previewReady === true)) {
        evidence.push(id);
      }
    }
  }

  const tested = lastPassingTest > lastEdit && lastPassingTest > lastFailure && lastPassingTest >= 0;
  const active = enabled && userIndex >= 0 && !informational;
  const ran = (lastRun > lastEdit && lastRun >= 0) || previewReady;

  /*
   * In the browser preview only the preview itself can be checked: it builds
   * and shows no error. Lint and test scripts are not required (they usually
   * cannot run here); a passing one still counts as extra evidence.
   */
  const completed =
    completedAt > lastPlan &&
    completedAt > lastEdit &&
    completedAt > lastFailure &&
    ran &&
    !previewError &&
    helperFiles.size === 0 &&
    Boolean(plan) &&
    (!plan?.requiresPreview || previewReady) &&
    !pendingProjectCalls;

  // one short sentence for the user when the agent stops instead of looping
  const stopReason = cannotRun
    ? `${cannotRun} cannot run in the browser preview, so I stopped here.`
    : previewStillFailing
      ? `The preview still shows an error after one fix (${previewStillFailing.slice(0, 160)}), so I stopped here.`
      : repeatedFailure
        ? `The same step failed twice (${repeatedFailure.slice(0, 120)}), so I stopped here.`
        : undefined;

  const status = !active
    ? 'inactive'
    : denied || blocked
      ? 'blocked'
      : completed
        ? 'ready'
        : stopReason
          ? 'stopped'
          : steps >= MAX_AGENT_STEPS
            ? 'limited'
            : 'pending';

  return {
    status,
    plan,
    edited: lastEdit >= 0,
    needsRepair: lastFailure > lastEdit,
    ran,
    previewReady,
    tested,
    previewError,
    stopReason,
    helperFiles: [...helperFiles],
    steps,
    evidence,
    pendingProjectCalls,
  };
}

export function getAgentCompletionProblems(progress: ReturnType<typeof getAgentLoopProgress>) {
  const problems: string[] = [];

  if (progress.status === 'inactive') {
    problems.push('There is no active build task.');
  }

  if (progress.pendingProjectCalls) {
    problems.push('Wait for pending project tool results before completing.');
  }

  if (!progress.plan) {
    problems.push('Record a plan with explicit completion criteria using agent_plan.');
  }

  if (!progress.ran) {
    problems.push('Run the app or requested program and inspect the result.');
  }

  if (progress.plan?.requiresPreview && !progress.previewReady) {
    problems.push('Confirm a running preview.');
  }

  if (progress.previewError) {
    problems.push(`Fix the preview error first: ${progress.previewError}`);
  }

  if (progress.stopReason) {
    problems.push(progress.stopReason);
  }

  if (progress.helperFiles.length > 0) {
    problems.push(`Delete the helper files you created first: ${progress.helperFiles.join(', ')}.`);
  }

  return problems;
}

export function getAgentLoopInstructions(progress: ReturnType<typeof getAgentLoopProgress>) {
  if (progress.status === 'inactive') {
    return '';
  }

  if (progress.status === 'blocked') {
    return 'Stop using tools. Explain the blocker or denied operation and list unmet completion criteria without claiming success.';
  }

  const cleanup =
    progress.helperFiles.length > 0
      ? `First delete the helper files you created (${progress.helperFiles.join(', ')}) with project_delete_path. `
      : '';

  if (progress.status === 'stopped') {
    return `${cleanup}Stop using tools and do not retry. Tell the user in one short sentence: "${progress.stopReason}"`;
  }

  if (progress.status === 'limited') {
    return `The ${MAX_AGENT_STEPS}-step task limit was reached. Stop using tools and report actual progress, unmet completion criteria, and checks that did not pass.`;
  }

  if (progress.status === 'ready') {
    return 'The completion gate accepted this task. Summarize the relevant changed files, passing checks, and fulfilled criteria. Do not start unrelated work.';
  }

  const nextAction =
    progress.helperFiles.length > 0 && progress.ran && !progress.previewError
      ? `Delete the helper files you created (${progress.helperFiles.join(', ')}) with project_delete_path; they must not stay in the user's project.`
      : progress.previewError
        ? `The preview shows an error: ${progress.previewError}. Fix its cause once (read the file, patch it), then check the preview again.`
        : progress.needsRepair
          ? 'Repair the latest failed project tool action. Use its exact error, reread the file if needed, and retry only after correcting the cause. Do not run or complete yet.'
          : !progress.edited
            ? 'Use project_patch_file or project_write_file now to implement the requested change. Do not answer in prose or call agent_complete yet.'
            : !progress.ran
              ? 'Run the changed app now with project_run_command and purpose="run" (for a web app, the dev server for the preview). Inspect its output and previewError.'
              : progress.plan?.requiresPreview && !progress.previewReady
                ? 'Start or inspect the app preview now. Confirm it is running before completing.'
                : 'Call agent_complete alone and report every recorded criterion by its exact ID. The server attaches evidence from successful project tool calls automatically; do not provide process IDs, command names, or guessed evidence IDs.';

  return `Follow Plan -> edit -> run -> check the preview -> repair. Record a short plan and observable completion criteria with agent_plan. Inspect relevant files, then use small exact patches. Run the app with purpose run; use an existing live server for follow-up UI edits. This is a browser preview: the only checks are that the preview builds and shows no error (see previewReady and previewError in command results). Do not run lint, test, typecheck or other npm scripts: they cannot run here (exit code 127 means "cannot run here", and the task then stops). If the preview shows an error, fix its cause once. Never add helper or check files (such as src/test-check.ts) to the user's project; delete any you created. Call agent_complete alone and report each planned criterion by its exact ID; the server attaches evidence from successful project tool calls automatically. A plan or started process alone is not completion. Do not invent passing checks. If work cannot proceed, report outcome blocked with a concrete reason.
NEXT REQUIRED ACTION: ${nextAction}
Do not send a prose response while this action is pending. Remaining task steps: ${MAX_AGENT_STEPS - progress.steps}. Confirmed: plan=${Boolean(progress.plan)}, edits=${progress.edited}, run=${progress.ran}, preview=${progress.previewReady}, preview error=${progress.previewError ? 'yes' : 'none'}.
Recorded criteria: ${JSON.stringify(progress.plan?.criteria ?? [])}. Report each criterion by its exact ID; the server attaches successful project tool-call evidence automatically.`;
}
