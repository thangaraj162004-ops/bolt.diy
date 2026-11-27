import { describe, expect, it } from 'vitest';
import {
  getAgentCompletionProblems,
  getAgentLoopInstructions,
  getAgentLoopProgress,
  isServerAgentTool,
  MAX_AGENT_STEPS,
  type AgentPlan,
} from './agentLoop';
import type { AnyMessage } from '~/lib/persistence/messageMigration';

describe('server agent tool execution', () => {
  it('keeps plan and completion results out of client approval and dispatch', () => {
    expect(isServerAgentTool('agent_plan')).toBe(true);
    expect(isServerAgentTool('agent_complete')).toBe(true);

    for (const name of ['project_run_command', 'project_patch_file', 'web_search', 'plugin_example', undefined]) {
      expect(isServerAgentTool(name)).toBe(false);
    }
  });
});

const plan: AgentPlan = {
  goal: 'Change the button',
  steps: ['Inspect', 'Patch', 'Run and check'],
  criteria: [{ id: 'button', description: 'The requested button is present and checks pass.' }],
  requiresPreview: true,
};

const user: AnyMessage = { role: 'user', content: 'Change the button' };

function result(name: string, output: Record<string, unknown>, id = name) {
  return { type: `tool-${name}`, toolCallId: id, state: 'output-available', output };
}

function response(...parts: Record<string, unknown>[]): AnyMessage {
  return { role: 'assistant', parts };
}

const planned = result('agent_plan', { plan });
const edited = result('project_patch_file', { patched: true, changed: true }, 'edit');

const run = result(
  'project_run_command',
  { processId: 'server', purpose: 'run', status: 'running', previewReady: true },
  'run',
);
const test = result(
  'project_run_command',
  { processId: 'check', purpose: 'test', status: 'exited', exitCode: 0, previewReady: true },
  'test',
);

const complete = result('agent_complete', { completed: true });
const verifiedMessages = [user, response(planned, edited, run, test)];

