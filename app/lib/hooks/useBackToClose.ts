import { useEffect, useRef } from 'react';
import { isTouchLayout } from '~/lib/touchLayout';

/**
 * Touch layout: Back closes the open sheet, page or chat list first, and only
 * then leaves the page.
 *
 * Opening an overlay adds one history entry (same address, a copy of the
 * router's state plus a marker). Back lands on the entry below; that popstate
 * is caught before React Router sees it and closes the top overlay instead of
 * navigating. Closing an overlay with its own button removes its entry again.
 * An entry left behind (for example the chat list was closed by opening a
 * chat) is skipped when Back reaches it. A desktop with a mouse is unchanged.
 */

const MARKER = '__caOverlay';

interface Overlay {
  id: number;
  close: () => void;
}

const stack: Overlay[] = [];

let nextId = 1;

/** popstates caused by our own history.back() calls, swallowed when they arrive */
let ownBacks = 0;

/*
 * Every history step runs in order, each after the one before has landed.
 * (history.back() is asynchronous: closing one sheet and opening the next in
 * the same tap must not let the push overtake the back.)
 */
let queue: Promise<void> = Promise.resolve();
let resolveOwnBack: (() => void) | undefined;

function enqueue(step: () => void | Promise<void>) {
  queue = queue.then(step).catch(() => undefined);
}

let listening = false;

function markerOf(state: unknown): number | undefined {
  const value = (state as Record<string, unknown> | null)?.[MARKER];
  return typeof value === 'number' ? value : undefined;
}

/** history.back() whose popstate is swallowed; resolves once it has landed (or after 1 s). */
function goBackQuietly(): Promise<void> {
  ownBacks++;

  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 1_000);

    resolveOwnBack = () => {
      clearTimeout(timer);
      resolve();
    };
    window.history.back();
  });
}

function onPopState(event: PopStateEvent) {
  if (ownBacks > 0) {
    ownBacks--;
    event.stopImmediatePropagation();
    resolveOwnBack?.();

    return;
  }

  const top = stack[stack.length - 1];

  if (top && markerOf(event.state) !== top.id) {
    // Back from the top overlay's entry: close it, and keep the router out of it
    event.stopImmediatePropagation();
    stack.pop();
    top.close();

    return;
  }

  if (!top && markerOf(event.state) !== undefined) {
    // a leftover entry: skip it; the router then sees the step to the real page
    event.stopImmediatePropagation();
    window.history.back();
  }
}

function listen() {
  if (!listening && typeof window !== 'undefined') {
    // capture: runs before React Router's own popstate listener on window
    window.addEventListener('popstate', onPopState, { capture: true });
    listening = true;
  }
}

/** Adds a history entry for an open overlay; returns its id. */
export function openOverlay(close: () => void): number {
  listen();

  const id = nextId++;
  stack.push({ id, close });

  enqueue(() => {
    // still open once the earlier steps have landed
    if (stack.some((overlay) => overlay.id === id)) {
      const state = (window.history.state as Record<string, unknown> | null) ?? {};
      window.history.pushState({ ...state, [MARKER]: id }, '');
    }
  });

  return id;
}

/** The overlay closed by itself (its button or the dark background): remove its entry. */
export function closeOverlay(id: number) {
  const index = stack.findIndex((overlay) => overlay.id === id);

  if (index < 0) {
    return; // already closed by Back
  }

  stack.splice(index, 1);

  // only when its entry is the current one; after a navigation it is left behind and skipped later
  enqueue(() => (markerOf(window.history.state) === id ? goBackQuietly() : undefined));
}

/**
 * Before navigating away from an open overlay (opening a project from the
 * Projects page): forget the open overlays and remove their history entries,
 * so the router's push lands on the real page and Back works as usual.
 */
export function leaveOverlays(): Promise<void> {
  stack.length = 0;

  enqueue(async () => {
    while (typeof window !== 'undefined' && markerOf(window.history.state) !== undefined) {
      await goBackQuietly();
    }
  });

  return queue;
}

/** For tests. */
export function resetOverlayHistory() {
  stack.length = 0;
  ownBacks = 0;
  queue = Promise.resolve();
}

/** Touch layout: while `open`, Back calls `close` instead of leaving the page. */
export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open || !isTouchLayout()) {
      return undefined;
    }

    const id = openOverlay(() => closeRef.current());

    return () => closeOverlay(id);
  }, [open]);
}
