import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

export type TelegramUser = {
  id: string;
  first_name: string;
  username: string | null;
  photo_url: string | null;
};

export type UserRow = {
  id: string;
  first_name: string;
  username: string | null;
  photo_url: string | null;
  study_time: number;
  total_sessions: number;
  level: number;
  updated_at: string;
};

export function generateRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function upsertTelegramUser(user: TelegramUser): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.from('users').upsert({
      id: user.id,
      first_name: user.first_name,
      username: user.username,
      photo_url: user.photo_url,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    return { error: error ? new Error(error.message) : null };
  } catch (cause) {
    return { error: cause instanceof Error ? cause : new Error('Network error') };
  }
}

export async function syncUserStudyStats(user: TelegramUser, studyTime: number, totalSessions: number, level: number): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.from('users').upsert({
      id: user.id,
      first_name: user.first_name,
      username: user.username,
      photo_url: user.photo_url,
      study_time: Math.max(0, Math.floor(studyTime)),
      total_sessions: Math.max(0, Math.floor(totalSessions)),
      level,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    return { error: error ? new Error(error.message) : null };
  } catch (cause) {
    return { error: cause instanceof Error ? cause : new Error('Network error') };
  }
}