describe('agent build loop', () => {
  it('requires a recorded plan, a running preview without errors, and explicit completion', () => {
    const initial = getAgentLoopProgress([user, response({ type: 'text', text: 'I will build it.' })], true);
    expect(initial.status).toBe('pending');

    // a plan and a run; no lint or test check is required in the browser preview (Task 9F)
    expect(getAgentCompletionProblems(initial)).toHaveLength(2);
    expect(getAgentCompletionProblems(initial).join(' ')).not.toMatch(/purpose test|lint/);

    const verified = getAgentLoopProgress(verifiedMessages, true);
    expect(verified).toMatchObject({ status: 'pending', edited: true, ran: true, tested: true, previewReady: true });
    expect(getAgentCompletionProblems(verified)).toEqual([]);
    expect(getAgentLoopProgress([...verifiedMessages, response(complete)], true).status).toBe('ready');
  });

  it('does not treat a started check or an install as a passing check (checks are optional now)', () => {
    for (const output of [
      { processId: 'test', purpose: 'test', status: 'running' },
      { processId: 'install', purpose: 'install', status: 'exited', exitCode: 0 },
    ]) {
      const progress = getAgentLoopProgress(
        [user, response(planned, edited, run, result('project_run_command', output), complete)],
        true,
      );
      expect(progress.tested).toBe(false);

      // the running preview is enough to complete
      expect(progress.status).toBe('ready');
    }
  });

  it('repairs failed checks and requires a fresh passing result after the repair', () => {
    const failed = result('project_run_command', {
      processId: 'bad',
      purpose: 'test',
      status: 'exited',
      exitCode: 1,
      isError: true,
    });

    const messages = [user, response(planned, edited, run, failed, edited)];
    expect(getAgentLoopProgress(messages, true).tested).toBe(false);
    expect(getAgentLoopProgress([...messages, response(test, complete)], true).status).toBe('ready');
  });

  it('invalidates passing verification and completion after any subsequent change', () => {
    const messages = [...verifiedMessages, response(complete, edited)];
    expect(getAgentLoopProgress(messages, true)).toMatchObject({ tested: false, status: 'pending' });
    expect(getAgentLoopProgress([...messages, response(test, complete)], true).status).toBe('ready');
  });

  it('rejects a check started before an edit even if it finishes afterward', () => {
    const started = result('project_run_command', { processId: 'check', purpose: 'test', status: 'running' });

    const polled = result('project_get_process_output', {
      processId: 'check',
      purpose: 'test',
      status: 'exited',
      exitCode: 0,
    });

    const progress = getAgentLoopProgress([user, response(planned, started, edited, run, polled, complete)], true);
    expect(progress.tested).toBe(false);

    // not a passing check, but checks are not required: the running preview completes it
    expect(progress.status).toBe('ready');
  });

  it('requires a check after execution and does not complete after stopping the app', () => {
    const nonWebPlan = result('agent_plan', { plan: { ...plan, requiresPreview: false } });
    const earlyTest = { ...test, output: { ...test.output, previewReady: false } };

    const programRun = result('project_run_command', {
      processId: 'program',
      purpose: 'run',
      status: 'exited',
      exitCode: 0,
    });
    expect(
      getAgentLoopProgress([user, response(nonWebPlan, edited, earlyTest, programRun, complete)], true).tested,
    ).toBe(false);
    expect(
      getAgentLoopProgress([user, response(nonWebPlan, edited, programRun, earlyTest, complete)], true).status,
    ).toBe('ready');
    expect(
      getAgentLoopProgress(
        [
          ...verifiedMessages,
          response(complete, result('project_stop_process', { processId: 'server', stopped: true, purpose: 'run' })),
        ],
        true,
      ).status,
    ).toBe('pending');
  });

  it('invalidates a non-web program run after edits', () => {
    const progress = getAgentLoopProgress(
      [
        user,
        response(
          result('agent_plan', { plan: { ...plan, requiresPreview: false } }),
          result('project_run_command', { processId: 'script', purpose: 'run', status: 'exited', exitCode: 0 }),
          edited,
          { ...test, output: { ...test.output, previewReady: false } },
          complete,
        ),
      ],
      true,
    );
    expect(progress.ran).toBe(false);
    expect(progress.status).toBe('pending');
  });

  it('requires preview readiness for a web app and notices a stopped preview', () => {
    const progress = getAgentLoopProgress(
      [
        ...verifiedMessages,
        response(
          complete,
          result('project_get_process_output', {
            processId: 'server',
            purpose: 'run',
            previewReady: false,
            status: 'exited',
            exitCode: 1,
          }),
        ),
      ],
      true,
    );
    expect(progress.previewReady).toBe(false);
    expect(progress.status).toBe('pending');
    expect(getAgentCompletionProblems(progress)).toContain('Confirm a running preview.');
  });

  it('does not force unnecessary edits when a request is already satisfied', () => {
    const progress = getAgentLoopProgress(
      [
        user,
        response(
          planned,
          result('project_read_file', { content: 'requested button already present' }),
          run,
          test,
          complete,
        ),
      ],
      true,
    );
    expect(progress).toMatchObject({ edited: false, status: 'ready' });
  });

  it('no-op patches preserve verification while plan revisions invalidate completion', () => {
    expect(
      getAgentLoopProgress(
        [...verifiedMessages, response(result('project_patch_file', { patched: true, changed: false }), complete)],
        true,
      ).status,
    ).toBe('ready');
    expect(getAgentLoopProgress([...verifiedMessages, response(complete, planned)], true).status).toBe('pending');
  });

  it('excludes failed and unfinished command evidence', () => {
    const progress = getAgentLoopProgress(
      [
        user,
        response(
          result('project_run_command', { processId: 'pending', status: 'running' }, 'pending'),
          result('project_patch_file', { isError: true }, 'failed'),
          result('project_read_file', { content: 'source' }, 'read'),
        ),
      ],
      true,
    );
    expect(progress.evidence).toEqual(['read']);
  });

  it('isolates each follow-up from previous plans, changes and checks', () => {
    expect(
      getAgentLoopProgress(
        [...verifiedMessages, response(complete), { role: 'user', content: 'Move the microphone' }],
        true,
      ),
    ).toMatchObject({ status: 'pending', plan: undefined, tested: false, edited: false, steps: 0, evidence: [] });
  });

  it('keeps informational requests and disabled agent mode outside the build loop', () => {
    expect(getAgentLoopProgress([{ role: 'user', content: 'Explain this component' }], true).status).toBe('inactive');
    expect(getAgentLoopProgress([user], false).status).toBe('inactive');
  });

  it('bounds the task across browser continuation requests and respects denial', () => {
    const messages = [
      user,
      ...Array.from({ length: MAX_AGENT_STEPS }, () =>
        response({ type: 'step-start' }, result('project_read_file', { content: 'source' })),
      ),
    ];
    expect(getAgentLoopProgress(messages, true).status).toBe('limited');

    const denied = getAgentLoopProgress(
      [user, response({ type: 'tool-project_run_command', toolCallId: 'denied', state: 'output-denied' })],
      true,
    );
    expect(denied.status).toBe('blocked');
    expect(getAgentLoopInstructions(denied)).toContain('without claiming success');
  });

  it('rejects completion while project operations are still pending', () => {
    const progress = getAgentLoopProgress(
      [
        ...verifiedMessages,
        response({ type: 'tool-project_patch_file', toolCallId: 'pending', state: 'input-available' }, complete),
      ],
      true,
    );
    expect(progress.status).toBe('pending');
    expect(getAgentCompletionProblems(progress)).toContain('Wait for pending project tool results before completing.');
  });
});

