export { isSupabaseConfigured, supabase } from './lib/supabase';

export type RoomRow = {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  room_code: string;
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

export type GlobalLeaderboardRow = {
  user_id: string;
  user_name: string;
  user_avatar: string;
  total_study_sec: number;
  total_sessions: number;
  level: number;
  updated_at: string;
};

export type { UserRow } from './lib/supabase';
