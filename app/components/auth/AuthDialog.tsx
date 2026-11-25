import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState, type FormEvent } from 'react';
import { Dialog, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { MIN_PASSWORD_LENGTH, signIn, signUp, type AuthMode } from '~/lib/supabase/auth';

interface AuthDialogProps {
  client: SupabaseClient;
  open: boolean;
  onClose: () => void;
  initialMode?: AuthMode;

  /** Why the dialog opened, e.g. "Log in to send your message." */
  hint?: string;
}

const inputClass =
  'w-full rounded-lg border border-ca-elements-borderColor bg-ca-elements-background-depth-2 px-3 py-2 text-base text-ca-elements-textPrimary placeholder-ca-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-purple-500/40';

/** Sign up / Log in with email and password. */
export function AuthDialog({ client, open, onClose, initialMode = 'login', hint }: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setPassword('');
      setError(undefined);
      setNotice(undefined);
    }
  }, [open, initialMode]);

  const isSignup = mode === 'signup';

  const switchMode = () => {
    setMode(isSignup ? 'login' : 'signup');
    setError(undefined);
    setNotice(undefined);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (busy) {
      return;
    }

    setBusy(true);
    setError(undefined);
    setNotice(undefined);

    const result = await (isSignup ? signUp : signIn)(client, email, password);

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (result.message) {
      // sign up needs an email confirmation first
      setNotice(result.message);
      setMode('login');
      setPassword('');

      return;
    }

    onClose();
  };

  return (
    <DialogRoot open={open} onOpenChange={(value) => !value && onClose()}>
      <Dialog className="w-[min(400px,calc(100vw-2rem))]" onClose={onClose}>
        <form className="flex flex-col gap-4 p-6" onSubmit={submit} noValidate data-testid="auth-dialog">
          <div>
            <DialogTitle>{isSignup ? 'Create your account' : 'Log in'}</DialogTitle>
            <DialogDescription>
              {hint ?? (isSignup ? 'New accounts start with 20 free test credits.' : 'Welcome back.')}
            </DialogDescription>
          </div>

          <label className="flex flex-col gap-1 text-sm text-ca-elements-textSecondary">
            Email
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-ca-elements-textSecondary">
            Password
            <input
              className={inputClass}
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
            {isSignup && (
              <span className="text-xs text-ca-elements-textTertiary">At least {MIN_PASSWORD_LENGTH} characters.</span>
            )}
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {error}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-600 dark:text-green-400"
            >
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600 disabled:opacity-60"
          >
            {busy ? 'Please wait…' : isSignup ? 'Sign up' : 'Log in'}
          </button>

          <p className="text-center text-sm text-ca-elements-textSecondary">
            {isSignup ? 'Already have an account?' : 'New here?'}{' '}
            <button type="button" className="text-purple-500 underline" onClick={switchMode}>
              {isSignup ? 'Log in' : 'Create an account'}
            </button>
          </p>
        </form>
      </Dialog>
    </DialogRoot>
  );
}
