import { useMemo, useSyncExternalStore } from 'react';
import type {
  Task,
  TaskCategory,
  FocusSession,
  StudyBlock,
  StudyRoom,
  UserProfile,
  Settings,
  RankingEntry,
  SessionType,
  RoomMember,
} from './types';
import {
  ACHIEVEMENTS,
  XP_RULES,
  DEFAULT_CATEGORIES,
  levelFromXp,
} from './types';
import { getTelegramUserId } from './telegram';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import { getTelegramUser } from './telegram';
import { syncUserStudyStats } from './lib/supabase';

export type TimerState = {
  isRunning: boolean;
  isPaused: boolean;
  startedAt: number | null;
  pausedAt: number | null;
  elapsedSec: number;
  subject: string;
  category: string;
  type: SessionType;
};

type State = {
  profile: UserProfile;
  settings: Settings;
  tasks: Task[];
  categories: TaskCategory[];
  sessions: FocusSession[];
  blocks: StudyBlock[];
  rooms: StudyRoom[];
  joinedRoomId: string | null;
  timer: TimerState | null;
  onboarded: boolean;
};

function storageKey(): string {
  const uid = getTelegramUserId();
  return uid ? `owlmind-state-v1:${uid}` : 'owlmind-state-v1';
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function defaultProfile(): UserProfile {
  return {
    name: 'You',
    avatar: '🦉',
    level: 1,
    xp: 0,
    coins: 50,
    totalStudySec: 0,
    totalSessions: 0,
    totalTasksDone: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastStudyDate: null,
    streakFreezes: 2,
    achievements: ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: false,
      progress: 0,
    })),
    createdAt: Date.now(),
  };
}

function defaultSettings(): Settings {
  return {
    theme: 'system',
    soundEnabled: true,
    vibrationEnabled: true,
    dailyGoalMin: 120,
    pomodoroFocus: 25,
    pomodoroShort: 5,
    pomodoroLong: 20,
    dailyGoalReminder: true,
  };
}

function seedTasks(): Task[] {
  return [
    { id: uid(), title: 'Calculus problem set 4', subject: 'Math', category: 'study', priority: 'high', deadline: todayStr(), done: false, createdAt: Date.now(), completedAt: null, repeat: 'none', xpAwarded: false },
    { id: uid(), title: 'Read Chapter 7: Cell Biology', subject: 'Biology', category: 'reading', priority: 'medium', deadline: todayStr(), done: false, createdAt: Date.now(), completedAt: null, repeat: 'none', xpAwarded: false },
    { id: uid(), title: 'Spanish vocab review', subject: 'Spanish', category: 'study', priority: 'low', deadline: null, done: false, createdAt: Date.now(), completedAt: null, repeat: 'daily', xpAwarded: false },
    { id: uid(), title: 'History essay draft', subject: 'History', category: 'study', priority: 'high', deadline: addDays(todayStr(), 2), done: false, createdAt: Date.now(), completedAt: null, repeat: 'none', xpAwarded: false },
    { id: uid(), title: 'Morning run', subject: 'PE', category: 'sport', priority: 'medium', deadline: null, done: true, createdAt: Date.now() - 86400000, completedAt: Date.now() - 80000000, repeat: 'daily', xpAwarded: true },
  ];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function seedBlocks(): StudyBlock[] {
  return [
    { id: uid(), title: 'Math deep work', subject: 'Math', day: 1, startMin: 9 * 60, endMin: 11 * 60, reminder: true },
    { id: uid(), title: 'Biology reading', subject: 'Biology', day: 1, startMin: 14 * 60, endMin: 15 * 60, reminder: false },
    { id: uid(), title: 'Spanish practice', subject: 'Spanish', day: 2, startMin: 10 * 60, endMin: 11 * 60, reminder: true },
    { id: uid(), title: 'History essay', subject: 'History', day: 3, startMin: 16 * 60, endMin: 18 * 60, reminder: true },
    { id: uid(), title: 'Physics lab prep', subject: 'Physics', day: 4, startMin: 13 * 60, endMin: 15 * 60, reminder: false },
  ];
}

function seedRooms(): StudyRoom[] {
  const mk = (name: string, owner: string, privateR: boolean, members: RoomMember[], total: number, sess: number): StudyRoom => ({
    id: uid(), name, ownerName: owner, isPrivate: privateR, members, totalStudySec: total, totalSessions: sess,
  });
  return [
    mk('Late Night Grind', 'Ali', false, [
      { id: 'm1', name: 'Ali', subject: 'Math', elapsedSec: 2520, online: true, isYou: false },
      { id: 'm2', name: 'John', subject: 'English', elapsedSec: 1860, online: true, isYou: false },
      { id: 'm3', name: 'Sara', subject: 'Physics', elapsedSec: 3240, online: true, isYou: false },
    ], 36000, 42),
    mk('Morning Scholars', 'Lena', false, [
      { id: 'm4', name: 'Lena', subject: 'Chemistry', elapsedSec: 1200, online: true, isYou: false },
      { id: 'm5', name: 'Mike', subject: 'History', elapsedSec: 900, online: false, isYou: false },
    ], 18000, 24),
    mk('CS Study Crew', 'David', true, [
      { id: 'm6', name: 'David', subject: 'CS', elapsedSec: 5400, online: true, isYou: false },
      { id: 'm7', name: 'Anna', subject: 'CS', elapsedSec: 3600, online: true, isYou: false },
      { id: 'm8', name: 'Tom', subject: 'Math', elapsedSec: 7200, online: false, isYou: false },
    ], 72000, 88),
  ];
}

function defaultState(): State {
  return {
    profile: defaultProfile(),
    settings: defaultSettings(),
    tasks: seedTasks(),
    categories: DEFAULT_CATEGORIES,
    sessions: [],
    blocks: seedBlocks(),
    rooms: seedRooms(),
    joinedRoomId: null,
    timer: null,
    onboarded: false,
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<State>;
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      profile: { ...base.profile, ...parsed.profile },
      settings: { ...base.settings, ...parsed.settings },
      categories: parsed.categories?.length ? parsed.categories : base.categories,
      tasks: parsed.tasks ?? base.tasks,
      sessions: parsed.sessions ?? base.sessions,
      blocks: parsed.blocks ?? base.blocks,
      rooms: parsed.rooms ?? base.rooms,
      timer: parsed.timer ?? null,
      onboarded: parsed.onboarded ?? false,
    };
  } catch {
    return defaultState();
  }
}

