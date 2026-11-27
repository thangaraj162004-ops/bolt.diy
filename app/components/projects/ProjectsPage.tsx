import * as RadixDialog from '@radix-ui/react-dialog';
import { formatDistanceStrict } from 'date-fns';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ConfirmationDialog, Dialog, DialogTitle } from '~/components/ui/Dialog';
import { avatarLetter } from '~/components/ui/UserAvatar';
import { useBackToClose } from '~/lib/hooks/useBackToClose';
import type { ProjectEntry } from '~/lib/projects/merge';
import { classNames } from '~/utils/classNames';

export interface ProjectsPageProps {
  open: boolean;
  onClose: () => void;

  /** Saved chats (with titles and links); shown newest first. */
  projects: ProjectEntry[];
  onOpen: (project: ProjectEntry) => void;
  onRename: (project: ProjectEntry, title: string) => void | Promise<void>;
  onDuplicate: (project: ProjectEntry) => void | Promise<void>;
  onExport: (project: ProjectEntry) => void | Promise<void>;
  onDelete: (project: ProjectEntry) => void | Promise<void>;

  /** A short tip above the list (guests: "Sign in to keep your projects safe."). */
  tip?: string;

  /** For tests: the current time. */
  now?: number;
}

/** "just now", "5 minutes ago", "3 days ago"… */
export function timeAgo(timestamp: string | undefined, now = Date.now()): string {
  const time = timestamp ? Date.parse(timestamp) : NaN;

  if (Number.isNaN(time)) {
    return '';
  }

  if (now - time < 60_000) {
    return 'just now';
  }

  return formatDistanceStrict(time, now, { addSuffix: true });
}

/** Newest first; the title filter ignores case. */
export function visibleProjects(projects: ProjectEntry[], search: string): ProjectEntry[] {
  const query = search.trim().toLowerCase();

  return projects
    .filter((project) => !query || (project.description ?? '').toLowerCase().includes(query))
    .sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0));
}

const newProjectClass =
  'flex h-12 items-center justify-center gap-2 rounded-full bg-accent-700 px-6 text-base font-medium text-white shadow-lg hover:bg-accent-800';

/**
 * Phone only: a full-screen list of the projects saved in this browser, with
 * search, a "..." sheet per project (Open, Rename, Duplicate, Export, Delete)
 * and a "New project" button.
 */
