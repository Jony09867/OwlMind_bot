import { useCallback, useEffect, useState } from 'react';
import { Crown, TrendingUp, Users, Globe, Calendar, Flame, RefreshCw, Trophy, type LucideIcon } from 'lucide-react';
import { GlassCard, Badge } from './ui';
import { useStore, getRankings } from '../store';
import { fmtHM } from '../hooks';
import type { RankingScope } from '../types';
import { isSupabaseConfigured, supabase, type RoomRow } from '../supabaseClient';
import type { UserRow } from '../lib/supabase';
import { getTelegramUserId } from '../telegram';

export function RankingsView() {
  const profile = useStore((s) => s.profile);
  const [scope, setScope] = useState<RankingScope>('weekly');
  const [remoteEntries, setRemoteEntries] = useState<ReturnType<typeof getRankings>>([]);
  const [roomRankings, setRoomRankings] = useState<RoomRow[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState('');

  const loadRankings = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const currentUserId = getTelegramUserId() ?? 'local-user';
      const [{ data, error: loadError }, { data: roomData, error: roomError }] = await Promise.all([
        supabase.from('users').select('*').order('study_time', { ascending: false }),
        supabase.from('rooms').select('*').order('total_study_sec', { ascending: false }),
      ]);
      if (loadError) {
        setError('Ranking ma’lumotlarini yuklab bo‘lmadi.');
        setLoading(false);
        return;
      }
      if (!roomError) setRoomRankings((roomData ?? []) as RoomRow[]);
      setRemoteEntries((data as UserRow[] | null ?? []).map((entry) => ({
        id: entry.id,
        name: entry.first_name || entry.username || 'Anonymous learner',
        avatar: '🦉',
        studySec: entry.study_time,
        sessions: entry.total_sessions,
        isYou: entry.id === currentUserId,
        level: entry.level,
      })));
      setLoading(false);
    } catch (cause) {
      console.error('Failed to load rankings', cause);
      setError('Ranking ma’lumotlarini yuklab bo‘lmadi.');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRankings();
    if (!isSupabaseConfigured) return;
    const channel = supabase
      .channel('users_and_rooms_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, loadRankings)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, loadRankings)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadRankings]);

  const rankings = getRankings(scope, profile, remoteEntries);

  const scopes: { value: RankingScope; label: string; icon: LucideIcon }[] = [
    { value: 'daily', label: 'Daily', icon: Calendar },
    { value: 'weekly', label: 'Weekly', icon: TrendingUp },
    { value: 'monthly', label: 'Monthly', icon: Calendar },
    { value: 'seasonal', label: 'Season', icon: Flame },
    { value: 'friends', label: 'Friends', icon: Users },
    { value: 'global', label: 'Global', icon: Globe },
  ];

  const joinedRoomId = useStore((s) => s.joinedRoomId);
  const yourRank = rankings.findIndex((r) => r.isYou) + 1;
  const yourRoomRank = joinedRoomId ? roomRankings.findIndex((room) => room.id === joinedRoomId) + 1 : 0;
  const top3 = rankings.slice(0, 3);
  const rest = rankings.slice(3);

  return (
    <div className="space-y-5 animate-fade-in pb-4">
      <header className="px-1">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Rankings</h1>
        <p className="text-neutralt-500 dark:text-neutralt-400 text-sm mt-1">
          {scope === 'room'
            ? (yourRoomRank ? `Your team is #${yourRoomRank} · ${roomRankings.length} rooms` : 'Join a room to see your team rank')
            : `You’re #${yourRank} · ${scope === 'global' ? 'all-time' : scope === 'seasonal' ? 'season' : scope}`}
        </p>
      </header>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        {scopes.map((s) => {
          const active = s.value === scope;
          return (
            <button
              key={s.value}
              onClick={() => setScope(s.value)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-sm font-semibold glass-press transition-all ${active ? 'bg-accent text-white shadow-glow' : 'glass-subtle'}`}
            >
              <s.icon size={15} />
              {s.label}
            </button>
          );
        })}
      </div>

      {scope === 'seasonal' && (
        <GlassCard subtle className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-accent/15 flex items-center justify-center">
            <Flame size={20} className="text-accent" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Season ends in 18 days</p>
            <p className="text-xs text-neutralt-500 dark:text-neutralt-400">Rankings reset each season. Lifetime stats never reset.</p>
          </div>
        </GlassCard>
      )}

      {scope === 'room' ? (
        <RoomsRankingSection rooms={roomRankings} joinedRoomId={joinedRoomId} loading={loading} />
      ) : (
      <>
      {loading && <p className="text-sm text-neutralt-500 text-center py-3">Updating rankings…</p>}
      {error && (
        <GlassCard subtle className="p-3 flex items-center justify-between gap-3">
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={loadRankings} className="text-accent shrink-0" aria-label="Retry rankings"><RefreshCw size={16} /></button>
        </GlassCard>
      )}
      {!loading && !error && rankings.length === 1 && (
        <GlassCard subtle className="p-5 text-center">
          <Trophy size={22} className="mx-auto text-accent mb-2" />
          <p className="font-semibold text-sm">You’re the first learner here</p>
          <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1">Join a study room to see other learners in the live ranking.</p>
        </GlassCard>
      )}

      {/* Podium */}
      {top3.length >= 3 && (
        <GlassCard strong className="p-5">
          <div className="flex items-end justify-center gap-3">
            <PodiumCard entry={top3[1]} place={2} height="h-20" />
            <PodiumCard entry={top3[0]} place={1} height="h-28" />
            <PodiumCard entry={top3[2]} place={3} height="h-16" />
          </div>
        </GlassCard>
      )}

      {/* Rest of rankings */}
      <div className="space-y-2">
        {rest.map((r, i) => (
          <GlassCard key={r.id} className={`p-3.5 flex items-center gap-3 ${r.isYou ? 'ring-2 ring-accent/40' : ''}`}>
            <span className="w-6 text-center font-bold text-neutralt-500 dark:text-neutralt-400">{i + 4}</span>
            <div className="w-10 h-10 rounded-2xl glass-subtle flex items-center justify-center text-lg">{r.avatar}</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm flex items-center gap-1.5">
                {r.name}
                {r.isYou && <Badge color="accent">You</Badge>}
              </p>
              <p className="text-xs text-neutralt-500 dark:text-neutralt-400">Level {r.level} · {r.sessions} sessions</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-sm tabular-nums">{fmtHM(r.studySec)}</p>
              <p className="text-[10px] text-neutralt-500 dark:text-neutralt-400">study time</p>
            </div>
          </GlassCard>
        ))}
      </div>
      </>
      )}
    </div>
  );
}

function RoomsRankingSection({ rooms, joinedRoomId, loading }: { rooms: RoomRow[]; joinedRoomId: string | null; loading: boolean }) {
  if (loading) return <p className="text-sm text-neutralt-500 text-center py-8">Updating rooms ranking…</p>;
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
        <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1">Teams compete by their combined study time.</p>
      </GlassCard>
      {rooms.map((room, index) => (
        <GlassCard key={room.id} className={`p-3.5 flex items-center gap-3 ${room.id === joinedRoomId ? 'ring-2 ring-accent/40' : ''}`}>
          <span className="w-7 text-center font-bold text-neutralt-500 dark:text-neutralt-400">{index + 1}</span>
          <div className="w-10 h-10 rounded-2xl bg-accent/15 flex items-center justify-center">
            <Users size={18} className="text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm flex items-center gap-1.5 truncate">
              {room.name}
              {room.id === joinedRoomId && <Badge color="accent">Your team</Badge>}
            </p>
            <p className="text-xs text-neutralt-500 dark:text-neutralt-400 truncate">{room.owner_name} · {room.total_sessions} sessions</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-sm tabular-nums">{fmtHM(room.total_study_sec)}</p>
            <p className="text-[10px] text-neutralt-500 dark:text-neutralt-400">combined time</p>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}

function PodiumCard({ entry, place, height }: { entry: ReturnType<typeof getRankings>[number]; place: number; height: string }) {
  const colors = ['#f54d1c', '#a8a8a8', '#cd7f32'];
  return (
    <div className="flex flex-col items-center gap-2 flex-1 max-w-[110px]">
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl glass-subtle flex items-center justify-center text-2xl">{entry.avatar}</div>
        {place === 1 && <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center"><Crown size={14} /></div>}
      </div>
      <p className="font-semibold text-xs truncate max-w-full">{entry.name}</p>
      <p className="text-xs font-bold tabular-nums" style={{ color: colors[place - 1] }}>{fmtHM(entry.studySec)}</p>
      <div className={`w-full ${height} rounded-t-2xl flex items-start justify-center pt-2`} style={{ background: `linear-gradient(180deg, ${colors[place - 1]}33, ${colors[place - 1]}11)` }}>
        <span className="font-display font-extrabold text-xl" style={{ color: colors[place - 1] }}>{place}</span>
      </div>
    </div>
  );
}
