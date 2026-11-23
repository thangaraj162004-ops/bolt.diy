import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { action, getBugReportRepo, loader } from './api.bug-report';

/*
 * /api/bug-report only exists when CA_BUG_REPORT_REPO is set. There is no
 * default repository, so without it every request gets a plain 404 and
 * nothing is sent anywhere.
 */

function post(env: Record<string, string> = {}) {
  const form = new FormData();
  form.set('title', 'Broken button');
  form.set('description', 'The button does nothing when clicked.');

  return action({
    request: new Request('http://localhost/api/bug-report', { method: 'POST', body: form }),
    context: { cloudflare: { env } },
  } as unknown as ActionFunctionArgs);
}

function get(env: Record<string, string> = {}) {
  return loader({
    request: new Request('http://localhost/api/bug-report'),
    context: { cloudflare: { env } },
  } as unknown as LoaderFunctionArgs);
}

async function expectPlain404(response: Response) {
  expect(response.status).toBe(404);
  expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
  expect(await response.text()).toBe('Not Found');
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('CA_BUG_REPORT_REPO', undefined);
  vi.stubEnv('BUG_REPORT_REPO', undefined);
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('/api/bug-report without CA_BUG_REPORT_REPO', () => {
  it('returns a plain 404 for POST and GET', async () => {
    await expectPlain404(await post());
    await expectPlain404(get());
  });

  it('ignores the old BUG_REPORT_REPO variable and the token', async () => {
    vi.stubEnv('BUG_REPORT_REPO', 'someone/repo');
    await expectPlain404(await post({ BUG_REPORT_REPO: 'someone/repo', GITHUB_BUG_REPORT_TOKEN: 'placeholder' }));
  });

  it.each(['', '   ', 'not-a-repo', 'https://github.com/a/b', 'a/b/c'])('treats %j as not set', async (value) => {
    await expectPlain404(await post({ CA_BUG_REPORT_REPO: value }));
    expect(getBugReportRepo({ cloudflare: { env: { CA_BUG_REPORT_REPO: value } } })).toBeUndefined();
  });
});

describe('/api/bug-report with CA_BUG_REPORT_REPO', () => {
  it('reads it from the Worker env or from process.env', () => {
    expect(getBugReportRepo({ cloudflare: { env: { CA_BUG_REPORT_REPO: 'acme/feedback' } } })).toBe('acme/feedback');

    vi.stubEnv('CA_BUG_REPORT_REPO', 'acme/other');
    expect(getBugReportRepo({})).toBe('acme/other');
  });

  it('exists: GET is "method not allowed" and POST reaches the normal checks', async () => {
    const env = { CA_BUG_REPORT_REPO: 'acme/feedback' };

    expect(get(env).status).toBe(405);

    // no trusted client IP in this request, so it stops before any GitHub call
    const response = await post(env);
    expect(response.status).not.toBe(404);
    expect(response.status).toBe(503);
  });
});
