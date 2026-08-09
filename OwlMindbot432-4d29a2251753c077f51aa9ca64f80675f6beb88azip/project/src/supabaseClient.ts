import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Supabase is optional for the local/offline parts of the mini app. Do not let
// a missing Vercel environment variable prevent React from mounting.
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
  auth: { persistSession: false, autoRefreshToken: false },
  },
);

export type RoomRow = {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  is_private: boolean;
  subject: string;
  total_study_sec: number;
  total_sessions: number;
  created_at: string;
};

export type RoomMemberRow = {
  id: string;
  room_id: string;
  user_id: string;
  user_name: string;
  user_avatar: string;
  subject: string;
  elapsed_sec: number;
  is_online: boolean;
  joined_at: string;
};

export type RoomMessageRow = {
  id: string;
  room_id: string;
  user_id: string;
  user_name: string;
  user_avatar: string;
  body: string;
  created_at: string;
};

export type RoomFileRow = {
  id: string;
  room_id: string;
  user_id: string;
  user_name: string;
  user_avatar: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  created_at: string;
};
