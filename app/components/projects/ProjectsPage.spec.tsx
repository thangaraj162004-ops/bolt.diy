import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectsPage, timeAgo, visibleProjects } from './ProjectsPage';

const NOW = Date.parse('2026-11-27T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const PROJECTS = [
  { id: '1', urlId: 'recipe', description: 'Recipe finder', messages: [], timestamp: ago(5 * 60_000) },
  { id: '2', urlId: 'kanban', description: 'Kanban board', messages: [], timestamp: ago(3 * 86_400_000) },
  { id: '3', urlId: 'bakery', description: 'bakery landing page', messages: [], timestamp: ago(20_000) },
] as any[];

afterEach(cleanup);

function renderPage(projects = PROJECTS) {
  const handlers = {
    onClose: vi.fn(),
    onOpen: vi.fn(),
    onRename: vi.fn(),
    onDuplicate: vi.fn(),
    onExport: vi.fn(),
    onDelete: vi.fn(),
  };

  render(<ProjectsPage open projects={projects} now={NOW} {...handlers} />);

  return handlers;
}

const cardTitles = () =>
  screen.getAllByTestId('project-card').map((card) => card.querySelector('.line-clamp-2')!.textContent);

async function openSheetFor(index: number) {
  await act(async () => {
    fireEvent.click(screen.getAllByTestId('project-more')[index]);
  });

  return screen.findByTestId('project-sheet');
}

describe('timeAgo and the project order', () => {
  it('says how long ago', () => {
    expect(timeAgo(ago(20_000), NOW)).toBe('just now');
    expect(timeAgo(ago(5 * 60_000), NOW)).toBe('5 minutes ago');
    expect(timeAgo(ago(3 * 3_600_000), NOW)).toBe('3 hours ago');
    expect(timeAgo(ago(3 * 86_400_000), NOW)).toBe('3 days ago');
    expect(timeAgo(undefined, NOW)).toBe('');
  });

  it('newest first, search by title ignoring case', () => {
    expect(visibleProjects(PROJECTS, '').map((p) => p.id)).toEqual(['3', '1', '2']);
    expect(visibleProjects(PROJECTS, 'KANBAN').map((p) => p.id)).toEqual(['2']);
  });
});

