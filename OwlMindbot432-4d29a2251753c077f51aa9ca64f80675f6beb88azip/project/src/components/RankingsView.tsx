import { useEffect, useState } from 'react';
import { Crown, TrendingUp, Users, Globe, Calendar, Flame, RefreshCw, Trophy, type LucideIcon } from 'lucide-react';
import { GlassCard, Badge } from './ui';
import { useStore, getRankings } from '../store';
import { fmtHM } from '../hooks';
import type { RankingScope } from '../types';
import { isSupabaseConfigured, supabase, type RoomMemberRow } from '../supabaseClient';
import { getTelegramUserId } from '../telegram';

export function RankingsView() {
  const profile = useStore((s) => s.profile);
  const [scope, setScope] = useState<RankingScope>('weekly');
  const [remoteEntries, setRemoteEntries] = useState<ReturnType<typeof getRankings>>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState('');

  const loadRankings = async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: loadError } = await supabase.from('room_members').select('*');
    if (loadError) {
      setError('Ranking ma’lumotlarini yuklab bo‘lmadi.');
      setLoading(false);
      return;
    }
    const grouped = new Map<string, RoomMemberRow>();
    (data ?? []).forEach((member) => {
      const previous = grouped.get(member.user_id);
      if (previous) {
        grouped.set(member.user_id, {
          ...previous,
          elapsed_sec: previous.elapsed_sec + member.elapsed_sec,
        });
      } else {
        grouped.set(member.user_id, member);
      }
    });
    setRemoteEntries([...grouped.values()].map((member) => ({
      id: member.user_id,
      name: member.user_name || 'Anonymous learner',
      avatar: member.user_avatar || '🦉',
      studySec: member.elapsed_sec,
      sessions: 0,
      isYou: member.user_id === (getTelegramUserId() ?? 'local-user'),
      level: 1,
    })));
    setLoading(false);
  };

  useEffect(() => {
    loadRankings();
    if (!isSupabaseConfigured) return;
    const channel = supabase
      .channel('rankings_room_members')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members' }, loadRankings)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const rankings = getRankings(scope, profile, remoteEntries);

  const scopes: { value: RankingScope; label: string; icon: LucideIcon }[] = [
    { value: 'daily', label: 'Daily', icon: Calendar },
    { value: 'weekly', label: 'Weekly', icon: TrendingUp },
    { value: 'monthly', label: 'Monthly', icon: Calendar },
    { value: 'seasonal', label: 'Season', icon: Flame },
    { value: 'friends', label: 'Friends', icon: Users },
    { value: 'global', label: 'Global', icon: Globe },
  ];

  const yourRank = rankings.findIndex((r) => r.isYou) + 1;
  const top3 = rankings.slice(0, 3);
  const rest = rankings.slice(3);

  return (
    <div className="space-y-5 animate-fade-in pb-4">
      <header className="px-1">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Rankings</h1>
        <p className="text-neutralt-500 dark:text-neutralt-400 text-sm mt-1">You’re #{yourRank} · {scope === 'global' ? 'all-time' : scope === 'seasonal' ? 'season' : scope}</p>
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