let state: State = load();
const listeners = new Set<() => void>();

function save() {
  localStorage.setItem(storageKey(), JSON.stringify(state));
}

function emit() {
  save();
  listeners.forEach((l) => l());
}

function setState(updater: (s: State) => State) {
  state = updater(state);
  emit();
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => selector(state),
    () => selector(state)
  );
}

function recalcAchievements(p: UserProfile, s: State): UserProfile {
  const hours = p.totalStudySec / 3600;
  const dayStudy = s.sessions.filter((x) => x.startedAt >= startOfDay(Date.now())).reduce((a, b) => a + b.durationSec, 0);
  const earlyBird = s.sessions.some((x) => new Date(x.startedAt).getHours() < 7);
  const nightOwl = s.sessions.some((x) => new Date(x.startedAt).getHours() >= 0 && new Date(x.startedAt).getHours() < 4);
  const marathon = dayStudy >= 4 * 3600;
  const lvl = levelFromXp(p.xp).level;

  const progressMap: Record<string, number> = {
    first_session: p.totalSessions,
    streak7: p.currentStreak,
    tasks10: p.totalTasksDone,
    hours10: Math.floor(hours),
    hours100: Math.floor(hours),
    tasks500: p.totalTasksDone,
    streak30: p.currentStreak,
    early_bird: earlyBird ? 1 : 0,
    night_owl: nightOwl ? 1 : 0,
    marathon: marathon ? 1 : 0,
    level10: lvl,
    sessions100: p.totalSessions,
  };

  const achievements = p.achievements.map((a) => {
    const prog = Math.min(progressMap[a.id] ?? 0, a.target);
    return { ...a, progress: prog, unlocked: a.unlocked || prog >= a.target };
  });

  return { ...p, achievements };
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function updateStreak(p: UserProfile): UserProfile {
  const today = todayStr();
  if (p.lastStudyDate === today) return p;
  if (p.lastStudyDate) {
    const last = new Date(p.lastStudyDate);
    const now = new Date(today);
    const diff = Math.round((now.getTime() - last.getTime()) / 86400000);
    if (diff === 1) {
      return { ...p, currentStreak: p.currentStreak + 1, longestStreak: Math.max(p.longestStreak, p.currentStreak + 1), lastStudyDate: today };
    } else if (diff > 1) {
      if (p.streakFreezes > 0 && diff === 2) {
        return { ...p, streakFreezes: p.streakFreezes - 1, lastStudyDate: today };
      }
      return { ...p, currentStreak: 1, lastStudyDate: today };
    }
  } else {
    return { ...p, currentStreak: 1, lastStudyDate: today };
  }
  return p;
}

export const store = {
  get: () => state,

  addTask(input: Omit<Task, 'id' | 'createdAt' | 'done' | 'completedAt' | 'xpAwarded'>): void {
    setState((s) => ({
      ...s,
      tasks: [
        { ...input, id: uid(), createdAt: Date.now(), done: false, completedAt: null, xpAwarded: false },
        ...s.tasks,
      ],
    }));
  },

  toggleTask(id: string): void {
    setState((s) => {
      let xpDelta = 0;
      let tasksDoneDelta = 0;
      const tasks = s.tasks.map((t) => {
        if (t.id !== id) return t;
        const done = !t.done;
        if (done && !t.xpAwarded) {
          xpDelta += XP_RULES.taskDone;
          tasksDoneDelta = 1;
        }
        return { ...t, done, completedAt: done ? Date.now() : null, xpAwarded: done ? true : t.xpAwarded };
      });
      let profile = { ...s.profile, xp: s.profile.xp + xpDelta, totalTasksDone: s.profile.totalTasksDone + tasksDoneDelta };
      profile = recalcAchievements(profile, { ...s, tasks });
      return { ...s, tasks, profile };
    });
  },

  deleteTask(id: string): void {
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
  },

  addCategory(name: string, color: string): void {
    setState((s) => ({
      ...s,
      categories: [...s.categories, { id: uid(), name, color }],
    }));
  },

  deleteCategory(id: string): void {
    setState((s) => ({
      ...s,
      categories: s.categories.filter((c) => c.id !== id),
    }));
  },

  completeSession(opts: {
    type: SessionType;
    subject: string;
    category: string;
    durationSec: number;
    pomodoroCount: number;
    roomId: string | null;
  }): { xpEarned: number; leveledUp: boolean; newAchievements: string[] } {
    const xpEarned = Math.max(1, Math.floor(opts.durationSec / 60 / 5) * XP_RULES.sessionPer5Min);
    const session: FocusSession = {
      id: uid(),
      type: opts.type,
      subject: opts.subject,
      category: opts.category,
      startedAt: Date.now() - opts.durationSec * 1000,
      endedAt: Date.now(),
      durationSec: opts.durationSec,
      pomodoroCount: opts.pomodoroCount,
      xpEarned,
      roomId: opts.roomId,
    };
    let result = { xpEarned, leveledUp: false, newAchievements: [] as string[] };

    setState((s) => {
      const oldLevel = levelFromXp(s.profile.xp).level;
      let profile: UserProfile = {
        ...s.profile,
        xp: s.profile.xp + xpEarned,
        totalStudySec: s.profile.totalStudySec + opts.durationSec,
        totalSessions: s.profile.totalSessions + 1,
      };
      profile = updateStreak(profile);
      if (profile.currentStreak === 7) profile.xp += XP_RULES.streak7;
      const newLevel = levelFromXp(profile.xp).level;
      if (newLevel > oldLevel) {
        profile.coins += 20 * (newLevel - oldLevel);
        result.leveledUp = true;
      }
      const beforeAch = profile.achievements.filter((a) => a.unlocked).map((a) => a.id);
      profile = recalcAchievements(profile, { ...s, sessions: [...s.sessions, session] });
      const afterAch = profile.achievements.filter((a) => a.unlocked).map((a) => a.id);
      result.newAchievements = afterAch.filter((id) => !beforeAch.includes(id));
      return { ...s, profile, sessions: [...s.sessions, session] };
    });

    if (isSupabaseConfigured && opts.roomId) {
      supabase.rpc('increment_room_totals', {
        p_room_id: opts.roomId,
        p_study_sec: opts.durationSec,
        p_sessions: 1,
      }).then(() => {});
    }

    if (isSupabaseConfigured) {
      const telegramUser = getTelegramUser();
      if (telegramUser) {
        const p = state.profile;
        syncUserStudyStats(telegramUser, p.totalStudySec, p.totalSessions, p.level).then(({ error }) => {
          if (error) console.error('Failed to sync user study stats', error.message);
        });
      }
    }

    return result;
  },

  addBlock(block: Omit<StudyBlock, 'id'>): void {
    setState((s) => ({ ...s, blocks: [...s.blocks, { ...block, id: uid() }] }));
  },

  deleteBlock(id: string): void {
    setState((s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== id) }));
  },

  joinRoom(id: string): void {
    setState((s) => ({ ...s, joinedRoomId: id }));
  },

  leaveRoom(): void {
    setState((s) => ({ ...s, joinedRoomId: null }));
  },

  addRoom(room: StudyRoom): void {
    setState((s) => ({ ...s, rooms: [...s.rooms, room] }));
  },

  updateRoomMemberStudy(subject: string, elapsedSec: number): void {
    setState((s) => {
      if (!s.joinedRoomId) return s;
      const rooms = s.rooms.map((r) => {
        if (r.id !== s.joinedRoomId) return r;
        return {
          ...r,
          members: r.members.map((m) => (m.isYou ? { ...m, subject, elapsedSec, online: true } : m)),
        };
      });
      return { ...s, rooms };
    });
    if (isSupabaseConfigured && state.joinedRoomId) {
      const uid = getTelegramUserId() ?? 'local-user';
      supabase
        .from('room_participants')
        .update({ subject, elapsed_sec: elapsedSec, is_online: true })
        .eq('room_id', state.joinedRoomId)
        .eq('user_id', uid)
        .then(() => {});
      supabase
        .from('rooms')
        .update({ total_study_sec: state.rooms.find((r) => r.id === state.joinedRoomId)?.totalStudySec ?? 0 })
        .eq('id', state.joinedRoomId)
        .then(() => {});
    }
  },

  updateSettings(patch: Partial<Settings>): void {
    setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  },

  updateProfile(patch: Partial<UserProfile>): void {
    setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }));
  },

  resetAll(): void {
    state = defaultState();
    emit();
  },

  startTimer(opts: { subject: string; category: string; type: SessionType }): void {
    setState((s) => ({
      ...s,
      timer: {
        isRunning: true,
        isPaused: false,
        startedAt: Date.now(),
        pausedAt: null,
        elapsedSec: 0,
        subject: opts.subject,
        category: opts.category,
        type: opts.type,
      },
    }));
  },

  pauseTimer(): void {
    setState((s) => {
      if (!s.timer || !s.timer.isRunning) return s;
      return { ...s, timer: { ...s.timer, isPaused: true, isRunning: false, pausedAt: Date.now() } };
    });
  },

  resumeTimer(): void {
    setState((s) => {
      if (!s.timer || !s.timer.isPaused) return s;
      return { ...s, timer: { ...s.timer, isPaused: false, isRunning: true, pausedAt: null } };
    });
  },

  resetTimer(): void {
    setState((s) => ({ ...s, timer: null }));
  },

  tickTimer(): void {
    setState((s) => {
      if (!s.timer || !s.timer.isRunning || !s.timer.startedAt) return s;
      const elapsedSec = Math.floor((Date.now() - s.timer.startedAt) / 1000);
      return { ...s, timer: { ...s.timer, elapsedSec } };
    });
  },

  endTimer(): { xpEarned: number; leveledUp: boolean; newAchievements: string[]; duration: number } | null {
    const t = state.timer;
    if (!t) return null;
    const result = store.completeSession({
      type: t.type,
      subject: t.subject,
      category: t.category,
      durationSec: t.elapsedSec,
      pomodoroCount: 0,
      roomId: state.joinedRoomId,
    });
    setState((s) => ({ ...s, timer: null }));
    return { ...result, duration: t.elapsedSec };
  },

  completeOnboarding(profile: { name: string; avatar: string }): void {
    setState((s) => ({
      ...s,
      profile: { ...s.profile, name: profile.name, avatar: profile.avatar },
      onboarded: true,
    }));
  },
};