describe('Projects page on a phone', () => {
  it('is a full-screen phone page with a back arrow and the projects newest first', () => {
    const { onClose } = renderPage();

    const page = screen.getByTestId('projects-page');
    expect(page.className).toContain('md:hidden');
    expect(page.className).toContain('fixed inset-0');

    expect(cardTitles()).toEqual(['bakery landing page', 'Recipe finder', 'Kanban board']);

    const [first] = screen.getAllByTestId('project-card');
    expect(within(first).getByTestId('project-preview').textContent).toBe('B');
    expect(first.textContent).toContain('just now');

    const more = screen.getAllByTestId('project-more')[0];
    expect(more.getAttribute('aria-label')).toBe('More actions for bakery landing page');
    expect(more.className).toContain('h-11 w-11');

    const newProject = screen.getByRole('link', { name: 'New project' });
    expect(newProject.getAttribute('href')).toBe('/');
    expect(newProject.className).toContain('h-12');
    expect(newProject.className).toContain('rounded-full');

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the search button filters by title', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Search projects' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search projects' }), { target: { value: 'recipe' } });
    expect(cardTitles()).toEqual(['Recipe finder']);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search projects' }), { target: { value: 'nothing' } });
    expect(screen.queryAllByTestId('project-card')).toHaveLength(0);
    expect(screen.getByTestId('projects-list').textContent).toContain('No projects match');

    fireEvent.click(screen.getByRole('button', { name: 'Close search' }));
    expect(cardTitles()).toHaveLength(3);
  });

  it('tapping a card opens that project', () => {
    const { onOpen } = renderPage();

    fireEvent.click(within(screen.getAllByTestId('project-card')[1]).getByText('Recipe finder'));
    expect(onOpen).toHaveBeenCalledWith(PROJECTS[0]);
  });

  it('"..." opens a sheet with Open, Rename, Duplicate, Export and Delete (52 px rows)', async () => {
    const { onOpen, onDuplicate, onExport } = renderPage();

    let sheet = await openSheetFor(1);

    const rows = within(sheet).getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual(['Open', 'Rename', 'Duplicate', 'Export', 'Delete']);
    rows.forEach((row) => expect(row.className).toContain('min-h-[52px]'));

    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Open' }));
    });
    expect(onOpen).toHaveBeenCalledWith(PROJECTS[0]);
    expect(screen.queryByTestId('project-sheet')).toBeNull();

    sheet = await openSheetFor(2);
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Duplicate' }));
    });
    expect(onDuplicate).toHaveBeenCalledWith(PROJECTS[1]);

    sheet = await openSheetFor(2);
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Export' }));
    });
    expect(onExport).toHaveBeenCalledWith(PROJECTS[1]);
  });

  it('Rename asks for a new name', async () => {
    const { onRename } = renderPage();

    const sheet = await openSheetFor(1);
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Rename' }));
    });

    const input = await screen.findByRole('textbox', { name: 'Project name' });
    expect((input as HTMLInputElement).value).toBe('Recipe finder');
    fireEvent.change(input, { target: { value: '  Recipe app  ' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(onRename).toHaveBeenCalledWith(PROJECTS[0], 'Recipe app');
  });

  it('Delete asks to confirm in a dialog that fits the screen', async () => {
    const { onDelete } = renderPage();

    const sheet = await openSheetFor(2);
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Delete' }));
    });

    const dialog = await screen.findByRole('dialog', { name: 'Delete project?' });
    expect(dialog.textContent).toContain('Kanban board');
    expect(dialog.className).toContain('max-md:max-w-[calc(100vw-32px)]');
    expect(onDelete).not.toHaveBeenCalled();

    // Cancel keeps it
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    });
    expect(onDelete).not.toHaveBeenCalled();

    const again = await openSheetFor(2);
    await act(async () => {
      fireEvent.click(within(again).getByRole('button', { name: 'Delete' }));
    });

    const confirm = await screen.findByRole('dialog', { name: 'Delete project?' });
    const deleteButton = within(confirm).getByRole('button', { name: 'Delete' });
    expect(deleteButton.className).toContain('max-md:min-h-11');

    await act(async () => {
      fireEvent.click(deleteButton);
    });
    expect(onDelete).toHaveBeenCalledWith(PROJECTS[1]);
  });

  it('empty: "No projects yet" and a New project button', () => {
    renderPage([]);

    const empty = screen.getByTestId('projects-empty');
    expect(empty.textContent).toContain('No projects yet');
    expect(within(empty).getByRole('link', { name: 'New project' }).getAttribute('href')).toBe('/');
    expect(screen.queryByRole('button', { name: 'Search projects' })).toBeNull();
  });

  it('renders nothing when closed', () => {
    render(
      <ProjectsPage
        open={false}
        projects={PROJECTS}
        onClose={vi.fn()}
        onOpen={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onExport={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('projects-page')).toBeNull();
  });

  it('a cloud icon means "saved online"; Delete then asks "Delete here and online?"', async () => {
    const { onDelete } = renderPage([
      { ...PROJECTS[0], savedOnline: true, cloudId: 'c1' },
      {
        id: 'cloud:c2',
        description: 'Only online',
        messages: [],
        timestamp: ago(60 * 60_000),
        savedOnline: true,
        onlineOnly: true,
        cloudId: 'c2',
      },
      PROJECTS[1],
    ]);

    const cards = screen.getAllByTestId('project-card');
    expect(within(cards[0]).getByRole('img', { name: 'Saved online' })).toBeTruthy();
    expect(within(cards[1]).getByRole('img', { name: 'Saved online' })).toBeTruthy();
    expect(within(cards[2]).queryByRole('img', { name: 'Saved online' })).toBeNull();

    const sheet = await openSheetFor(0);
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: 'Delete' }));
    });

    const dialog = await screen.findByRole('dialog', { name: 'Delete here and online?' });
    expect(dialog.textContent).toContain('from this browser and online');

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    });
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: '1', savedOnline: true }));
  });

  it('shows one tip when given (guests)', () => {
    render(
      <ProjectsPage
        open
        projects={[]}
        tip="Sign in to keep your projects safe."
        onClose={vi.fn()}
        onOpen={vi.fn()}
        onRename={vi.fn()}
        onDuplicate={vi.fn()}
        onExport={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId('projects-tip')).toHaveLength(1);
    expect(screen.getByTestId('projects-tip').textContent).toBe('Sign in to keep your projects safe.');
  });
});