export function ProjectsPage({
  open,
  onClose,
  projects,
  onOpen,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
  tip,
  now,
}: ProjectsPageProps) {
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [actionsFor, setActionsFor] = useState<ProjectEntry | null>(null);
  const [renaming, setRenaming] = useState<ProjectEntry | null>(null);
  const [deleting, setDeleting] = useState<ProjectEntry | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => visibleProjects(projects, search), [projects, search]);

  // touch layout: Back closes the "..." sheet first, then this page
  useBackToClose(open, onClose);
  useBackToClose(open && actionsFor !== null, () => setActionsFor(null));

  // a fresh page every time it opens
  useEffect(() => {
    if (!open) {
      setSearching(false);
      setSearch('');
      setActionsFor(null);
      setRenaming(null);
      setDeleting(null);
    }
  }, [open]);

  useEffect(() => {
    if (searching) {
      searchRef.current?.focus();
    }
  }, [searching]);

  if (!open) {
    return null;
  }

  // close the sheet first, then do the action
  const fromSheet = (action: (project: ProjectEntry) => void) => () => {
    const project = actionsFor;
    setActionsFor(null);

    if (project) {
      action(project);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Projects"
      data-testid="projects-page"
      className="mouse:hidden fixed inset-0 z-[1000] flex flex-col bg-ca-elements-background-depth-1 text-ca-elements-textPrimary"
    >
      {/* top bar: back arrow, title (or the search box) and a search button */}
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-ca-elements-borderColor px-1">
        <button
          type="button"
          aria-label="Back"
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-transparent"
        >
          <span className="i-ph:arrow-left text-xl" aria-hidden="true" />
        </button>
        {searching ? (
          <>
            <input
              ref={searchRef}
              type="text"
              enterKeyHint="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
              className="h-11 min-w-0 flex-1 rounded-lg border border-ca-elements-borderColor bg-ca-elements-background-depth-2 px-3 text-base text-ca-elements-textPrimary focus:outline-none focus:ring-1 focus:ring-ca-elements-borderColorActive"
            />
            <button
              type="button"
              aria-label="Close search"
              onClick={() => {
                setSearching(false);
                setSearch('');
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-transparent"
            >
              <span className="i-ph:x text-xl" aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            <h2 className="min-w-0 flex-1 truncate text-base font-semibold">Projects</h2>
            {projects.length > 0 && (
              <button
                type="button"
                aria-label="Search projects"
                onClick={() => setSearching(true)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-transparent"
              >
                <span className="i-ph:magnifying-glass text-xl" aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>

      {tip && (
        <p
          className="mx-4 mt-3 flex items-center gap-2 rounded-xl bg-ca-elements-item-backgroundAccent px-3 py-2 text-sm text-ca-elements-item-contentAccent"
          data-testid="projects-tip"
        >
          <span className="i-ph:cloud shrink-0 text-lg" aria-hidden="true" />
          {tip}
        </p>
      )}

      {projects.length === 0 ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
          data-testid="projects-empty"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ca-elements-background-depth-3 text-ca-elements-textSecondary">
            <span className="i-ph:folder-simple text-2xl" aria-hidden="true" />
          </span>
          <p className="text-lg font-semibold">No projects yet</p>
          <a href="/" className={newProjectClass}>
            <span className="i-ph:plus text-lg" aria-hidden="true" />
            New project
          </a>
        </div>
      ) : (
        <>
          <ul
            className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-4 pt-3 pb-28"
            data-testid="projects-list"
          >
            {shown.map((project) => (
              <li
                key={project.id}
                data-testid="project-card"
                className="flex min-h-[72px] items-center rounded-xl border border-ca-elements-borderColor bg-ca-elements-background-depth-2"
              >
                <button
                  type="button"
                  onClick={() => onOpen(project)}
                  className="flex min-h-[72px] min-w-0 flex-1 items-center gap-3 rounded-l-xl bg-transparent py-3 pl-3 text-left"
                >
                  <ProjectPreview title={project.description} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 break-words text-base font-medium text-ca-elements-textPrimary">
                      {project.description}
                    </span>
                    <span className="flex items-center gap-1.5 text-sm text-ca-elements-textSecondary">
                      {project.savedOnline && (
                        <span
                          className="i-ph:cloud-check shrink-0 text-base"
                          role="img"
                          aria-label="Saved online"
                          title="Saved online"
                          data-testid="saved-online"
                        />
                      )}
                      <span data-testid="project-time">{timeAgo(project.timestamp, now)}</span>
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`More actions for ${project.description}`}
                  data-testid="project-more"
                  onClick={() => setActionsFor(project)}
                  className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-transparent text-ca-elements-textSecondary"
                >
                  <span className="i-ph:dots-three-bold text-xl" aria-hidden="true" />
                </button>
              </li>
            ))}
            {shown.length === 0 && (
              <li className="px-2 py-10 text-center text-ca-elements-textSecondary">
                No projects match “{search.trim()}”
              </li>
            )}
          </ul>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-ca-elements-background-depth-1 from-60% to-transparent px-4 pt-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <a href="/" className={classNames(newProjectClass, 'pointer-events-auto w-full max-w-sm')}>
              <span className="i-ph:plus text-lg" aria-hidden="true" />
              New project
            </a>
          </div>
        </>
      )}

      {/* "..." sheet */}
      <RadixDialog.Root open={actionsFor !== null} onOpenChange={(value) => !value && setActionsFor(null)}>
        <RadixDialog.Portal>
          <RadixDialog.Overlay className="mouse:hidden fixed inset-0 z-[9998] bg-black/50" />
          <RadixDialog.Content
            data-testid="project-sheet"
            className="mouse:hidden fixed inset-x-0 bottom-0 z-[9999] max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-ca-elements-borderColor bg-ca-elements-background-depth-1 px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-ca-elements-textPrimary shadow-2xl focus:outline-none"
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-ca-elements-borderColor" aria-hidden="true" />
            <RadixDialog.Title className="truncate px-3 pb-1 text-sm font-medium text-ca-elements-textSecondary">
              {actionsFor?.description}
            </RadixDialog.Title>
            <RadixDialog.Description className="sr-only">Actions for this project.</RadixDialog.Description>
            <SheetRow icon="i-ph:arrow-square-out" onClick={fromSheet(onOpen)}>
              Open
            </SheetRow>
            <SheetRow icon="i-ph:pencil-simple" onClick={fromSheet(setRenaming)}>
              Rename
            </SheetRow>
            <SheetRow icon="i-ph:copy" onClick={fromSheet((project) => void onDuplicate(project))}>
              Duplicate
            </SheetRow>
            <SheetRow icon="i-ph:download-simple" onClick={fromSheet((project) => void onExport(project))}>
              Export
            </SheetRow>
            <SheetRow icon="i-ph:trash" danger onClick={fromSheet(setDeleting)}>
              Delete
            </SheetRow>
          </RadixDialog.Content>
        </RadixDialog.Portal>
      </RadixDialog.Root>

      <RenameDialog
        project={renaming}
        onClose={() => setRenaming(null)}
        onSave={async (project, title) => {
          setRenaming(null);
          await onRename(project, title);
        }}
      />

      <ConfirmationDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title={deleting?.savedOnline ? 'Delete here and online?' : 'Delete project?'}
        description={`“${deleting?.description ?? ''}” will be deleted ${
          deleting?.onlineOnly ? 'online' : deleting?.savedOnline ? 'from this browser and online' : 'from this browser'
        }. This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          const project = deleting;
          setDeleting(null);

          if (project) {
            void onDelete(project);
          }
        }}
      />
    </div>
  );
}

/** A small square: the first letter of the title on a theme color (there are no screenshots yet). */
function ProjectPreview({ title }: { title?: string }) {
  return (
    <span
      aria-hidden="true"
      data-testid="project-preview"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-ca-elements-item-backgroundAccent text-lg font-semibold text-ca-elements-item-contentAccent"
    >
      {avatarLetter(title) ?? <span className="i-ph:folder-simple text-xl" />}
    </span>
  );
}

function SheetRow({
  icon,
  danger,
  onClick,
  children,
}: {
  icon: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        'flex min-h-[52px] w-full items-center gap-3 rounded-xl bg-transparent px-3 text-left text-base hover:bg-ca-elements-item-backgroundActive',
        danger ? 'text-red-500' : 'text-ca-elements-textPrimary',
      )}
    >
      <span className={`${icon} shrink-0 text-xl`} aria-hidden="true" />
      {children}
    </button>
  );
}

function RenameDialog({
  project,
  onClose,
  onSave,
}: {
  project: ProjectEntry | null;
  onClose: () => void;
  onSave: (project: ProjectEntry, title: string) => void;
}) {
  const [title, setTitle] = useState('');

  useEffect(() => {
    setTitle(project?.description ?? '');
  }, [project]);

  return (
    <RadixDialog.Root open={project !== null} onOpenChange={(value) => !value && onClose()}>
      <Dialog className="w-[400px]" onClose={onClose}>
        <form
          className="p-5"
          onSubmit={(event) => {
            event.preventDefault();

            if (project && title.trim()) {
              onSave(project, title.trim());
            }
          }}
        >
          <DialogTitle>Rename project</DialogTitle>
          <RadixDialog.Description className="sr-only">Type a new name for this project.</RadixDialog.Description>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Project name"
            autoFocus
            maxLength={120}
            className="mt-4 h-11 w-full rounded-lg border border-ca-elements-borderColor bg-ca-elements-background-depth-2 px-3 text-base text-ca-elements-textPrimary focus:outline-none focus:ring-1 focus:ring-ca-elements-borderColorActive"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-lg bg-transparent px-4 text-sm text-ca-elements-textSecondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="min-h-11 rounded-lg bg-accent-700 px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </form>
      </Dialog>
    </RadixDialog.Root>
  );
}
