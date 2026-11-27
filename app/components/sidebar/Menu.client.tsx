import { useStore } from '@nanostores/react';
import { motion, type Variants } from 'framer-motion';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { HistoryItem } from './HistoryItem';
import { binDates } from './date-binning';

/*
 * Lazy-load the heavy ControlPanel (settings UI).  Most users don't open it on
 * every visit, so keeping it out of the critical-path bundle improves initial
 * load time.
 */
const LazyControlPanel = lazy(() =>
  import('~/components/@settings/core/ControlPanel').then((m) => ({ default: m.ControlPanel })),
);
import { ProjectsPage } from '~/components/projects/ProjectsPage';
import { Button } from '~/components/ui/Button';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { SettingsButton, OpenSourceNoticesLink } from '~/components/ui/SettingsButton';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { UserAvatar, displayName } from '~/components/ui/UserAvatar';
import { useSearchFilter } from '~/lib/hooks/useSearchFilter';
import {
  db,
  deleteById,
  description as descriptionStore,
  duplicateChat,
  getAll,
  getMessagesByUrlId,
  getSnapshot,
  setSnapshot,
  chatId,
  type ChatHistoryItem,
  updateChatDescription,
  useChatHistory,
} from '~/lib/persistence';
import { sidebarEntry } from '~/lib/persistence/chatTitle';
import { projectLinks } from '~/lib/projects/links';
import { isOnlineOnlyId, mergeProjects, type ProjectEntry } from '~/lib/projects/merge';
import { getProjectSync, onlineProjects } from '~/lib/projects/sync';
import {
  OPEN_SETTINGS_EVENT,
  isPhoneWidth,
  projectsPageOpen,
  settingsPanelOpen,
  sidebarOpen,
} from '~/lib/stores/layout';
import { DEFAULT_AVATAR, profileStore } from '~/lib/stores/profile';
import { authState } from '~/lib/supabase/auth';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';

