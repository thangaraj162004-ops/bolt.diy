import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// the editor and the file list are stand-ins; this is about the phone Code tab frame
vi.mock('~/components/editor/codemirror/CodeMirrorEditor', () => ({ CodeMirrorEditor: () => null }));
vi.mock('./FileTree', () => ({ FileTree: () => null }));
vi.mock('./Search', () => ({ Search: () => null }));
vi.mock('./LockManager', () => ({ LockManager: () => null }));
vi.mock('./FileBreadcrumb', () => ({ FileBreadcrumb: () => null }));

const { EDGE_GUARD_PX, PhoneCodeView } = await import('./EditorPanel');

afterEach(cleanup);

function renderView(fileName: string | undefined, filesOpen = false) {
  const onFilesOpenChange = vi.fn();

  render(
    <PhoneCodeView
      fileName={fileName}
      filesOpen={filesOpen}
      onFilesOpenChange={onFilesOpenChange}
      fileList={<div data-testid="file-list">files</div>}
      editor={<div data-testid="editor">editor</div>}
      saveButtons={null}
    />,
  );

  return onFilesOpenChange;
}

const touch = (x: number) => ({ touches: [{ clientX: x }] });

describe('phone Code tab (Task 11G)', () => {
  it('without an open file, the file list fills the width', () => {
    renderView(undefined);

    expect(screen.getByTestId('phone-file-list-full')).toBeTruthy();
    expect(screen.queryByTestId('editor')).toBeNull();
  });

  it('with a file: the editor fills the width under a bar with a 44 px file-list button and the file name', () => {
    const onFilesOpenChange = renderView('App.tsx');

    expect(screen.getByTestId('phone-file-name').textContent).toBe('App.tsx');
    expect(screen.getByTestId('editor').parentElement!.className).toContain('w-full');

    const button = screen.getByRole('button', { name: 'Show files' });
    expect(button.className).toContain('h-11 w-11');

    // closed: the list is off screen and cannot be tapped
    const panel = screen.getByTestId('phone-files-panel');
    expect(panel.style.transform).toBe('translateX(-100%)');
    expect(panel.className).toContain('invisible');

    fireEvent.click(button);
    expect(onFilesOpenChange).toHaveBeenCalledWith(true);
  });

  it('open: the list slides over the editor (85% wide); the dark background closes it', () => {
    const onFilesOpenChange = renderView('App.tsx', true);

    const panel = screen.getByTestId('phone-files-panel');
    expect(panel.style.transform).toBe('translateX(0px)');
    expect(panel.className).toContain('w-[85%]');

    fireEvent.click(screen.getByTestId('phone-files-backdrop'));
    expect(onFilesOpenChange).toHaveBeenCalledWith(false);
  });

  it('dragging the list to the left closes it', () => {
    const onFilesOpenChange = renderView('App.tsx', true);
    const panel = screen.getByTestId('phone-files-panel');

    fireEvent.touchStart(panel, touch(200));
    fireEvent.touchMove(panel, touch(40));
    fireEvent.touchEnd(panel);

    expect(onFilesOpenChange).toHaveBeenCalledWith(false);
  });

  it('a drag that starts within 24 px of the screen edge is ignored (it is the system Back gesture)', () => {
    const onFilesOpenChange = renderView('App.tsx', true);
    const panel = screen.getByTestId('phone-files-panel');

    expect(EDGE_GUARD_PX).toBe(24);

    fireEvent.touchStart(panel, touch(10));
    fireEvent.touchMove(panel, touch(-200));
    fireEvent.touchEnd(panel);

    expect(onFilesOpenChange).not.toHaveBeenCalled();
  });

  it('a short drag does not close it', () => {
    const onFilesOpenChange = renderView('App.tsx', true);
    const panel = screen.getByTestId('phone-files-panel');

    fireEvent.touchStart(panel, touch(200));
    fireEvent.touchMove(panel, touch(180));
    fireEvent.touchEnd(panel);

    expect(onFilesOpenChange).not.toHaveBeenCalled();
  });
});
