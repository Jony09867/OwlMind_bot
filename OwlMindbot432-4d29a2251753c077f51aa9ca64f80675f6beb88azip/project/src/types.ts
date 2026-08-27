export type Priority = 'low' | 'medium' | 'high';

export type TaskCategory = {
  id: string;
  name: string;
  color: string;
};

export type Task = {
  id: string;
  title: string;
  subject: string;
  category: string;
  priority: Priority;
  deadline: string | null;
  done: boolean;
  createdAt: number;
  completedAt: number | null;
  repeat: 'none' | 'daily' | 'weekly';
  xpAwarded: boolean;
};

export type SessionType = 'pomodoro' | 'stopwatch' | 'deep';
export type PomodoroPhase = 'focus' | 'short' | 'long';

export type FocusSession = {
  id: string;
  type: SessionType;
  subject: string;
  category: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  pomodoroCount: number;
  xpEarned: number;
  roomId: string | null;
  scheduleBlockId?: string | null;
  scheduleBlockTitle?: string | null;
  /** 1 = created after the cloud session ledger was introduced. */
  ledgerVersion?: 1;
};

export type StudyBlock = {
  id: string;
  title: string;
  subject: string;
  day: number;
  startMin: number;
  endMin: number;
  reminder: boolean;
};

export type StudyRoom = {
  id: string;
  name: string;
  ownerName: string;
  isPrivate: boolean;
  members: RoomMember[];
  totalStudySec: number;
  totalSessions: number;
};

export type RoomMember = {
  id: string;
  name: string;
  subject: string;
  elapsedSec: number;
  online: boolean;
  isYou: boolean;
};

export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress: number;
  target: number;
};

export type RankingEntry = {
  id: string;
  name: string;
  avatar: string;
  studySec: number;
  sessions: number;
  isYou: boolean;
  level: number;
};

export type ThemeMode = 'light' | 'dark' | 'system';

export type Settings = {
  theme: ThemeMode;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  dailyGoalMin: number;
  pomodoroFocus: number;
  pomodoroShort: number;
  pomodoroLong: number;
  dailyGoalReminder: boolean;
};

export type UserProfile = {
  name: string;
  avatar: string;
  level: number;
  xp: number;
  coins: number;
  totalStudySec: number;
  totalSessions: number;
  totalTasksDone: number;
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string | null;
  streakFreezes: number;
  achievements: Achievement[];
  createdAt: number;
};

export type RankingScope =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'seasonal'
  | 'friends'
  | 'room'
  | 'global';

export const POMODORO_PRESETS = [
  { name: 'Classic', focus: 25, short: 5, long: 20 },
  { name: 'Deep', focus: 50, short: 10, long: 20 },
  { name: 'Flow', focus: 90, short: 20, long: 30 },
] as const;

export const DAILY_GOALS = [
  { label: '1h', min: 60 },
  { label: '2h', min: 120 },
  { label: '4h', min: 240 },
  { label: '6h', min: 360 },
] as const;

export const DEFAULT_CATEGORIES: TaskCategory[] = [
  { id: 'study', name: 'Study', color: '#f54d1c' },
  { id: 'work', name: 'Work', color: '#3b82f6' },
  { id: 'sport', name: 'Sport', color: '#22c55e' },
  { id: 'reading', name: 'Reading', color: '#a855f7' },
];

export const XP_RULES = {
  sessionPer5Min: 1,
  taskDone: 2,
  dailyGoal: 10,
  streak7: 15,
} as const;

export const ACHIEVEMENTS: Omit<Achievement, 'unlocked' | 'progress'>[] = [
  { id: 'first_session', name: 'First Focus', description: 'Complete your first study session', icon: 'sparkles', target: 1 },
  { id: 'streak7', name: '7-Day Streak', description: 'Study 7 days in a row', icon: 'flame', target: 7 },
  { id: 'tasks10', name: 'Task Master', description: 'Complete 10 tasks', icon: 'check-circle', target: 10 },
  { id: 'hours10', name: 'Bookworm', description: 'Study for 10 hours total', icon: 'book-open', target: 10 },
  { id: 'hours100', name: 'Scholar', description: 'Study for 100 hours total', icon: 'graduation-cap', target: 100 },
  { id: 'tasks500', name: 'Productivity Legend', description: 'Complete 500 tasks', icon: 'trophy', target: 500 },
  { id: 'streak30', name: 'Consistency Master', description: '30-day streak', icon: 'award', target: 30 },
  { id: 'early_bird', name: 'Early Bird', description: 'Study before 7 AM', icon: 'sunrise', target: 1 },
  { id: 'night_owl', name: 'Night Owl', description: 'Study after midnight', icon: 'moon', target: 1 },
  { id: 'marathon', name: 'Marathon Learner', description: 'Study 4+ hours in one day', icon: 'zap', target: 1 },
  { id: 'level10', name: 'Rising Scholar', description: 'Reach level 10', icon: 'star', target: 10 },
  { id: 'sessions100', name: 'Centurion', description: 'Complete 100 focus sessions', icon: 'target', target: 100 },
];

export function xpForLevel(level: number): number {
  return Math.floor(50 * level * Math.sqrt(level));
}

export function levelFromXp(xp: number): { level: number; current: number; needed: number; progress: number } {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const lower = xpForLevel(level);
  const upper = xpForLevel(level + 1);
  const current = xp - lower;
  const needed = upper - lower;
  return { level, current, needed, progress: current / needed };
}
