import type { SupabaseClient } from '@supabase/supabase-js';
import type { UIMessage } from 'ai';
import { MAX_ONLINE_PROJECTS } from './limits';
import type { OnlineProject } from './merge';
import type { PackedProject } from './pack';
import type { FileMap } from '~/lib/stores/files';

/**
 * The online copy of projects: table public.projects (0005_projects.sql).
 * Only the publishable key is used; Row Level Security limits every call to
 * the logged-in user's own rows.
 */

export interface OnlineProjectData extends OnlineProject {
  messages: UIMessage[];
  files: FileMap;
}

export type SaveResult = 'saved' | 'skipped' | 'too-big' | 'too-many';

export interface ProjectsApi {
  list(): Promise<OnlineProject[]>;
  get(id: string): Promise<OnlineProjectData | null>;
  save(userId: string, id: string, project: PackedProject, updatedAt: string): Promise<SaveResult>;
  rename(id: string, title: string): Promise<void>;
  remove(id: string): Promise<void>;
}

function fail(error: { message?: string } | null): never {
  // no request bodies or keys in the error, only Supabase's short message
  throw new Error(error?.message || 'Supabase request failed');
}

export function supabaseProjectsApi(client: SupabaseClient): ProjectsApi {
  const table = () => client.from('projects');

  return {
    async list() {
      const { data, error } = await table()
        .select('id, title, updated_at, size_bytes')
        .order('updated_at', { ascending: false })
        .limit(MAX_ONLINE_PROJECTS * 2);

      if (error) {
        fail(error);
      }

      // only a real list of rows (anything else must never break the project lists)
      return Array.isArray(data)
        ? (data as OnlineProject[]).filter((row) => typeof row?.id === 'string' && typeof row.updated_at === 'string')
        : [];
    },

    async get(id) {
      const { data, error } = await table()
        .select('id, title, updated_at, size_bytes, messages, files')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        fail(error);
      }

      return (data as OnlineProjectData | null) ?? null;
    },

    async save(userId, id, project, updatedAt) {
      const { data, error } = await table()
        .upsert(
          {
            id,
            user_id: userId,
            title: project.title,
            messages: project.messages,
            files: project.files,
            size_bytes: project.size_bytes,
            updated_at: updatedAt,
          },
          { onConflict: 'user_id,id' },
        )
        .select('id');

      if (error) {
        // 23514: the size check (over 2,000,000 bytes); P0001: the 50 projects limit
        if (error.code === '23514') {
          return 'too-big';
        }

        if (error.code === 'P0001' && /limit/i.test(error.message)) {
          return 'too-many';
        }

        fail(error);
      }

      // an empty answer: the saved copy was newer, so the database kept it
      return data && data.length > 0 ? 'saved' : 'skipped';
    },

    async rename(id, title) {
      const { error } = await table().update({ title, updated_at: new Date().toISOString() }).eq('id', id);

      if (error) {
        fail(error);
      }
    },

    async remove(id) {
      const { error } = await table().delete().eq('id', id);

      if (error) {
        fail(error);
      }
    },
  };
}
