# Projects saved online

Signed-in users' projects (the chat and its files) are also saved in their
Supabase account, in the table `public.projects`
(`supabase/migrations/0005_projects.sql`). Guests keep projects in the browser
only.

## How it works

- **Saving:** the open project is saved 5 seconds after its last change, and
  right away when the app goes to the background. It never waits for the chat
  or slows it down. A failed save is retried quietly twice, then a small
  "Not saved online" note is shown. The browser copy is always kept.
- **Last write wins:** each save carries the time of the browser copy. The
  database keeps whichever copy is newer, so an older browser never overwrites
  newer work.
- **Loading:** on sign-in (and app start) the list of online projects is loaded
  and merged with the browser list. A project that is only online shows in the
  list and is downloaded into the browser when it is opened. A cloud icon on a
  card means "saved online".
- **Delete, rename, duplicate:** also change the online copy. Delete asks
  "Delete here and online?".
- **Sign out:** browser copies stay. Each browser chat remembers which user it
  belongs to (`localStorage` key `ca_project_links`), and another user who
  signs in on the same browser does not see it. Chats made as a guest stay
  visible to everyone on that browser.

## Limits

All in `app/lib/projects/limits.ts` (the migration uses the same numbers):

- at most 50 projects online per user;
- at most 2 MB (2,000,000 bytes) per project;
- `node_modules`, build output (`dist`, `build`, `.next`, ...) and binary files
  over 200 KB are not saved online.

A project that is too big shows "This project is too big to save online" and
stays in the browser.

## Security

The browser uses only the publishable key. Row Level Security lets a user read,
add, change and delete only rows where `user_id = auth.uid()`. The database
computes `size_bytes` itself and refuses anything over 2,000,000 bytes.

## Code

- `app/lib/projects/limits.ts`: the limits
- `app/lib/projects/pack.ts`: what is saved (skipped files, size)
- `app/lib/projects/merge.ts`: merging the browser and online lists
- `app/lib/projects/links.ts`: which user owns a browser chat
- `app/lib/projects/cloud.ts`: the Supabase calls
- `app/lib/projects/sync.ts`: the debounced saving, retries and sign-out
