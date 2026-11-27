import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsPhone } from './useIsPhone';

function fakeMatchMedia(initial: boolean) {
  let listener: (() => void) | undefined;

  const query = {
    matches: initial,
    addEventListener: (_: string, fn: () => void) => (listener = fn),
    removeEventListener: vi.fn(),
  };
  window.matchMedia = vi.fn(() => query) as unknown as typeof window.matchMedia;

  return {
    query,
    change(matches: boolean) {
      query.matches = matches;
      act(() => listener?.());
    },
  };
}

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

describe('useIsPhone', () => {
  it('is true in the touch layout (below 768 px or a finger) and follows changes', () => {
    const media = fakeMatchMedia(true);
    const { result, unmount } = renderHook(() => useIsPhone());

    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767.9px), (pointer: coarse)');
    expect(result.current).toBe(true);

    media.change(false);
    expect(result.current).toBe(false);

    unmount();
    expect(media.query.removeEventListener).toHaveBeenCalled();
  });

  it('is false on desktop', () => {
    fakeMatchMedia(false);
    expect(renderHook(() => useIsPhone()).result.current).toBe(false);
  });
});
