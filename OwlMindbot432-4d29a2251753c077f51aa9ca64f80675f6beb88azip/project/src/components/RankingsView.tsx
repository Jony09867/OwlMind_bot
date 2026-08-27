import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Crown,
  Flame,
  Globe,
  RefreshCw,
  Share2,
  Sparkles,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Badge, GlassButton, GlassCard, Modal } from './ui';
import { fmtHM } from '../hooks';
import { useStore } from '../store';
import type { RankingScope } from '../types';
import {
  createFriendRace,
  joinFriendRace,
  loadCompetitiveRankings,
  loadFriendRaceState,
  type CompetitionScope,
  type CompetitiveRankingEntry,
  type CompetitiveRankingPayload,
  type FriendRaceEntry,
  type FriendRaceState,
  type PreviousWinner,
} from '../lib/rankings';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  getTelegramStartParam,
  getTelegramUserId,
  getTelegramUserName,
  openTelegramLink,
} from '../telegram';

const FINAL_SPRINT_SEC = 3 * 3600;

const SCOPE_OPTIONS: { value: RankingScope; label: string; icon: LucideIcon }[] = [
  { value: 'daily', label: 'Daily', icon: Calendar },
  { value: 'weekly', label: 'Weekly', icon: Flame },
  { value: 'monthly', label: 'Monthly', icon: Calendar },
  { value: 'seasonal', label: 'Season', icon: Trophy },
  { value: 'friends', label: 'Friends', icon: Users },
  { value: 'global', label: 'Global', icon: Globe },
];

function getInitialRaceCode(): string | null {
  const queryCode = new URLSearchParams(window.location.search).get('race')?.trim();
  if (queryCode) return queryCode.toUpperCase();

  const startParam = getTelegramStartParam();
  if (startParam?.startsWith('race_')) {
    const code = startParam.slice('race_'.length).trim();
    return code ? code.toUpperCase() : null;
  }
  return null;
}

function scopeToCompetition(scope: RankingScope): CompetitionScope | null {
  if (scope === 'friends') return null;
  return scope;
}

function scopePeriodName(scope: RankingScope): string {
  if (scope === 'daily') return 'today';
  if (scope === 'weekly') return 'this week';
  if (scope === 'monthly') return 'this month';
  if (scope === 'seasonal') return 'this season';
  if (scope === 'global') return 'all time';
  return 'this friend race';
}

function previousWinnerLabel(scope: RankingScope): string {
  if (scope === 'daily') return 'Yesterday’s winner';
  if (scope === 'weekly') return 'Last week’s winner';
  if (scope === 'monthly') return 'Last month’s winner';
  if (scope === 'seasonal') return 'Last season’s winner';
  return 'Last friend race winner';
}

