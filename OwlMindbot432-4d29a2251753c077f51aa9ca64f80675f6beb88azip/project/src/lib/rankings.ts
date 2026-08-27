import { supabase } from './supabase';

export type CompetitionScope = 'daily' | 'weekly' | 'monthly' | 'seasonal' | 'global';

export type CompetitiveRankingEntry = {
  rank: number;
  user_id: string;
  user_name: string;
  photo_url: string | null;
  study_sec: number;
  sessions: number;
  level: number;
  is_you: boolean;
};

export type PreviousWinner = {
  user_id: string;
  user_name: string;
  photo_url?: string | null;
  user_avatar?: string;
  study_sec: number;
  sessions: number;
  period_start: string;
  period_end: string;
};

export type CompetitiveRankingPayload = {
  scope: CompetitionScope;
  period_start: string | null;
  period_end: string | null;
  participant_count: number;
  user_rank: number | null;
  user_study_sec: number;
  user_sessions: number;
  gap_to_next_sec: number;
  leader_study_sec: number;
  entries: CompetitiveRankingEntry[];
  previous_winner: PreviousWinner | null;
  minimum_session_sec: number;
  ranking_timezone: string;
};

export type FriendRaceEntry = {
  rank: number | null;
  user_id: string;
  user_name: string;
  user_avatar: string;
  study_sec: number;
  sessions: number;
  is_you: boolean;
};

export type FriendRace = {
  id: string;
  race_code: string;
  owner_id: string;
  owner_name: string;
  period_start: string;
  period_end: string;
  is_owner: boolean;
  member_count: number;
  user_rank: number | null;
  user_study_sec: number;
  gap_to_next_sec: number;
  entries: FriendRaceEntry[];
};

export type FriendRaceState = {
  race: FriendRace | null;
  previous_winner: PreviousWinner | null;
  minimum_session_sec: number;
  ranking_timezone: string;
};

function normalizeCompetitionPayload(data: unknown): CompetitiveRankingPayload {
  const raw = (data ?? {}) as Record<string, unknown>;
  return {
    scope: (raw.scope as CompetitionScope) ?? 'weekly',
    period_start: typeof raw.period_start === 'string' ? raw.period_start : null,
    period_end: typeof raw.period_end === 'string' ? raw.period_end : null,
    participant_count: Number(raw.participant_count) || 0,
    user_rank: raw.user_rank === null || raw.user_rank === undefined ? null : Number(raw.user_rank),
    user_study_sec: Number(raw.user_study_sec) || 0,
    user_sessions: Number(raw.user_sessions) || 0,
    gap_to_next_sec: Number(raw.gap_to_next_sec) || 0,
    leader_study_sec: Number(raw.leader_study_sec) || 0,
    entries: Array.isArray(raw.entries)
      ? raw.entries.map((entry) => {
          const row = entry as Record<string, unknown>;
          return {
            rank: Number(row.rank) || 0,
            user_id: String(row.user_id ?? ''),
            user_name: String(row.user_name ?? 'Learner'),
            photo_url: typeof row.photo_url === 'string' ? row.photo_url : null,
            study_sec: Number(row.study_sec) || 0,
            sessions: Number(row.sessions) || 0,
            level: Math.max(1, Number(row.level) || 1),
            is_you: Boolean(row.is_you),
          };
        })
      : [],
    previous_winner:
      raw.previous_winner && typeof raw.previous_winner === 'object'
        ? normalizePreviousWinner(raw.previous_winner as Record<string, unknown>)
        : null,
    minimum_session_sec: Number(raw.minimum_session_sec) || 300,
    ranking_timezone: String(raw.ranking_timezone ?? 'Asia/Tashkent'),
  };
}