const menuVariants = {
  closed: {
    opacity: 0,
    visibility: 'hidden',
    left: '-340px',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    opacity: 1,
    visibility: 'initial',
    left: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

type DialogContent =
  { type: 'delete'; item: ChatHistoryItem } | { type: 'bulkDelete'; items: ChatHistoryItem[] } | null;

function CurrentDateTime() {
  const [dateTime, setDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setDateTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800/50">
      <div className="h-4 w-4 i-ph:clock opacity-80" />
      <div className="flex gap-2">
        <span>{dateTime.toLocaleDateString()}</span>
        <span>{dateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}

export const Menu = () => {
  const { exportChat } = useChatHistory({ loadHistory: false });
  const menuRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<ChatHistoryItem[]>([]);

  // shared, so the header's menu button can open it too
  const open = useStore(sidebarOpen);
  const setOpen = useCallback((value: boolean) => sidebarOpen.set(value), []);
  const location = useLocation();
  const navigate = useNavigate();
  const isProjectsOpen = useStore(projectsPageOpen);

  // on a phone the sidebar covers the screen: close it (and the Projects page) after a chat is opened
  useEffect(() => {
    if (isPhoneWidth()) {
      sidebarOpen.set(false);
      projectsPageOpen.set(false);
    }
  }, [location.pathname]);

  const [dialogContent, setDialogContent] = useState<DialogContent>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined);

  // the header keeps its logo under Settings while it is open
  useEffect(() => {
    settingsPanelOpen.set(isSettingsOpen);

    return () => settingsPanelOpen.set(false);
  }, [isSettingsOpen]);

  const profile = useStore(profileStore);
  const auth = useStore(authState);
  const phoneName = displayName(profile?.username, auth.status === 'signed-in' ? auth.email : undefined);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  // the browser list merged with the signed-in user's online projects
  const links = useStore(projectLinks);
  const online = useStore(onlineProjects);
  const userId = auth.status === 'signed-in' ? auth.userId : undefined;

  const entries = useMemo(
    () => mergeProjects(list, links, online.userId === userId ? online.items : [], userId),
    [list, links, online, userId],
  );

  const { filteredItems: filteredList, handleSearchChange } = useSearchFilter({
    items: entries,
    searchFields: ['description'],
  });

  const loadEntries = useCallback(() => {
    if (db) {
      getAll(db)
        // every chat with messages, with a title and a link (also chats saved without them before)
        .then((list) => list.map((item) => sidebarEntry(item)).filter((item): item is ChatHistoryItem => !!item))
        .then(setList)
        .catch((error) => toast.error(error.message));
    }
  }, []);

  const deleteChat = useCallback(
    async (id: string): Promise<void> => {
      // signed in: the online copy goes first, so a failure keeps both copies
      await getProjectSync()?.remove(id);

      if (isOnlineOnlyId(id)) {
        return;
      }

      if (!db) {
        throw new Error('Database not available');
      }

      // Delete chat snapshot from localStorage
      try {
        const snapshotKey = `snapshot:${id}`;
        localStorage.removeItem(snapshotKey);
        console.log('Removed snapshot for chat:', id);
      } catch (snapshotError) {
        console.error(`Error deleting snapshot for chat ${id}:`, snapshotError);
      }

      // Delete the chat from the database
      await deleteById(db, id);
      console.log('Successfully deleted chat:', id);
    },
    [db],
  );

  const deleteItem = useCallback(
    (event: React.UIEvent, item: ChatHistoryItem) => {
      event.preventDefault();
      event.stopPropagation();

      // Log the delete operation to help debugging
      console.log('Attempting to delete chat:', { id: item.id, description: item.description });

      deleteChat(item.id)
        .then(() => {
          toast.success('Chat deleted successfully', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          // Always refresh the list
          loadEntries();

          if (chatId.get() === item.id) {
            // hard page navigation to clear the stores
            console.log('Navigating away from deleted chat');
            window.location.pathname = '/';
          }
        })
        .catch((error) => {
          console.error('Failed to delete chat:', error);
          toast.error('Failed to delete conversation', {
            position: 'bottom-right',
            autoClose: 3000,
          });

          // Still try to reload entries in case data has changed
          loadEntries();
        });
    },
    [loadEntries, deleteChat],
  );

  const deleteSelectedItems = useCallback(
    async (itemsToDeleteIds: string[]) => {
      if (!db || itemsToDeleteIds.length === 0) {
        console.log('Bulk delete skipped: No DB or no items to delete.');
        return;
      }

      console.log(`Starting bulk delete for ${itemsToDeleteIds.length} chats`, itemsToDeleteIds);

      let deletedCount = 0;

      const errors: string[] = [];
      const currentChatId = chatId.get();

      let shouldNavigate = false;

      // Process deletions sequentially using the shared deleteChat logic
      for (const id of itemsToDeleteIds) {
        try {
          await deleteChat(id);
          deletedCount++;

          if (id === currentChatId) {
            shouldNavigate = true;
          }
        } catch (error) {
          console.error(`Error deleting chat ${id}:`, error);
          errors.push(id);
        }
      }

      // Show appropriate toast message
      if (errors.length === 0) {
        toast.success(`${deletedCount} chat${deletedCount === 1 ? '' : 's'} deleted successfully`);
      } else {
        toast.warning(`Deleted ${deletedCount} of ${itemsToDeleteIds.length} chats. ${errors.length} failed.`, {
          autoClose: 5000,
        });
      }

      // Reload the list after all deletions
      await loadEntries();

      // Clear selection state
      setSelectedItems([]);
      setSelectionMode(false);

      // Navigate if needed
      if (shouldNavigate) {
        console.log('Navigating away from deleted chat');
        window.location.pathname = '/';
      }
    },
    [deleteChat, loadEntries, db],
  );

  const closeDialog = () => {
    setDialogContent(null);
  };

  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);

    if (selectionMode) {
      // If turning selection mode OFF, clear selection
      setSelectedItems([]);
    }
  };

  const toggleItemSelection = useCallback((id: string) => {
    setSelectedItems((prev) => {
      const newSelectedItems = prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id];
      console.log('Selected items updated:', newSelectedItems);

      return newSelectedItems; // Return the new array
    });
  }, []); // No dependencies needed

  const handleBulkDeleteClick = useCallback(() => {
    if (selectedItems.length === 0) {
      toast.info('Select at least one chat to delete');
      return;
    }

    const selectedChats = list.filter((item) => selectedItems.includes(item.id));

    if (selectedChats.length === 0) {
      toast.error('Could not find selected chats');
      return;
    }

    setDialogContent({ type: 'bulkDelete', items: selectedChats });
  }, [selectedItems, list]); // Keep list dependency

  const selectAll = useCallback(() => {
    const allFilteredIds = filteredList.map((item) => item.id);
    setSelectedItems((prev) => {
      const allFilteredAreSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => prev.includes(id));

      if (allFilteredAreSelected) {
        // Deselect only the filtered items
        const newSelectedItems = prev.filter((id) => !allFilteredIds.includes(id));
        console.log('Deselecting all filtered items. New selection:', newSelectedItems);

        return newSelectedItems;
      } else {
        // Select all filtered items, adding them to any existing selections
        const newSelectedItems = [...new Set([...prev, ...allFilteredIds])];
        console.log('Selecting all filtered items. New selection:', newSelectedItems);

        return newSelectedItems;
      }
    });
  }, [filteredList]); // Depends only on filteredList

  useEffect(() => {
    if (open || isProjectsOpen) {
      loadEntries();

      // the online list, at most every 30 seconds
      if (Date.now() - onlineProjects.get().loadedAt > 30_000) {
        void getProjectSync()?.refreshList();
      }
    }
  }, [open, isProjectsOpen, loadEntries]);

  // phone "Projects" page actions
  const openProject = useCallback(
    async (item: ProjectEntry) => {
      try {
        // an online-only project (or a newer online copy) is downloaded first
        const local = (await getProjectSync()?.ensureLocal(item)) ?? item;

        projectsPageOpen.set(false);
        navigate(`/chat/${local.urlId || local.id}`);
      } catch (error) {
        toast.error('Could not open the project: ' + (error as Error).message);
      }
    },
    [navigate],
  );

  const exportProject = useCallback(
    async (item: ProjectEntry) => {
      try {
        const local = (await getProjectSync()?.ensureLocal(item)) ?? item;
        await exportChat(local.id);
        loadEntries();
      } catch (error) {
        toast.error('Could not export the project: ' + (error as Error).message);
      }
    },
    [exportChat, loadEntries],
  );

  const renameProject = useCallback(
    async (item: ProjectEntry, title: string) => {
      if (!db) {
        return;
      }

      try {
        if (!isOnlineOnlyId(item.id)) {
          await updateChatDescription(db, item.id, title);
        }

        // signed in: the online copy too
        await getProjectSync()?.rename(item.id, title);

        if (chatId.get() === item.id) {
          descriptionStore.set(title);
        }

        toast.success('Project renamed');
      } catch (error) {
        toast.error('Failed to rename project: ' + (error as Error).message);
      }

      loadEntries();
    },
    [loadEntries],
  );

  // copies exactly this project (not the chat that is open), and stays on the page
  const duplicateProject = useCallback(
    async (item: ProjectEntry) => {
      if (!db) {
        return;
      }

      try {
        const sync = getProjectSync();
        const source = (await sync?.ensureLocal(item)) ?? item;
        const newUrlId = await duplicateChat(db, source.id);
        const copy = await getMessagesByUrlId(db, newUrlId);

        // the copy gets the files too
        const snapshot = await getSnapshot(db, source.id);

        if (copy && snapshot) {
          await setSnapshot(db, copy.id, snapshot);
        }

        // signed in: save the copy online right away
        if (copy && sync) {
          sync.markChanged(copy.id);
          void sync.flush();
        }

        toast.success('Project duplicated');
      } catch (error) {
        console.error('Failed to duplicate project:', error);
        toast.error('Failed to duplicate project');
      }

      loadEntries();
    },
    [loadEntries],
  );

  // Exit selection mode when sidebar is closed
  useEffect(() => {
    if (!open && selectionMode) {
      /*
       * Don't clear selection state anymore when sidebar closes
       * This allows the selection to persist when reopening the sidebar
       */
      console.log('Sidebar closed, preserving selection state');
    }
  }, [open, selectionMode]);

  useEffect(() => {
    const enterThreshold = 20;
    const exitThreshold = 20;

    function onMouseMove(event: PointerEvent) {
      /*
       * Only a real mouse opens and closes the sidebar by moving to the edge.
       * A phone sends mouse events for every tap too: a tap on the menu button
       * (near the left edge) used to reopen the sidebar right after it closed.
       */
      if (isSettingsOpen || event.pointerType !== 'mouse') {
        return;
      }

      if (event.pageX < enterThreshold) {
        setOpen(true);
      }

      if (menuRef.current && event.clientX > menuRef.current.getBoundingClientRect().right + exitThreshold) {
        setOpen(false);
      }
    }

    window.addEventListener('pointermove', onMouseMove);

    return () => {
      window.removeEventListener('pointermove', onMouseMove);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    const handleOpenGitHubSettings = () => {
      setSettingsInitialTab('github');
      setIsSettingsOpen(true);
      setOpen(false);
    };

    // the phone account menu's "Settings" row
    const handleOpenSettings = () => {
      setSettingsInitialTab(undefined);
      setIsSettingsOpen(true);
      setOpen(false);
    };

    document.addEventListener('open-github-settings', handleOpenGitHubSettings);
    document.addEventListener(OPEN_SETTINGS_EVENT, handleOpenSettings);

    return () => {
      document.removeEventListener('open-github-settings', handleOpenGitHubSettings);
      document.removeEventListener(OPEN_SETTINGS_EVENT, handleOpenSettings);
    };
  }, []);

  const handleSettingsClick = () => {
    setIsSettingsOpen(true);
    setOpen(false);
  };

  const handleSettingsClose = () => {
    setIsSettingsOpen(false);
    setSettingsInitialTab(undefined);
  };

  const setDialogContentWithLogging = useCallback((content: DialogContent) => {
    console.log('Setting dialog content:', content);
    setDialogContent(content);
  }, []);

  return (
    <>
      {/* phone: tapping outside the open sidebar closes it (there is no mouse to move away) */}
      {open && !isSettingsOpen && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          data-testid="sidebar-backdrop"
          className="md:hidden fixed inset-0 z-sidebar bg-black/40 cursor-default"
          onClick={() => setOpen(false)}
        />
      )}

      <motion.div
        ref={menuRef}
        initial="closed"
        animate={open ? 'open' : 'closed'}
        variants={menuVariants}
        className={classNames(
          'w-[340px] max-md:w-[min(340px,85vw)]', // never wider than 85% of a phone screen
          'flex selection-accent flex-col side-menu fixed top-0 h-full rounded-r-2xl',
          'bg-ca-elements-background-depth-1 border-r border-ca-elements-borderColor',
          'shadow-sm text-sm',
          isSettingsOpen ? 'z-40' : 'z-sidebar',
        )}
      >
        <div className="h-12 flex items-center justify-between px-4 max-md:pl-1 border-b border-ca-elements-borderColor bg-ca-elements-background-depth-2 rounded-tr-2xl">
          <div className="text-ca-elements-textPrimary font-medium">
            {/* phone: the same icon as the header's menu button closes the sidebar */}
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="md:hidden flex h-11 w-11 items-center justify-center bg-transparent text-ca-elements-textPrimary"
            >
              <span className="i-ph:sidebar-simple-duotone text-xl" aria-hidden="true" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <OpenSourceNoticesLink />
            <span className="max-md:hidden font-medium text-sm text-ca-elements-textPrimary truncate">
              {profile?.username || 'Guest User'}
            </span>
            {/* phone: the same simple circle as the header, instead of the picture */}
            <span className="md:hidden font-medium text-sm text-ca-elements-textPrimary truncate">
              {phoneName || 'Guest'}
            </span>
            <UserAvatar name={phoneName} className="md:hidden" />
            <div className="max-md:hidden flex items-center justify-center w-[32px] h-[32px] overflow-hidden bg-ca-elements-background-depth-3 text-ca-elements-textSecondary rounded-full shrink-0">
              <img
                src={profile?.avatar || DEFAULT_AVATAR}
                alt={profile?.username || 'User'}
                className="w-full h-full object-cover"
                loading="eager"
                decoding="sync"
              />
            </div>
          </div>
        </div>
        <CurrentDateTime />
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
          <div className="p-4 space-y-3">
            <div className="flex gap-2">
              <a
                href="/"
                className="flex-1 flex gap-2 items-center bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-500/20 rounded-lg px-4 py-2 transition-colors"
              >
                <span className="inline-block i-ph:plus-circle h-4 w-4" />
                <span className="text-sm font-medium">Start new chat</span>
              </a>
              <button
                onClick={toggleSelectionMode}
                className={classNames(
                  'flex gap-1 items-center rounded-lg px-3 py-2 transition-colors',
                  selectionMode
                    ? 'bg-purple-600 dark:bg-purple-500 text-white border border-purple-700 dark:border-purple-600'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700',
                )}
                aria-label={selectionMode ? 'Exit selection mode' : 'Enter selection mode'}
              >
                <span className={selectionMode ? 'i-ph:x h-4 w-4' : 'i-ph:check-square h-4 w-4'} />
              </button>
            </div>
            <div className="relative w-full">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <span className="i-ph:magnifying-glass h-4 w-4 text-gray-400 dark:text-gray-500" />
              </div>
              <input
                className="w-full bg-ca-elements-background-depth-2 relative pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-ca-elements-borderColorActive/50 text-sm text-ca-elements-textPrimary placeholder-ca-elements-textTertiary border border-ca-elements-borderColor"
                type="search"
                placeholder="Search chats..."
                onChange={handleSearchChange}
                aria-label="Search chats"
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-sm px-4 py-2">
            <div className="font-medium text-gray-600 dark:text-gray-400">Your Chats</div>
            {selectionMode && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll}>
                  {selectedItems.length === filteredList.length ? 'Deselect all' : 'Select all'}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDeleteClick}
                  disabled={selectedItems.length === 0}
                >
                  Delete selected
                </Button>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-auto modern-scrollbar px-3 pb-3">
            {filteredList.length === 0 && (
              <div className="px-4 text-gray-500 dark:text-gray-400 text-sm">
                {list.length === 0 ? 'No previous conversations' : 'No matches found'}
              </div>
            )}
            <DialogRoot open={dialogContent !== null}>
              {binDates(filteredList).map(({ category, items }) => (
                <div key={category} className="mt-2 first:mt-0 space-y-1">
                  <div className="text-xs font-medium text-ca-elements-textTertiary sticky top-0 z-1 bg-ca-elements-background-depth-1 px-4 py-1">
                    {category}
                  </div>
                  <div className="space-y-0.5 pr-1">
                    {items.map((item) => (
                      <HistoryItem
                        key={item.id}
                        item={item}
                        savedOnline={(item as ProjectEntry).savedOnline}
                        onOpen={(item as ProjectEntry).savedOnline ? () => void openProject(item) : undefined}
                        exportChat={() => void exportProject(item)}
                        onDelete={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          console.log('Delete triggered for item:', item);
                          setDialogContentWithLogging({ type: 'delete', item });
                        }}
                        onDuplicate={() => void duplicateProject(item)}
                        selectionMode={selectionMode}
                        isSelected={selectedItems.includes(item.id)}
                        onToggleSelection={toggleItemSelection}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <Dialog onBackdrop={closeDialog} onClose={closeDialog}>
                {dialogContent?.type === 'delete' && (
                  <>
                    <div className="p-6 bg-ca-elements-background-depth-1">
                      <DialogTitle className="text-ca-elements-textPrimary">
                        {(dialogContent.item as ProjectEntry).savedOnline ? 'Delete here and online?' : 'Delete Chat?'}
                      </DialogTitle>
                      <DialogDescription className="mt-2 text-ca-elements-textSecondary">
                        <p>
                          You are about to delete{' '}
                          <span className="font-medium text-ca-elements-textPrimary">
                            {dialogContent.item.description}
                          </span>
                        </p>
                        <p className="mt-2">Are you sure you want to delete this chat?</p>
                      </DialogDescription>
                    </div>
                    <div className="flex justify-end gap-3 px-6 py-4 bg-ca-elements-background-depth-2 border-t border-ca-elements-borderColor">
                      <DialogButton type="secondary" onClick={closeDialog}>
                        Cancel
                      </DialogButton>
                      <DialogButton
                        type="danger"
                        onClick={(event) => {
                          console.log('Dialog delete button clicked for item:', dialogContent.item);
                          deleteItem(event, dialogContent.item);
                          closeDialog();
                        }}
                      >
                        Delete
                      </DialogButton>
                    </div>
                  </>
                )}
                {dialogContent?.type === 'bulkDelete' && (
                  <>
                    <div className="p-6 bg-ca-elements-background-depth-1">
                      <DialogTitle className="text-ca-elements-textPrimary">
                        {dialogContent.items.some((item) => (item as ProjectEntry).savedOnline)
                          ? 'Delete here and online?'
                          : 'Delete Selected Chats?'}
                      </DialogTitle>
                      <DialogDescription className="mt-2 text-ca-elements-textSecondary">
                        <p>
                          You are about to delete {dialogContent.items.length}{' '}
                          {dialogContent.items.length === 1 ? 'chat' : 'chats'}:
                        </p>
                        <div className="mt-2 max-h-32 overflow-auto border border-ca-elements-borderColor rounded-md bg-ca-elements-background-depth-2 p-2">
                          <ul className="list-disc pl-5 space-y-1">
                            {dialogContent.items.map((item) => (
                              <li key={item.id} className="text-sm">
                                <span className="font-medium text-ca-elements-textPrimary">{item.description}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <p className="mt-3">Are you sure you want to delete these chats?</p>
                      </DialogDescription>
                    </div>
                    <div className="flex justify-end gap-3 px-6 py-4 bg-ca-elements-background-depth-2 border-t border-ca-elements-borderColor">
                      <DialogButton type="secondary" onClick={closeDialog}>
                        Cancel
                      </DialogButton>
                      <DialogButton
                        type="danger"
                        onClick={() => {
                          /*
                           * Pass the current selectedItems to the delete function.
                           * This captures the state at the moment the user confirms.
                           */
                          const itemsToDeleteNow = [...selectedItems];
                          console.log('Bulk delete confirmed for', itemsToDeleteNow.length, 'items', itemsToDeleteNow);
                          deleteSelectedItems(itemsToDeleteNow);
                          closeDialog();
                        }}
                      >
                        Delete
                      </DialogButton>
                    </div>
                  </>
                )}
              </Dialog>
            </DialogRoot>
          </div>
          {/* phone: all projects on one full-screen page */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              projectsPageOpen.set(true);
            }}
            className="md:hidden flex min-h-11 items-center gap-3 border-t border-ca-elements-borderColor bg-transparent px-4 text-left text-sm font-medium text-ca-elements-textPrimary"
          >
            <span className="i-ph:folder-simple text-lg text-ca-elements-textSecondary" aria-hidden="true" />
            <span className="flex-1">Projects</span>
            <span className="i-ph:caret-right text-ca-elements-textTertiary" aria-hidden="true" />
          </button>
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-800 px-4 py-3">
            <div className="flex items-center gap-3">
              <SettingsButton onClick={handleSettingsClick} />
            </div>
            <ThemeSwitch />
          </div>
        </div>
      </motion.div>

      {/* Persistent sidebar trigger — always visible when sidebar is closed (phones use the header's menu button) */}
      {!open && !isSettingsOpen && (
        <button
          onClick={() => setOpen(true)}
          className={classNames(
            'max-md:hidden fixed left-0 top-[72px] z-sidebar',
            'bg-ca-elements-background-depth-1',
            'border border-l-0 border-ca-elements-borderColor',
            'rounded-r-lg p-1.5 shadow-sm',
            'hover:bg-ca-elements-background-depth-2',
            'transition-colors',
          )}
          aria-label="Open sidebar"
        >
          <div className="i-ph:caret-right text-gray-500 dark:text-gray-400" />
        </button>
      )}

      <Suspense fallback={null}>
        <LazyControlPanel open={isSettingsOpen} onClose={handleSettingsClose} initialTab={settingsInitialTab as any} />
      </Suspense>

      <ProjectsPage
        open={isProjectsOpen}
        onClose={() => projectsPageOpen.set(false)}
        projects={entries}
        tip={auth.status === 'signed-out' ? 'Sign in to keep your projects safe.' : undefined}
        onOpen={openProject}
        onRename={renameProject}
        onDuplicate={duplicateProject}
        onExport={exportProject}
        onDelete={(item) =>
          deleteItem({ preventDefault: noop, stopPropagation: noop } as unknown as React.UIEvent, item)
        }
      />
    </>
  );
};

const noop = () => undefined;
