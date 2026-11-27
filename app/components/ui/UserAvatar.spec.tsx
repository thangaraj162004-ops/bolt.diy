import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserAvatar, avatarLetter, displayName } from './UserAvatar';

describe('UserAvatar', () => {
  it('takes the first letter, upper case', () => {
    expect(avatarLetter('priya.sharma@example.com')).toBe('P');
    expect(avatarLetter('  émile ')).toBe('É');
    expect(avatarLetter('7even')).toBe('7');
    expect(avatarLetter('')).toBeNull();
    expect(avatarLetter('  ')).toBeNull();
    expect(avatarLetter('@x')).toBeNull();
    expect(avatarLetter(undefined)).toBeNull();
  });

  it('uses the profile name, else the email before "@"', () => {
    expect(displayName('Priya', 'x@y.co')).toBe('Priya');
    expect(displayName('  ', 'sam.lee@y.co')).toBe('sam.lee');
    expect(displayName(undefined, undefined)).toBe('');
  });

  it('shows the letter with theme colors (never plain white), 40 px round', () => {
    const { container } = render(<UserAvatar name="priya" />);
    const avatar = container.firstElementChild!;

    expect(avatar.textContent).toBe('P');
    expect(avatar.className).toContain('h-10 w-10');
    expect(avatar.className).toContain('rounded-full');
    expect(avatar.className).toContain('bg-ca-elements-item-backgroundAccent');
    expect(avatar.className).not.toMatch(/white/);
    expect(avatar.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows a person icon for a guest, no picture', () => {
    const { container } = render(<UserAvatar />);
    const avatar = container.firstElementChild!;

    expect(avatar.textContent).toBe('');
    expect(avatar.querySelector('.i-ph\\:user')).toBeTruthy();
    expect(avatar.querySelector('img')).toBeNull();
    expect(avatar.className).toContain('bg-ca-elements-background-depth-3');
  });
});