function formatRemaining(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function buildRaceInviteLink(raceCode: string): string {
  const configuredBase = (import.meta.env.VITE_TELEGRAM_APP_URL as string | undefined)?.trim();
  if (configuredBase) {
    const separator = configuredBase.includes('?') ? '&' : '?';
    return `${configuredBase}${separator}startapp=race_${encodeURIComponent(raceCode)}`;
  }

  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('race', raceCode);
  return url.toString();
}

export function RankingsView() {
  const profile = useStore((s) => s.profile);
  const initialRaceCode = useMemo(() => getInitialRaceCode(), []);
  const [scope, setScope] = useState<RankingScope>(initialRaceCode ? 'friends' : 'weekly');
  const [ranking, setRanking] = useState<CompetitiveRankingPayload | null>(null);
  const [friendState, setFriendState] = useState<FriendRaceState | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());
  const processedRaceInvite = useRef<string | null>(null);

  const userId = getTelegramUserId() ?? 'local-user';
  const userName = profile.name && profile.name !== 'You'
    ? profile.name
    : (getTelegramUserName() ?? 'Learner');
  const userAvatar = profile.avatar || '🦉';

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadCurrent = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setError('Rankings need the online OwlMind service.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (scope === 'friends') {
        const data = await loadFriendRaceState(userId);
        setFriendState(data);
      } else {
        const competitionScope = scopeToCompetition(scope);
        if (!competitionScope) return;
        const data = await loadCompetitiveRankings(competitionScope, userId);
        setRanking(data);
      }
    } catch (cause) {
      console.error('Failed to load ranking', cause);
      setError('Ranking data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [scope, userId]);

  useEffect(() => {
    void loadCurrent();
    const refresh = window.setInterval(() => void loadCurrent(), 60000);
    return () => window.clearInterval(refresh);
  }, [loadCurrent]);

  useEffect(() => {
    if (!initialRaceCode || processedRaceInvite.current === initialRaceCode || !isSupabaseConfigured) return;

    processedRaceInvite.current = initialRaceCode;
    setScope('friends');
    setLoading(true);
    setError('');

    void joinFriendRace(initialRaceCode, userId, userName, userAvatar)
      .then((state) => {
        setFriendState(state);
        const url = new URL(window.location.href);
        if (url.searchParams.has('race')) {
          url.searchParams.delete('race');
          window.history.replaceState({}, '', url.toString());
        }
      })
      .catch((cause) => {
        console.error('Failed to join friend race', cause);
        const message = cause instanceof Error ? cause.message : '';
        setError(
          message.toLowerCase().includes('another friend race')
            ? 'You’re already in another friend race this week.'
            : 'This friend race invite could not be joined.',
        );
      })
      .finally(() => setLoading(false));
  }, [initialRaceCode, userAvatar, userId, userName]);

  const handleCreateFriendRace = async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    setError('');
    try {
      const state = await createFriendRace(userId, userName, userAvatar);
      setFriendState(state);
      if (state.race) setInviteOpen(true);
    } catch (cause) {
      console.error('Failed to create friend race', cause);
      setError('Friend race could not be created.');
    } finally {
      setLoading(false);
    }
  };

  const shareFriendRace = () => {
    const race = friendState?.race;
    if (!race) return;
    const link = buildRaceInviteLink(race.race_code);
    const text = 'Race me on OwlMind this week 🏁';
    openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
  };

  const copyFriendRace = async () => {
    const race = friendState?.race;
    if (!race) return;
    try {
      await navigator.clipboard.writeText(buildRaceInviteLink(race.race_code));
      setInviteFeedback('Invite link copied!');
    } catch {
      setInviteFeedback('Could not copy the invite link.');
    }
  };

  const currentEnd = scope === 'friends'
    ? friendState?.race?.period_end ?? null
    : ranking?.period_end ?? null;
  const remainingSec = currentEnd
    ? Math.max(0, (new Date(currentEnd).getTime() - nowMs) / 1000)
    : null;
  const finalSprint = remainingSec !== null && remainingSec > 0 && remainingSec <= FINAL_SPRINT_SEC;

  return (
    <div className="space-y-5 animate-fade-in pb-4">
      <header className="px-1">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Rankings</h1>
        <p className="text-neutralt-500 dark:text-neutralt-400 text-sm mt-1">
          Compete by real Focus time.
        </p>
      </header>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        {SCOPE_OPTIONS.map((item) => {
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

      {error && (
        <GlassCard subtle className="p-3 flex items-center justify-between gap-3">
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={() => void loadCurrent()} className="text-accent shrink-0" aria-label="Retry ranking">
            <RefreshCw size={16} />
          </button>
        </GlassCard>
      )}

      {loading && (
        <p className="text-sm text-neutralt-500 dark:text-neutralt-400 text-center py-3">
          Updating rankings…
        </p>
      )}

      {!loading && scope === 'friends' && (
        <FriendRaceSection
          state={friendState}
          userId={userId}
          remainingSec={remainingSec}
          finalSprint={finalSprint}
          onCreate={() => void handleCreateFriendRace()}
          onInvite={() => {
            setInviteFeedback('');
            setInviteOpen(true);
          }}
        />
      )}

      {!loading && scope !== 'friends' && ranking && (
        <CompetitionSection
          scope={scope}
          ranking={ranking}
          userId={userId}
          remainingSec={remainingSec}
          finalSprint={finalSprint}
        />
      )}

      <Modal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteFeedback('');
        }}
        title="Add friends to race"
      >
        {friendState?.race && (
          <div className="space-y-4">
            <GlassCard subtle className="p-4 text-center">
              <p className="text-xs text-neutralt-500 dark:text-neutralt-400">Race code</p>
              <p className="font-display text-2xl font-extrabold tracking-widest mt-1">{friendState.race.race_code}</p>
              <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-2">
                One private weekly race · up to 30 racers
              </p>
            </GlassCard>
            <GlassButton icon={Share2} className="w-full" onClick={shareFriendRace}>
              Share to Telegram
            </GlassButton>
            <GlassButton variant="neutral" className="w-full" onClick={() => void copyFriendRace()}>
              Copy invite link
            </GlassButton>
            {inviteFeedback && (
              <p className="text-sm text-center text-neutralt-500 dark:text-neutralt-400">{inviteFeedback}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function CompetitionSection({
  scope,
  ranking,
  userId,
  remainingSec,
  finalSprint,
}: {
  scope: Exclude<RankingScope, 'friends'>;
  ranking: CompetitiveRankingPayload;
  userId: string;
  remainingSec: number | null;
  finalSprint: boolean;
}) {
  const ranked = ranking.user_rank !== null;
  const top3 = ranking.entries.slice(0, 3);
  const podiumIds = new Set(top3.map((entry) => entry.user_id));
  const rest = ranking.entries.filter((entry) => !podiumIds.has(entry.user_id));

  return (
    <>
      {ranking.previous_winner && (
        <WinnerRecap
          title={previousWinnerLabel(scope)}
          winner={ranking.previous_winner}
          isYou={ranking.previous_winner.user_id === userId}
        />
      )}

      <GlassCard strong className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutralt-500 dark:text-neutralt-400">
              {scopePeriodName(scope)}
            </p>
            {ranked ? (
              <>
                <p className="font-display text-3xl font-extrabold mt-1">#{ranking.user_rank}</p>
                <p className="text-sm text-neutralt-500 dark:text-neutralt-400">
                  of {ranking.participant_count} ranked learners · {fmtHM(ranking.user_study_sec)}
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-2xl font-extrabold mt-1">Unranked</p>
                <p className="text-sm text-neutralt-500 dark:text-neutralt-400 mt-1">
                  Complete a 5m Focus session to enter {scopePeriodName(scope)}.
                </p>
              </>
            )}
          </div>
          {scope === 'global' ? (
            <Badge color="purple">Prestige</Badge>
          ) : finalSprint ? (
            <Badge color="amber"><Flame size={12} /> Final Sprint</Badge>
          ) : remainingSec !== null ? (
            <Badge color="neutral">{formatRemaining(remainingSec)} left</Badge>
          ) : null}
        </div>

        {ranked && (
          <div className="mt-4 pt-4 border-t border-neutralt-400/20">
            {ranking.user_rank === 1 ? (
              <p className="text-sm font-semibold text-accent">You’re leading. Protect the top spot.</p>
            ) : ranking.gap_to_next_sec > 0 ? (
              <p className="text-sm font-semibold">
                {fmtHM(ranking.gap_to_next_sec)} to reach the next place
              </p>
            ) : (
              <p className="text-sm font-semibold">You’re tied with the next position.</p>
            )}
            <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1">
              Only completed Focus sessions of 5 minutes or more count.
            </p>
          </div>
        )}
      </GlassCard>

      {ranking.participant_count === 0 ? (
        <GlassCard subtle className="p-6 text-center">
          <Sparkles size={24} className="mx-auto text-accent mb-2" />
          <p className="font-semibold">Be the first ranked learner</p>
          <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1">
            A completed 5-minute Focus session is enough to enter.
          </p>
        </GlassCard>
      ) : (
        <>
          {top3.length >= 3 && (
            <GlassCard strong className="p-5">
              <div className="flex items-end justify-center gap-3">
                <PodiumCard entry={top3[1]} place={2} height="h-20" />
                <PodiumCard entry={top3[0]} place={1} height="h-28" />
                <PodiumCard entry={top3[2]} place={3} height="h-16" />
              </div>
            </GlassCard>
          )}

          <RankingList entries={top3.length < 3 ? ranking.entries : rest} />
        </>
      )}
    </>
  );
}

function FriendRaceSection({
  state,
  userId,
  remainingSec,
  finalSprint,
  onCreate,
  onInvite,
}: {
  state: FriendRaceState | null;
  userId: string;
  remainingSec: number | null;
  finalSprint: boolean;
  onCreate: () => void;
  onInvite: () => void;
}) {
  const race = state?.race ?? null;

  return (
    <>
      {state?.previous_winner && (
        <WinnerRecap
          title="Last friend race winner"
          winner={state.previous_winner}
          isYou={state.previous_winner.user_id === userId}
        />
      )}

      {!race ? (
        <GlassCard strong className="p-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-accent/15 text-accent flex items-center justify-center mb-4">
            <Users size={28} />
          </div>
          <h2 className="font-display text-xl font-bold">Race with Friends</h2>
          <p className="text-sm text-neutralt-500 dark:text-neutralt-400 mt-2 max-w-sm mx-auto">
            Start a private weekly race, invite your friends, and see who focuses the most before Sunday ends.
          </p>
          <GlassButton className="mt-5" icon={Trophy} onClick={onCreate}>
            Start a friend race
          </GlassButton>
        </GlassCard>
      ) : (
        <>
          <GlassCard strong className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutralt-500 dark:text-neutralt-400">
                  Friends · Weekly Race
                </p>
                {race.user_rank ? (
                  <>
                    <p className="font-display text-3xl font-extrabold mt-1">#{race.user_rank}</p>
                    <p className="text-sm text-neutralt-500 dark:text-neutralt-400">
                      of {race.member_count} racers · {fmtHM(race.user_study_sec)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-display text-2xl font-extrabold mt-1">Unranked</p>
                    <p className="text-sm text-neutralt-500 dark:text-neutralt-400 mt-1">
                      Complete a 5m Focus session to enter your race.
                    </p>
                  </>
                )}
              </div>
              {finalSprint ? (
                <Badge color="amber"><Flame size={12} /> Final Sprint</Badge>
              ) : remainingSec !== null ? (
                <Badge color="neutral">{formatRemaining(remainingSec)} left</Badge>
              ) : null}
            </div>

            {race.user_rank && (
              <div className="mt-4 pt-4 border-t border-neutralt-400/20">
                {race.user_rank === 1 ? (
                  <p className="text-sm font-semibold text-accent">You’re leading your friends.</p>
                ) : race.gap_to_next_sec > 0 ? (
                  <p className="text-sm font-semibold">{fmtHM(race.gap_to_next_sec)} to the next place</p>
                ) : (
                  <p className="text-sm font-semibold">You’re tied with the next place.</p>
                )}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-neutralt-500 dark:text-neutralt-400">
                Race code <span className="font-bold tracking-widest">{race.race_code}</span>
              </p>
              <GlassButton size="sm" variant="neutral" icon={Share2} onClick={onInvite}>
                Add friends
              </GlassButton>
            </div>
          </GlassCard>

          {race.entries.length === 1 && (
            <GlassCard subtle className="p-4 text-center">
              <p className="font-semibold text-sm">You’re the first racer here.</p>
              <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1">
                Invite friends directly to this private race.
              </p>
            </GlassCard>
          )}

          <FriendRankingList entries={race.entries} />
        </>
      )}
    </>
  );
}

function WinnerRecap({
  title,
  winner,
  isYou,
}: {
  title: string;
  winner: PreviousWinner;
  isYou: boolean;
}) {
  return (
    <GlassCard subtle className="p-4 flex items-center gap-3">
      <div className="w-11 h-11 rounded-2xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
        <Crown size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-neutralt-500 dark:text-neutralt-400">{title}</p>
        <p className="font-semibold text-sm truncate">
          {isYou ? 'You won — excellent work!' : `${winner.user_name} took the win`}
        </p>
        <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-0.5">
          {fmtHM(winner.study_sec)} · {winner.sessions} qualifying sessions
        </p>
      </div>
      <Badge color={isYou ? 'green' : 'amber'}>{isYou ? 'Champion' : 'Winner'}</Badge>
    </GlassCard>
  );
}

function RankingList({ entries }: { entries: CompetitiveRankingEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      {entries.map((entry, index) => {
        const previous = entries[index - 1];
        const showGap = previous && entry.rank - previous.rank > 1;
        return (
          <div key={entry.user_id}>
            {showGap && (
              <div className="text-center text-xs text-neutralt-400 py-1">•••</div>
            )}
            <RankingRow entry={entry} />
          </div>
        );
      })}
    </div>
  );
}

function RankingRow({ entry }: { entry: CompetitiveRankingEntry }) {
  return (
    <GlassCard className={`p-3.5 flex items-center gap-3 ${entry.is_you ? 'ring-2 ring-accent/40' : ''}`}>
      <span className="w-8 text-center font-bold text-neutralt-500 dark:text-neutralt-400">#{entry.rank}</span>
      <Avatar photoUrl={entry.photo_url} fallback="🦉" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm flex items-center gap-1.5 min-w-0">
          <span className="truncate">{entry.user_name}</span>
          {entry.is_you && <Badge color="accent">You</Badge>}
        </p>
        <p className="text-xs text-neutralt-500 dark:text-neutralt-400">
          Level {entry.level} · {entry.sessions} sessions
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="font-bold text-sm tabular-nums">{fmtHM(entry.study_sec)}</p>
        <p className="text-[10px] text-neutralt-500 dark:text-neutralt-400">Focus</p>
      </div>
    </GlassCard>
  );
}

function FriendRankingList({ entries }: { entries: FriendRaceEntry[] }) {
  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <GlassCard key={entry.user_id} className={`p-3.5 flex items-center gap-3 ${entry.is_you ? 'ring-2 ring-accent/40' : ''}`}>
          <span className="w-8 text-center font-bold text-neutralt-500 dark:text-neutralt-400">
            {entry.rank ? `#${entry.rank}` : '—'}
          </span>
          <Avatar fallback={entry.user_avatar || '🦉'} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm flex items-center gap-1.5 min-w-0">
              <span className="truncate">{entry.user_name}</span>
              {entry.is_you && <Badge color="accent">You</Badge>}
            </p>
            <p className="text-xs text-neutralt-500 dark:text-neutralt-400">
              {entry.sessions} qualifying sessions
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="font-bold text-sm tabular-nums">{fmtHM(entry.study_sec)}</p>
            <p className="text-[10px] text-neutralt-500 dark:text-neutralt-400">
              {entry.rank ? 'Focus' : 'Unranked'}
            </p>
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
  entry: CompetitiveRankingEntry;
  place: number;
  height: string;
}) {
  const tones = ['text-accent', 'text-neutralt-500 dark:text-neutralt-300', 'text-amber-600 dark:text-amber-400'];

  return (
    <div className="flex flex-col items-center gap-2 flex-1 max-w-[110px]">
      <div className="relative">
        <Avatar photoUrl={entry.photo_url} fallback="🦉" size="lg" />
        {place === 1 && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center">
            <Crown size={14} />
          </div>
        )}
      </div>
      <p className="font-semibold text-xs truncate max-w-full">{entry.user_name}</p>
      <p className={`text-xs font-bold tabular-nums ${tones[place - 1]}`}>{fmtHM(entry.study_sec)}</p>
      <div className={`w-full ${height} rounded-t-2xl bg-accent/10 flex items-start justify-center pt-2`}>
        <span className={`font-display font-extrabold text-xl ${tones[place - 1]}`}>{place}</span>
      </div>
    </div>
  );
}

function Avatar({
  photoUrl,
  fallback,
  size = 'md',
}: {
  photoUrl?: string | null;
  fallback: string;
  size?: 'md' | 'lg';
}) {
  const className = size === 'lg'
    ? 'w-14 h-14 rounded-2xl'
    : 'w-10 h-10 rounded-2xl';

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className={`${className} object-cover glass-subtle shrink-0`}
      />
    );
  }

  return (
    <div className={`${className} glass-subtle flex items-center justify-center text-lg shrink-0`}>
      {fallback}
    </div>
  );
}
