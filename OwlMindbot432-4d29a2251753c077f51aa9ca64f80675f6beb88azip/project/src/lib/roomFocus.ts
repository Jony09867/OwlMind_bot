import type { SessionType } from '../types';
import { getTelegramUserId } from '../telegram';
import { isSupabaseConfigured, supabase } from './supabase';

export type RoomFocusStatus = 'idle' | 'focusing' | 'paused';

function safeElapsed(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

async function updateMembership(roomId: string | null, patch: Record<string, unknown>) {
  if (!isSupabaseConfigured || !roomId) return;
  const userId = getTelegramUserId() ?? 'local-user';
  const { error } = await supabase
    .from('room_participants')
    .update(patch)
    .eq('room_id', roomId)
    .eq('user_id', userId);
  if (error) console.error('Failed to sync room focus state', error.message);
}

export async function setRoomFocusRunning(
  roomId: string | null,
  subject: string,
  type: SessionType,
  elapsedSec: number,
) {
  await updateMembership(roomId, {
    subject: subject.trim() || 'Study',
    focus_status: 'focusing',
    focus_type: type,
    focus_started_at: new Date().toISOString(),
    focus_elapsed_sec: safeElapsed(elapsedSec),
    is_online: true,
  });
}

export async function setRoomFocusPaused(
  roomId: string | null,
  subject: string,
  type: SessionType,
  elapsedSec: number,
) {
  await updateMembership(roomId, {
    subject: subject.trim() || 'Study',
    focus_status: 'paused',
    focus_type: type,
    focus_started_at: null,
    focus_elapsed_sec: safeElapsed(elapsedSec),
    is_online: true,
  });
}

export async function clearRoomFocus(roomId: string | null, subject?: string) {
  await updateMembership(roomId, {
    ...(subject !== undefined ? { subject: subject.trim() || 'Study' } : {}),
    focus_status: 'idle',
    focus_type: null,
    focus_started_at: null,
    focus_elapsed_sec: 0,
  });
}