export function useDailyStudySec(): number {
  return useStore((s) =>
    s.sessions
      .filter((x) => x.startedAt >= startOfDay(Date.now()))
      .reduce((a, b) => a + b.durationSec, 0)
  );
}

export function useWeeklyStudySec(): number[] {
  const sessions = useStore((s) => s.sessions);
  return useMemo(() => {
    const days: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const start = startOfDay(Date.now() - i * 86400000);
      const end = start + 86400000;
      const total = sessions
        .filter((x) => x.startedAt >= start && x.startedAt < end)
        .reduce((a, b) => a + b.durationSec, 0);
      days.push(total);
    }
    return days;
  }, [sessions]);
}

export function getRankings(_scope: string, profile: UserProfile, remoteEntries: RankingEntry[] = []): RankingEntry[] {
  const currentUser: RankingEntry = {
    id: getTelegramUserId() ?? 'local-user',
    name: profile.name,
    avatar: profile.avatar,
    studySec: profile.totalStudySec,
    sessions: profile.totalSessions,
    isYou: true,
    level: profile.level,
  };
  const byId = new Map(remoteEntries.map((entry) => [entry.id, entry]));
  byId.set(currentUser.id, { ...byId.get(currentUser.id), ...currentUser, isYou: true });
  return [...byId.values()].sort((a, b) => b.studySec - a.studySec || a.name.localeCompare(b.name));
}