describe('agent stops instead of looping (Task 9F)', () => {
  const lint127 = (id: string) =>
    result(
      'project_run_command',
      { processId: id, command: 'npm run lint', purpose: 'test', status: 'exited', exitCode: 127, isError: true },
      id,
    );

  it('exit code 127 means "cannot run here": the agent stops with one short sentence, no retry', () => {
    const progress = getAgentLoopProgress([user, response(planned, edited, run, lint127('lint'))], true);

    expect(progress.status).toBe('stopped');
    expect(progress.needsRepair).toBe(false);
    expect(progress.stopReason).toBe('npm run lint cannot run in the browser preview, so I stopped here.');

    const instructions = getAgentLoopInstructions(progress);
    expect(instructions).toContain('Stop using tools and do not retry');
    expect(instructions).toContain('one short sentence');
  });

  it('never asks for lint or test in the browser preview', () => {
    const progress = getAgentLoopProgress([user, response(planned, edited, run)], true);
    const instructions = getAgentLoopInstructions(progress);

    expect(progress.status).toBe('pending');
    expect(instructions).toContain('NEXT REQUIRED ACTION: Call agent_complete');
    expect(instructions).toContain('Do not run lint, test, typecheck');
    expect(getAgentCompletionProblems(progress)).toEqual([]);
  });

  it('stops after 2 identical failures', () => {
    const failing = (id: string) =>
      result('project_patch_file', { isError: true, error: 'The text to replace was not found in src/App.tsx.' }, id);

    const once = getAgentLoopProgress([user, response(planned, edited, failing('p1'))], true);
    expect(once.status).toBe('pending');
    expect(once.needsRepair).toBe(true);

    const twice = getAgentLoopProgress([user, response(planned, edited, failing('p1'), failing('p2'))], true);
    expect(twice.status).toBe('stopped');
    expect(twice.stopReason).toMatch(/^The same step failed twice/);
  });

  it('a preview runtime error must be fixed once; if it is still there after the fix, the agent stops', () => {
    const withError = (id: string) =>
      result(
        'project_get_process_output',
        {
          processId: 'server',
          purpose: 'run',
          status: 'running',
          previewReady: true,
          previewError: 'Uncaught Exception: ReferenceError: cartCount is not defined',
        },
        id,
      );
    const clean = result(
      'project_get_process_output',
      { processId: 'server', purpose: 'run', status: 'running', previewReady: true },
      'clean',
    );

    // the error blocks completion and asks for one fix
    const first = getAgentLoopProgress([user, response(planned, edited, run, withError('e1'), complete)], true);
    expect(first.status).toBe('pending');
    expect(first.previewError).toContain('cartCount is not defined');
    expect(getAgentLoopInstructions(first)).toContain('Fix its cause once');
    expect(getAgentCompletionProblems(first).join(' ')).toContain('Fix the preview error first');

    // fixed: completes
    const fixed = getAgentLoopProgress(
      [user, response(planned, edited, run, withError('e1'), edited, clean, complete)],
      true,
    );
    expect(fixed.status).toBe('ready');

    // still failing after the one fix: stops
    const stillFailing = getAgentLoopProgress(
      [user, response(planned, edited, run, withError('e1'), edited, withError('e2'))],
      true,
    );
    expect(stillFailing.status).toBe('stopped');
    expect(stillFailing.stopReason).toMatch(/^The preview still shows an error after one fix/);
  });

  it('has a limit of 25 agent steps per message', () => {
    expect(MAX_AGENT_STEPS).toBe(25);

    const steps = Array.from({ length: MAX_AGENT_STEPS }, (_, i) =>
      response({ type: 'step-start' }, result('project_read_file', { content: 'x' }, `read-${i}`)),
    );
    expect(getAgentLoopProgress([user, response(planned), ...steps], true).status).toBe('limited');
  });
});
