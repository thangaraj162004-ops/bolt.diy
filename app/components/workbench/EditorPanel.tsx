import { useStore } from '@nanostores/react';
import * as Tabs from '@radix-ui/react-tabs';
import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { FileBreadcrumb } from './FileBreadcrumb';
import { FileTree } from './FileTree';
import { LockManager } from './LockManager'; // <-- Import LockManager
import { Search } from './Search'; // <-- Ensure Search is imported
import {
  CodeMirrorEditor,
  type EditorDocument,
  type EditorSettings,
  type OnChangeCallback as OnEditorChange,
  type OnSaveCallback as OnEditorSave,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { PanelHeader } from '~/components/ui/PanelHeader';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { useBackToClose } from '~/lib/hooks/useBackToClose';
import { useIsPhone } from '~/lib/hooks/useIsPhone';
import type { FileMap } from '~/lib/stores/files';
import { themeStore } from '~/lib/stores/theme';
import type { FileHistory } from '~/types/actions';
import { classNames } from '~/utils/classNames'; // <-- Import classNames if not already present
import { WORK_DIR } from '~/utils/constants';
import { renderLogger } from '~/utils/logger';
import { isMobile } from '~/utils/mobile';

interface EditorPanelProps {
  files?: FileMap;
  unsavedFiles?: Set<string>;
  editorDocument?: EditorDocument;
  selectedFile?: string | undefined;
  isStreaming?: boolean;
  fileHistory?: Record<string, FileHistory>;
  onEditorChange?: OnEditorChange;
  onEditorScroll?: OnEditorScroll;
  onFileSelect?: (value?: string) => void;
  onFileSave?: OnEditorSave;
  onFileReset?: () => void;
}

const editorSettings: EditorSettings = { tabSize: 2 };

// phone: long lines wrap, so the code never scrolls sideways
const phoneEditorSettings: EditorSettings = { tabSize: 2, lineWrapping: true };

/** A drag that starts this close to the screen edge is left to the system (Android's Back gesture). */
export const EDGE_GUARD_PX = 24;

interface PhoneCodeViewProps {
  fileName?: string;
  filesOpen: boolean;
  onFilesOpenChange: (open: boolean) => void;
  fileList: ReactNode;
  editor: ReactNode;
  saveButtons: ReactNode;
}

/**
 * Phone Code tab: the editor fills the width under a top bar with a 44 px
 * file-list button and the file name. The button slides the file list in
 * from the left over the editor (85% wide, dark background). Choosing a file,
 * tapping the background or dragging the list to the left closes it. Without
 * an open file the file list fills the width.
 */
export function PhoneCodeView({
  fileName,
  filesOpen,
  onFilesOpenChange,
  fileList,
  editor,
  saveButtons,
}: PhoneCodeViewProps) {
  const [dragX, setDragX] = useState(0);
  const dragStart = useRef<number | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement>(null);

  if (!fileName) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden" data-testid="phone-file-list-full">
        {fileList}
      </div>
    );
  }

  const endDrag = () => {
    const width = panelRef.current?.offsetWidth || 300;

    if (dragX < -width * 0.3) {
      onFilesOpenChange(false);
    }

    dragStart.current = undefined;
    setDragX(0);
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden" data-testid="phone-code-view">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-ca-elements-borderColor pr-1">
        <button
          type="button"
          aria-label="Show files"
          aria-expanded={filesOpen}
          onClick={() => onFilesOpenChange(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center bg-transparent text-ca-elements-textSecondary"
        >
          <span className="i-ph:sidebar-simple text-xl" aria-hidden="true" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm text-ca-elements-textPrimary" data-testid="phone-file-name">
          {fileName}
        </span>
        {saveButtons}
      </div>
      <div className="min-h-0 w-full flex-1 overflow-hidden">{editor}</div>

      {/* the file list, over the editor */}
      <div
        aria-hidden="true"
        data-testid="phone-files-backdrop"
        onClick={() => onFilesOpenChange(false)}
        className={classNames(
          'absolute inset-0 z-10 bg-black/50 transition-opacity',
          filesOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Files"
        aria-hidden={!filesOpen}
        data-testid="phone-files-panel"
        style={{ transform: filesOpen ? `translateX(${Math.min(0, dragX)}px)` : 'translateX(-100%)' }}
        className={classNames(
          'absolute inset-y-0 left-0 z-20 flex w-[85%] flex-col overflow-hidden border-r border-ca-elements-borderColor bg-ca-elements-background-depth-1 shadow-xl',
          dragStart.current === undefined ? 'transition-transform duration-200' : '',
          filesOpen ? '' : 'invisible',
        )}
        onTouchStart={(event) => {
          const x = event.touches[0]?.clientX ?? 0;

          // touches that start at the screen edge belong to the system (Back), not to this drag
          dragStart.current = x < EDGE_GUARD_PX || x > window.innerWidth - EDGE_GUARD_PX ? undefined : x;
        }}
        onTouchMove={(event) => {
          if (dragStart.current !== undefined) {
            setDragX((event.touches[0]?.clientX ?? 0) - dragStart.current);
          }
        }}
        onTouchEnd={endDrag}
        onTouchCancel={endDrag}
      >
        {fileList}
      </div>
    </div>
  );
}

export const EditorPanel = memo(
  ({
    files,
    unsavedFiles,
    editorDocument,
    selectedFile,
    isStreaming,
    fileHistory,
    onFileSelect,
    onEditorChange,
    onEditorScroll,
    onFileSave,
    onFileReset,
  }: EditorPanelProps) => {
    renderLogger.trace('EditorPanel');

    const theme = useStore(themeStore);
    const isPhone = useIsPhone();
    const [filesOpen, setFilesOpen] = useState(false);

    // phone: choosing a file also closes the file list
    const chooseFile = useCallback(
      (value?: string) => {
        onFileSelect?.(value);
        setFilesOpen(false);
      },
      [onFileSelect],
    );

    // phone: Back closes the file list first
    useBackToClose(isPhone && filesOpen, () => setFilesOpen(false));

    const activeFileSegments = useMemo(() => {
      if (!editorDocument) {
        return undefined;
      }

      return editorDocument.filePath.split('/');
    }, [editorDocument]);

    const activeFileUnsaved = useMemo(() => {
      if (!editorDocument || !unsavedFiles) {
        return false;
      }

      // Make sure unsavedFiles is a Set before calling has()
      return unsavedFiles instanceof Set && unsavedFiles.has(editorDocument.filePath);
    }, [editorDocument, unsavedFiles]);

    const fileList = (
      <Tabs.Root defaultValue="files" className="flex flex-col h-full">
        <PanelHeader className="w-full text-sm font-medium text-ca-elements-textSecondary px-1">
          <div className="h-full flex-shrink-0 flex items-center justify-between w-full">
            <Tabs.List className="h-full flex-shrink-0 flex items-center">
              <Tabs.Trigger
                value="files"
                className={classNames(
                  'h-full bg-transparent hover:bg-ca-elements-background-depth-3 py-0.5 px-2 rounded-lg text-sm font-medium text-ca-elements-textTertiary hover:text-ca-elements-textPrimary data-[state=active]:text-ca-elements-textPrimary',
                )}
              >
                Files
              </Tabs.Trigger>
              <Tabs.Trigger
                value="search"
                className={classNames(
                  'h-full bg-transparent hover:bg-ca-elements-background-depth-3 py-0.5 px-2 rounded-lg text-sm font-medium text-ca-elements-textTertiary hover:text-ca-elements-textPrimary data-[state=active]:text-ca-elements-textPrimary',
                )}
              >
                Search
              </Tabs.Trigger>
              <Tabs.Trigger
                value="locks"
                className={classNames(
                  'h-full bg-transparent hover:bg-ca-elements-background-depth-3 py-0.5 px-2 rounded-lg text-sm font-medium text-ca-elements-textTertiary hover:text-ca-elements-textPrimary data-[state=active]:text-ca-elements-textPrimary',
                )}
              >
                Locks
              </Tabs.Trigger>
            </Tabs.List>
          </div>
        </PanelHeader>

        <Tabs.Content value="files" className="flex-grow overflow-auto focus-visible:outline-none">
          <FileTree
            className="h-full"
            files={files}
            hideRoot
            unsavedFiles={unsavedFiles}
            fileHistory={fileHistory}
            rootFolder={WORK_DIR}
            selectedFile={selectedFile}
            onFileSelect={chooseFile}
          />
        </Tabs.Content>

        <Tabs.Content value="search" className="flex-grow overflow-auto focus-visible:outline-none">
          <Search />
        </Tabs.Content>

        <Tabs.Content value="locks" className="flex-grow overflow-auto focus-visible:outline-none">
          <LockManager />
        </Tabs.Content>
      </Tabs.Root>
    );

    const editor = (
      <CodeMirrorEditor
        theme={theme}
        editable={!isStreaming && editorDocument !== undefined}
        settings={isPhone ? phoneEditorSettings : editorSettings}
        doc={editorDocument}
        autoFocusOnDocumentChange={!isMobile()}
        onScroll={onEditorScroll}
        onChange={onEditorChange}
        onSave={onFileSave}
      />
    );

    const saveButtons = activeFileUnsaved && (
      <div className="flex shrink-0 gap-1">
        <PanelHeaderButton onClick={onFileSave}>
          <div className="i-ph:floppy-disk-duotone" />
          Save
        </PanelHeaderButton>
        <PanelHeaderButton onClick={onFileReset}>
          <div className="i-ph:clock-counter-clockwise-duotone" />
          Reset
        </PanelHeaderButton>
      </div>
    );

    if (isPhone) {
      return (
        <PhoneCodeView
          fileName={activeFileSegments?.[activeFileSegments.length - 1]}
          filesOpen={filesOpen}
          onFilesOpenChange={setFilesOpen}
          fileList={fileList}
          editor={editor}
          saveButtons={saveButtons}
        />
      );
    }

    return (
      <Group orientation="horizontal">
        <Panel defaultSize={20} minSize={15} collapsible className="border-r border-ca-elements-borderColor">
          <div className="h-full">{fileList}</div>
        </Panel>

        <Separator />
        <Panel className="flex flex-col" defaultSize={80} minSize={20}>
          <PanelHeader className="overflow-x-auto">
            {activeFileSegments?.length && (
              <div className="flex items-center flex-1 text-sm">
                <FileBreadcrumb pathSegments={activeFileSegments} files={files} onFileSelect={onFileSelect} />
                {activeFileUnsaved && (
                  <div className="flex gap-1 ml-auto -mr-1.5">
                    <PanelHeaderButton onClick={onFileSave}>
                      <div className="i-ph:floppy-disk-duotone" />
                      Save
                    </PanelHeaderButton>
                    <PanelHeaderButton onClick={onFileReset}>
                      <div className="i-ph:clock-counter-clockwise-duotone" />
                      Reset
                    </PanelHeaderButton>
                  </div>
                )}
              </div>
            )}
          </PanelHeader>
          <div className="h-full flex-1 overflow-hidden modern-scrollbar">{editor}</div>
        </Panel>
      </Group>
    );
  },
);
