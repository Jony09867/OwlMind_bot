import { useCallback, useEffect, useState } from 'react';
import { Crown, TrendingUp, Users, Globe, Calendar, RefreshCw, Trophy, type LucideIcon } from 'lucide-react';
import { GlassCard, Badge } from './ui';
import { useStore } from '../store';
import { fmtHM } from '../hooks';
import type { FocusSession, RankingEntry, RankingScope } from '../types';
import { isSupabaseConfigured, supabase, type RoomRow } from '../supabaseClient';
import type { UserRow } from '../lib/supabase';
import { getTelegramUserId } from '../telegram';

type PeriodRankingRow = {
  user_id: string;
  first_name: string;
  username: string | null;
  photo_url: string | null;
  study_sec: number | string;
  sessions: number;
  level: number;
};

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function getPeriodWindow(scope: RankingScope): { start: Date; end: Date } | null {
  const now = new Date();

  if (scope === 'daily') {
    const start = startOfDay(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  if (scope === 'weekly') {
    const start = startOfDay(now);
    const mondayIndex = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayIndex);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }

  if (scope === 'monthly') {
    const start = startOfDay(now);
    start.setDate(1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    return { start, end };
  }

  return null;
}

function getLocalPeriodTotals(
  sessions: FocusSession[],
  scope: RankingScope,
  profileStudySec: number,
  profileSessions: number,
): { studySec: number; sessions: number } {
  if (scope === 'global') {
    return {
      studySec: profileStudySec,
      sessions: profileSessions,
    };
  }

  const window = getPeriodWindow(scope);
  if (!window) return { studySec: 0, sessions: 0 };

  const start = window.start.getTime();
  const end = window.end.getTime();
  const matching = sessions.filter((session) => session.startedAt >= start && session.startedAt < end);

  return {
    studySec: matching.reduce((total, session) => total + session.durationSec, 0),
    sessions: matching.length,
  };
}

function scopeLabel(scope: RankingScope): string {
  if (scope === 'daily') return 'today';
  if (scope === 'weekly') return 'this week';
  if (scope === 'monthly') return 'this month';
  if (scope === 'global') return 'all-time';
  return 'rooms';
}

export function RankingsView() {
  const profile = useStore((s) => s.profile);
  const localSessions = useStore((s) => s.sessions);
  const joinedRoomId = useStore((s) => s.joinedRoomId);
  const [scope, setScope] = useState<RankingScope>('weekly');
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [roomRankings, setRoomRankings] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState('');

  const loadRankings = useCallback(async () => {
    if (!isSupabaseConfigured) {
      const currentUserId = getTelegramUserId() ?? 'local-user';
      const localTotals = getLocalPeriodTotals(
        localSessions,
        scope,
        profile.totalStudySec,
        profile.totalSessions,
      );
      setRankings([{
        id: currentUserId,
        name: profile.name,
        avatar: profile.avatar,
        studySec: localTotals.studySec,
        sessions: localTotals.sessions,
        isYou: true,
        level: profile.level,
      }]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (scope === 'room') {
        const { data, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .order('total_study_sec', { ascending: false })
          .order('total_sessions', { ascending: false });

        if (roomError) {
          setError('Room ranking ma’lumotlarini yuklab bo‘lmadi.');
        } else {
          setRoomRankings((data ?? []) as RoomRow[]);
        }
        setLoading(false);
        return;
      }

      const currentUserId = getTelegramUserId() ?? 'local-user';
      let remoteEntries: RankingEntry[] = [];

      if (scope === 'global') {
        const { data, error: loadError } = await supabase
          .from('users')
          .select('*')
          .order('study_time', { ascending: false })
          .order('total_sessions', { ascending: false });

        if (loadError) throw new Error(loadError.message);

        remoteEntries = ((data ?? []) as UserRow[]).map((entry) => ({
          id: entry.id,
          name: entry.first_name || entry.username || 'Anonymous learner',
          avatar: '🦉',
          studySec: Number(entry.study_time) || 0,
          sessions: Number(entry.total_sessions) || 0,
          isYou: entry.id === currentUserId,
          level: Number(entry.level) || 1,
        }));
      } else {
        const window = getPeriodWindow(scope);
        if (!window) throw new Error('Invalid ranking period');

        const { data, error: loadError } = await supabase.rpc('get_period_rankings', {
          p_start: window.start.toISOString(),
          p_end: window.end.toISOString(),
        });

        if (loadError) throw new Error(loadError.message);

        remoteEntries = ((data ?? []) as PeriodRankingRow[]).map((entry) => ({
          id: entry.user_id,
          name: entry.first_name || entry.username || 'Anonymous learner',
          avatar: '🦉',
          studySec: Number(entry.study_sec) || 0,
          sessions: Number(entry.sessions) || 0,
          isYou: entry.user_id === currentUserId,
          level: Number(entry.level) || 1,
        }));
      }

      const localTotals = getLocalPeriodTotals(
        localSessions,
        scope,
        profile.totalStudySec,
        profile.totalSessions,
      );
      const existingCurrent = remoteEntries.find((entry) => entry.id === currentUserId);
      const currentName = profile.name && profile.name !== 'You'
        ? profile.name
        : (existingCurrent?.name ?? profile.name);
      const currentEntry: RankingEntry = {
        id: currentUserId,
        name: currentName,
        avatar: profile.avatar,
        studySec: Math.max(existingCurrent?.studySec ?? 0, localTotals.studySec),
        sessions: Math.max(existingCurrent?.sessions ?? 0, localTotals.sessions),
        isYou: true,
        level: Math.max(existingCurrent?.level ?? 1, profile.level),
      };

      const byId = new Map(remoteEntries.map((entry) => [entry.id, entry]));
      byId.set(currentUserId, currentEntry);

      setRankings(
        [...byId.values()].sort(
          (a, b) =>
            b.studySec - a.studySec ||
            b.sessions - a.sessions ||
            a.name.localeCompare(b.name),
        ),
      );
      setLoading(false);
    } catch (cause) {
      console.error('Failed to load rankings', cause);
      setError('Ranking ma’lumotlarini yuklab bo‘lmadi.');
      setLoading(false);
    }
  }, [
    localSessions,
    profile.avatar,
    profile.level,
    profile.name,
    profile.totalSessions,
    profile.totalStudySec,
    scope,
  ]);

  useEffect(() => {
    loadRankings();
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel(`rankings_changes_${scope}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, loadRankings)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, loadRankings)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadRankings, scope]);

  const scopes: { value: RankingScope; label: string; icon: LucideIcon }[] = [
    { value: 'daily', label: 'Daily', icon: Calendar },
    { value: 'weekly', label: 'Weekly', icon: TrendingUp },
    { value: 'monthly', label: 'Monthly', icon: Calendar },
    { value: 'room', label: 'Rooms', icon: Users },
    { value: 'global', label: 'Global', icon: Globe },
  ];

  const yourRank = rankings.findIndex((entry) => entry.isYou) + 1;
  const yourRoomRank = joinedRoomId
    ? roomRankings.findIndex((room) => room.id === joinedRoomId) + 1
    : 0;
  const hasStudyActivity = rankings.some((entry) => entry.studySec > 0);
  const top3 = rankings.length >= 3 ? rankings.slice(0, 3) : [];
  const listEntries = rankings.length >= 3 ? rankings.slice(3) : rankings;
  const listStartRank = rankings.length >= 3 ? 4 : 1;

  return (
    <div className="space-y-5 animate-fade-in pb-4">
      <header className="px-1">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Rankings</h1>
        <p className="text-neutralt-500 dark:text-neutralt-400 text-sm mt-1">
          {scope === 'room'
            ? (yourRoomRank
              ? `Your team is #${yourRoomRank} · ${roomRankings.length} rooms`
              : 'Join a room to see your team rank')
            : (hasStudyActivity
              ? `You’re #${yourRank} · ${scopeLabel(scope)}`
              : `No ranked study time yet · ${scopeLabel(scope)}`)}
        </p>
      </header>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        {scopes.map((item) => {
          const active = item.value === scope;
          return (
            <button
              key={item.value}
              onClick={() => setScope(item.value)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-sm font-semibold glass-press transition-all ${active ? 'bg-accent text-white shadow-glow' : 'glass-subtle'}`}
            >
              <item.icon size={15} />
              {item.label}
            </button>
          );
        })}
      </div>

      {scope === 'room' ? (
        <>
          {error && (
            <GlassCard subtle className="p-3 flex items-center justify-between gap-3">
              <p className="text-sm text-red-500">{error}</p>
              <button onClick={loadRankings} className="text-accent shrink-0" aria-label="Retry room rankings">
                <RefreshCw size={16} />
              </button>
            </GlassCard>
          )}
          <RoomsRankingSection rooms={roomRankings} joinedRoomId={joinedRoomId} loading={loading} />
        </>
      ) : (
        <>
          {loading && (
            <p className="text-sm text-neutralt-500 dark:text-neutralt-400 text-center py-3">
              Updating rankings…
            </p>
          )}

          {error && (
            <GlassCard subtle className="p-3 flex items-center justify-between gap-3">
              <p className="text-sm text-red-500">{error}</p>
              <button onClick={loadRankings} className="text-accent shrink-0" aria-label="Retry rankings">
                <RefreshCw size={16} />
              </button>
            </GlassCard>
          )}

          {!loading && !error && !hasStudyActivity && (
            <GlassCard subtle className="p-5 text-center">
              <Trophy size={22} className="mx-auto text-accent mb-2" />
              <p className="font-semibold text-sm">No study activity yet</p>
              <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1">
                Complete a focus session and this ranking will update automatically.
              </p>
            </GlassCard>
          )}

          {!loading && !error && hasStudyActivity && (
            <>
              {top3.length === 3 && (
                <GlassCard strong className="p-5">
                  <div className="flex items-end justify-center gap-3">
                    <PodiumCard entry={top3[1]} place={2} height="h-20" />
                    <PodiumCard entry={top3[0]} place={1} height="h-28" />
                    <PodiumCard entry={top3[2]} place={3} height="h-16" />
                  </div>
                </GlassCard>
              )}

              <div className="space-y-2">
                {listEntries.map((entry, index) => (
                  <RankingRow
                    key={entry.id}
                    entry={entry}
                    rank={listStartRank + index}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function RankingRow({ entry, rank }: { entry: RankingEntry; rank: number }) {
  return (
    <GlassCard className={`p-3.5 flex items-center gap-3 ${entry.isYou ? 'ring-2 ring-accent/40' : ''}`}>
      <span className="w-6 text-center font-bold text-neutralt-500 dark:text-neutralt-400">{rank}</span>
      <div className="w-10 h-10 rounded-2xl glass-subtle flex items-center justify-center text-lg">{entry.avatar}</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm flex items-center gap-1.5 truncate">
          <span className="truncate">{entry.name}</span>
          {entry.isYou && <Badge color="accent">You</Badge>}
        </p>
        <p className="text-xs text-neutralt-500 dark:text-neutralt-400">
          Level {entry.level} · {entry.sessions} sessions
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-bold text-sm tabular-nums">{fmtHM(entry.studySec)}</p>
        <p className="text-[10px] text-neutralt-500 dark:text-neutralt-400">study time</p>
      </div>
    </GlassCard>
  );
}

function RoomsRankingSection({
  rooms,
  joinedRoomId,
  loading,
}: {
  rooms: RoomRow[];
  joinedRoomId: string | null;
  loading: boolean;
}) {
  if (loading) {
    return <p className="text-sm text-neutralt-500 dark:text-neutralt-400 text-center py-8">Updating rooms ranking…</p>;
  }

  if (rooms.length === 0) {
    return (
      <GlassCard subtle className="p-5 text-center">
        <Users size={22} className="mx-auto text-accent mb-2" />
        <p className="font-semibold text-sm">No study teams yet</p>
        <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1">Create or join a room to compete as a team.</p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-2">
      <GlassCard subtle className="p-4">
        <p className="font-semibold text-sm">Rooms Rank</p>
        <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1">
          Teams compete by their combined study time.
        </p>
      </GlassCard>
      {rooms.map((room, index) => (
        <GlassCard key={room.id} className={`p-3.5 flex items-center gap-3 ${room.id === joinedRoomId ? 'ring-2 ring-accent/40' : ''}`}>
          <span className="w-7 text-center font-bold text-neutralt-500 dark:text-neutralt-400">{index + 1}</span>
          <div className="w-10 h-10 rounded-2xl bg-accent/15 flex items-center justify-center">
            <Users size={18} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm flex items-center gap-1.5 truncate">
              <span className="truncate">{room.name}</span>
              {room.id === joinedRoomId && <Badge color="accent">Your team</Badge>}
            </p>
            <p className="text-xs text-neutralt-500 dark:text-neutralt-400 truncate">
              {room.owner_name} · {room.total_sessions} sessions
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-sm tabular-nums">{fmtHM(room.total_study_sec)}</p>
            <p className="text-[10px] text-neutralt-500 dark:text-neutralt-400">combined time</p>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

function PodiumCard({
  entry,
  place,
  height,
}: {
  entry: RankingEntry;
  place: number;
  height: string;
}) {
  const colors = ['#f54d1c', '#a8a8a8', '#cd7f32'];

  return (
    <div className="flex flex-col items-center gap-2 flex-1 max-w-[110px]">
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl glass-subtle flex items-center justify-center text-2xl">{entry.avatar}</div>
        {place === 1 && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center">
            <Crown size={14} />
          </div>
        )}
      </div>
      <p className="font-semibold text-xs truncate max-w-full">{entry.name}</p>
      <p className="text-xs font-bold tabular-nums" style={{ color: colors[place - 1] }}>{fmtHM(entry.studySec)}</p>
      <div
        className={`w-full ${height} rounded-t-2xl flex items-start justify-center pt-2`}
        style={{ background: `linear-gradient(180deg, ${colors[place - 1]}33, ${colors[place - 1]}11)` }}
      >
        <span className="font-display font-extrabold text-xl" style={{ color: colors[place - 1] }}>{place}</span>
      </div>
    </div>
  );
}