function normalizePreviousWinner(raw: Record<string, unknown>): PreviousWinner {
  return {
    user_id: String(raw.user_id ?? ''),
    user_name: String(raw.user_name ?? 'Learner'),
    photo_url: typeof raw.photo_url === 'string' ? raw.photo_url : null,
    user_avatar: typeof raw.user_avatar === 'string' ? raw.user_avatar : undefined,
    study_sec: Number(raw.study_sec) || 0,
    sessions: Number(raw.sessions) || 0,
    period_start: String(raw.period_start ?? ''),
    period_end: String(raw.period_end ?? ''),
  };
}

function normalizeFriendRaceState(data: unknown): FriendRaceState {
  const raw = (data ?? {}) as Record<string, unknown>;
  let race: FriendRace | null = null;

  if (raw.race && typeof raw.race === 'object') {
    const raceRaw = raw.race as Record<string, unknown>;
    race = {
      id: String(raceRaw.id ?? ''),
      race_code: String(raceRaw.race_code ?? ''),
      owner_id: String(raceRaw.owner_id ?? ''),
      owner_name: String(raceRaw.owner_name ?? 'Learner'),
      period_start: String(raceRaw.period_start ?? ''),
      period_end: String(raceRaw.period_end ?? ''),
      is_owner: Boolean(raceRaw.is_owner),
      member_count: Number(raceRaw.member_count) || 0,
      user_rank: raceRaw.user_rank === null || raceRaw.user_rank === undefined ? null : Number(raceRaw.user_rank),
      user_study_sec: Number(raceRaw.user_study_sec) || 0,
      gap_to_next_sec: Number(raceRaw.gap_to_next_sec) || 0,
      entries: Array.isArray(raceRaw.entries)
        ? raceRaw.entries.map((entry) => {
            const row = entry as Record<string, unknown>;
            return {
              rank: row.rank === null || row.rank === undefined ? null : Number(row.rank),
              user_id: String(row.user_id ?? ''),
              user_name: String(row.user_name ?? 'Learner'),
              user_avatar: String(row.user_avatar ?? '🦉'),
              study_sec: Number(row.study_sec) || 0,
              sessions: Number(row.sessions) || 0,
              is_you: Boolean(row.is_you),
            };
          })
        : [],
    };
  }

  return {
    race,
    previous_winner:
      raw.previous_winner && typeof raw.previous_winner === 'object'
        ? normalizePreviousWinner(raw.previous_winner as Record<string, unknown>)
        : null,
    minimum_session_sec: Number(raw.minimum_session_sec) || 300,
    ranking_timezone: String(raw.ranking_timezone ?? 'Asia/Tashkent'),
  };
}

export async function loadCompetitiveRankings(
  scope: CompetitionScope,
  userId: string,
): Promise<CompetitiveRankingPayload> {
  const { data, error } = await supabase.rpc('get_competitive_rankings', {
    p_scope: scope,
    p_user_id: userId,
    p_top_limit: 10,
    p_neighbor_radius: 2,
  });
  if (error) throw new Error(error.message);
  return normalizeCompetitionPayload(data);
}

export async function loadFriendRaceState(userId: string): Promise<FriendRaceState> {
  const { data, error } = await supabase.rpc('get_friend_race_state', {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return normalizeFriendRaceState(data);
}

export async function createFriendRace(
  userId: string,
  userName: string,
  userAvatar: string,
): Promise<FriendRaceState> {
  const { data, error } = await supabase.rpc('create_friend_race', {
    p_user_id: userId,
    p_user_name: userName,
    p_user_avatar: userAvatar,
  });
  if (error) throw new Error(error.message);
  return normalizeFriendRaceState(data);
}

export async function joinFriendRace(
  raceCode: string,
  userId: string,
  userName: string,
  userAvatar: string,
): Promise<FriendRaceState> {
  const { data, error } = await supabase.rpc('join_friend_race', {
    p_race_code: raceCode,
    p_user_id: userId,
    p_user_name: userName,
    p_user_avatar: userAvatar,
  });
  if (error) throw new Error(error.message);
  return normalizeFriendRaceState(data);
}
