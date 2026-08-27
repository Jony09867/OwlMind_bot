import { createClient } from '@supabase/supabase-js';
import type { FocusSession, UserProfile } from '../types';

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
  xp: number;
  coins: number;
  total_tasks_done: number;
  current_streak: number;
  longest_streak: number;
  last_study_date: string | null;
  streak_freezes: number;
  last_daily_goal_reward_date: string | null;
  last_streak_reward_date: string | null;
  gamification_updated_at: string;
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
    const { error } = await supabase.rpc('sync_user_study_stats_max', {
      p_user_id: user.id,
      p_study_time: Math.max(0, Math.floor(studyTime)),
      p_total_sessions: Math.max(0, Math.floor(totalSessions)),
      p_level: Math.max(1, Math.floor(level)),
    });
    return { error: error ? new Error(error.message) : null };
  } catch (cause) {
    return { error: cause instanceof Error ? cause : new Error('Network error') };
  }
}

export async function syncUserGamificationState(
  userId: string,
  profile: UserProfile,
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.rpc('sync_user_gamification_state', {
      p_user_id: userId,
      p_xp: Math.max(0, Math.floor(profile.xp)),
      p_coins: Math.max(0, Math.floor(profile.coins)),
      p_total_tasks_done: Math.max(0, Math.floor(profile.totalTasksDone)),
      p_current_streak: Math.max(0, Math.floor(profile.currentStreak)),
      p_longest_streak: Math.max(0, Math.floor(profile.longestStreak)),
      p_last_study_date: profile.lastStudyDate,
      p_streak_freezes: Math.max(0, Math.floor(profile.streakFreezes)),
      p_last_daily_goal_reward_date: profile.lastDailyGoalRewardDate,
      p_last_streak_reward_date: profile.lastStreakRewardDate,
      p_level: Math.max(1, Math.floor(profile.level)),
    });
    return { error: error ? new Error(error.message) : null };
  } catch (cause) {
    return { error: cause instanceof Error ? cause : new Error('Network error') };
  }
}

type FocusSessionRow = {
  session_id: string;
  user_id: string;
  focus_type: FocusSession['type'];
  subject: string;
  category: string;
  duration_sec: number;
  started_at: string;
  ended_at: string;
  pomodoro_count: number;
  xp_earned: number;
  room_id: string | null;
  schedule_block_id: string | null;
  schedule_block_title: string | null;
};

function rowToFocusSession(row: FocusSessionRow): FocusSession {
  return {
    id: row.session_id,
    type: row.focus_type,
    subject: row.subject,
    category: row.category,
    durationSec: Number(row.duration_sec) || 0,
    startedAt: new Date(row.started_at).getTime(),
    endedAt: new Date(row.ended_at).getTime(),
    pomodoroCount: Number(row.pomodoro_count) || 0,
    xpEarned: Number(row.xp_earned) || 0,
    roomId: row.room_id,
    scheduleBlockId: row.schedule_block_id,
    scheduleBlockTitle: row.schedule_block_title,
    ledgerVersion: 1,
  };
}

export async function recordFocusSession(
  userId: string,
  session: FocusSession,
  countTowardTotals = true,
  level = 1,
): Promise<{ inserted: boolean; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('record_focus_session', {
      p_session_id: session.id,
      p_user_id: userId,
      p_focus_type: session.type,
      p_subject: session.subject,
      p_category: session.category,
      p_duration_sec: Math.max(1, Math.floor(session.durationSec)),
      p_started_at: new Date(session.startedAt).toISOString(),
      p_ended_at: new Date(session.endedAt).toISOString(),
      p_pomodoro_count: Math.max(0, Math.floor(session.pomodoroCount)),
      p_xp_earned: Math.max(0, Math.floor(session.xpEarned)),
      p_room_id: session.roomId,
      p_schedule_block_id: session.scheduleBlockId ?? null,
      p_schedule_block_title: session.scheduleBlockTitle ?? null,
      p_count_toward_totals: countTowardTotals,
      p_level: Math.max(1, Math.floor(level)),
    });
    return {
      inserted: Boolean(data),
      error: error ? new Error(error.message) : null,
    };
  } catch (cause) {
    return {
      inserted: false,
      error: cause instanceof Error ? cause : new Error('Network error'),
    };
  }
}

export async function syncLocalFocusSessions(
  userId: string,
  sessions: FocusSession[],
): Promise<{ error: Error | null }> {
  const chunkSize = 20;
  for (let i = 0; i < sessions.length; i += chunkSize) {
    const chunk = sessions.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map((session) => recordFocusSession(userId, session, session.ledgerVersion === 1)),
    );
    const failure = results.find((result) => result.error);
    if (failure?.error) return { error: failure.error };
  }
  return { error: null };
}

export async function loadUserStudyData(userId: string): Promise<{
  stats: UserRow | null;
  sessions: FocusSession[];
  error: Error | null;
}> {
  try {
    const [userResult, sessionsResult] = await Promise.all([
      supabase.from('users').select('*').eq('id', userId).maybeSingle(),
      supabase.rpc('get_user_focus_sessions', { p_user_id: userId }),
    ]);

    if (userResult.error) {
      return { stats: null, sessions: [], error: new Error(userResult.error.message) };
    }
    if (sessionsResult.error) {
      return { stats: userResult.data as UserRow | null, sessions: [], error: new Error(sessionsResult.error.message) };
    }

    return {
      stats: userResult.data as UserRow | null,
      sessions: ((sessionsResult.data ?? []) as FocusSessionRow[]).map(rowToFocusSession),
      error: null,
    };
  } catch (cause) {
    return {
      stats: null,
      sessions: [],
      error: cause instanceof Error ? cause : new Error('Network error'),
    };
  }
}