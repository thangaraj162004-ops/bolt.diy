import { classNames } from '~/utils/classNames';

/** The name to show for a user: their profile name, else the part of the email before "@". */
export function displayName(username?: string | null, email?: string | null): string {
  return username?.trim() || email?.split('@')[0]?.trim() || '';
}

/** The first letter (or digit) of a name, upper case; null when there is none. */
export function avatarLetter(name?: string | null): string | null {
  const first = [...(name?.trim() ?? '')][0];

  return first && /[\p{L}\p{N}]/u.test(first) ? first.toLocaleUpperCase() : null;
}

interface UserAvatarProps {
  /** The user's name or email; empty for a guest. */
  name?: string | null;
  className?: string;
}

/**
 * A simple round avatar: the first letter of the name, or a person icon for a
 * guest. Theme colors only, so it looks right in light and dark mode.
 */
export function UserAvatar({ name, className }: UserAvatarProps) {
  const letter = avatarLetter(name);

  return (
    <span
      aria-hidden="true"
      data-testid="user-avatar"
      className={classNames(
        'flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full text-base font-semibold',
        letter
          ? 'bg-ca-elements-item-backgroundAccent text-ca-elements-item-contentAccent'
          : 'bg-ca-elements-background-depth-3 text-ca-elements-textSecondary',
        className,
      )}
    >
      {letter ?? <span className="i-ph:user text-xl" />}
    </span>
  );
}
