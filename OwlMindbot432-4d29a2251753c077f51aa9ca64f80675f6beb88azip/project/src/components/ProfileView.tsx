import { useState } from 'react';
import {
  Sparkles, Flame, CheckCircle, BookOpen, GraduationCap, Trophy, Award, Sunrise, Moon, Zap, Star, Target,
  Settings as SettingsIcon, Moon as MoonIcon, Sun, Monitor, Volume2, Vibrate, Bell, RotateCcw, ChevronRight,
  Coins, Clock, ListChecks, TrendingUp, Timer, Watch, Brain,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { GlassCard, GlassButton, Badge, Modal, ProgressRing, SegmentedControl } from './ui';
import { store, useStore } from '../store';
import { levelFromXp, DAILY_GOALS, type FocusSession, type ThemeMode } from '../types';
import { fmtHM } from '../hooks';

type StatsPeriod = 'today' | 'week' | 'month' | 'all';

type ActivityBucket = {
  label: string;
  detail: string;
  sec: number;
  active: boolean;
};

const ACH_ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles, flame: Flame, 'check-circle': CheckCircle, 'book-open': BookOpen,
  'graduation-cap': GraduationCap, trophy: Trophy, award: Award, sunrise: Sunrise,
  moon: Moon, zap: Zap, star: Star, target: Target,
};

const PERIOD_OPTIONS: { value: StatsPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'all', label: 'All time' },
];

function startOfDay(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfWeek(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  const mondayIndex = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayIndex);
  return date.getTime();
}

function startOfMonth(ts: number): number {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  date.setDate(1);
  return date.getTime();
}

function periodStart(period: StatsPeriod, now: number): number | null {
  if (period === 'today') return startOfDay(now);
  if (period === 'week') return startOfWeek(now);
  if (period === 'month') return startOfMonth(now);
  return null;
}

function sessionsForPeriod(sessions: FocusSession[], period: StatsPeriod, now: number): FocusSession[] {
  const start = periodStart(period, now);
  if (start === null) return sessions;
  return sessions.filter((session) => session.startedAt >= start && session.startedAt <= now);
}

function fmtStatTime(sec: number): string {
  if (sec > 0 && sec < 60) return '<1m';
  return fmtHM(sec);
}

function buildActivityBuckets(sessions: FocusSession[], period: StatsPeriod, now: number): ActivityBucket[] {
  if (period === 'today') {
    const start = startOfDay(now);
    const buckets = ['00', '04', '08', '12', '16', '20'].map((label, index) => ({
      label,
      detail: `${label}:00–${String((index + 1) * 4).padStart(2, '0')}:00`,
      sec: 0,
      active: index === Math.min(5, Math.floor((now - start) / (4 * 3600000))),
    }));
    sessions.forEach((session) => {
      if (session.startedAt < start || session.startedAt > now) return;
      const index = Math.min(5, Math.max(0, Math.floor((session.startedAt - start) / (4 * 3600000))));
      buckets[index].sec += session.durationSec;
    });
    return buckets;
  }

  if (period === 'week') {
    const start = startOfWeek(now);
    const currentIndex = Math.min(6, Math.max(0, Math.floor((startOfDay(now) - start) / 86400000)));
    const buckets = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => ({
      label,
      detail: new Date(start + index * 86400000).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
      sec: 0,
      active: index === currentIndex,
    }));
    sessions.forEach((session) => {
      if (session.startedAt < start || session.startedAt >= start + 7 * 86400000) return;
      const index = Math.min(6, Math.max(0, Math.floor((session.startedAt - start) / 86400000)));
      buckets[index].sec += session.durationSec;
    });
    return buckets;
  }

  if (period === 'month') {
    const date = new Date(now);
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const bucketCount = Math.ceil(daysInMonth / 7);
    const currentIndex = Math.min(bucketCount - 1, Math.floor((date.getDate() - 1) / 7));
    const buckets = Array.from({ length: bucketCount }, (_, index) => {
      const from = index * 7 + 1;
      const to = Math.min(daysInMonth, from + 6);
      return {
        label: from === to ? String(from) : `${from}–${to}`,
        detail: `${date.toLocaleDateString('en-US', { month: 'short' })} ${from}${from === to ? '' : `–${to}`}`,
        sec: 0,
        active: index === currentIndex,
      };
    });
    sessions.forEach((session) => {
      const sessionDate = new Date(session.startedAt);
      if (sessionDate.getFullYear() !== year || sessionDate.getMonth() !== month) return;
      const index = Math.min(bucketCount - 1, Math.floor((sessionDate.getDate() - 1) / 7));
      buckets[index].sec += session.durationSec;
    });
    return buckets;
  }

  const current = new Date(now);
  const eligibleSessions = sessions.filter((session) => session.startedAt <= now);
  const firstSessionAt = eligibleSessions.reduce(
    (earliest, session) => Math.min(earliest, session.startedAt),
    now,
  );
  const firstSession = new Date(firstSessionAt);
  const firstMonth = new Date(firstSession.getFullYear(), firstSession.getMonth(), 1);
  const totalMonths =
    (current.getFullYear() - firstMonth.getFullYear()) * 12 +
    current.getMonth() -
    firstMonth.getMonth() +
    1;
  const monthsPerBucket = Math.max(1, Math.ceil(totalMonths / 6));
  const bucketCount = Math.ceil(totalMonths / monthsPerBucket);
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const startOffset = index * monthsPerBucket;
    const endOffset = Math.min(totalMonths - 1, startOffset + monthsPerBucket - 1);
    const from = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + startOffset, 1);
    const to = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + endOffset, 1);
    const singleMonth = startOffset === endOffset;
    const sameYear = from.getFullYear() === to.getFullYear();
    const fromMonth = from.toLocaleDateString('en-US', { month: 'short' });
    const toMonth = to.toLocaleDateString('en-US', { month: 'short' });

    return {
      label: singleMonth
        ? fromMonth
        : sameYear
          ? `${fromMonth}–${toMonth}`
          : `${String(from.getFullYear()).slice(-2)}–${String(to.getFullYear()).slice(-2)}`,
      detail: singleMonth
        ? from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : `${from.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}–${to.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
      sec: 0,
      active: index === bucketCount - 1,
    };
  });

  eligibleSessions.forEach((session) => {
    const sessionDate = new Date(session.startedAt);
    const monthDistance =
      (sessionDate.getFullYear() - firstMonth.getFullYear()) * 12 +
      sessionDate.getMonth() -
      firstMonth.getMonth();
    const index = Math.floor(monthDistance / monthsPerBucket);
    if (index >= 0 && index < buckets.length) buckets[index].sec += session.durationSec;
  });

  return buckets;
}

export function ProfileView() {
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const sessions = useStore((s) => s.sessions);
  const tasks = useStore((s) => s.tasks);
  const blocks = useStore((s) => s.blocks);
  const [showSettings, setShowSettings] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [period, setPeriod] = useState<StatsPeriod>('week');
  const [selectedActivityIndex, setSelectedActivityIndex] = useState<number | null>(null);

  const now = Date.now();
  const lvl = levelFromXp(profile.xp);
  const filteredSessions = sessionsForPeriod(sessions, period, now);
  const start = periodStart(period, now);
  const periodStudySec = period === 'all'
    ? profile.totalStudySec
    : filteredSessions.reduce((total, session) => total + session.durationSec, 0);
  const periodSessions = period === 'all' ? profile.totalSessions : filteredSessions.length;
  const avgSession = periodSessions > 0 ? Math.floor(periodStudySec / periodSessions) : 0;
  const periodTasksDone = period === 'all'
    ? profile.totalTasksDone
    : tasks.filter((task) => task.completedAt !== null && start !== null && task.completedAt >= start && task.completedAt <= now).length;

  const activity = buildActivityBuckets(sessions, period, now);
  const activityTotal = activity.reduce((total, bucket) => total + bucket.sec, 0);
  const maxActivity = Math.max(...activity.map((bucket) => bucket.sec), 1);
  const bestActivityIndex = activity.reduce(
    (bestIndex, bucket, index) => bucket.sec > activity[bestIndex].sec ? index : bestIndex,
    0,
  );
  const visibleActivityIndex = selectedActivityIndex !== null && activity[selectedActivityIndex]
    ? selectedActivityIndex
    : bestActivityIndex;
  const selectedActivity = activity[visibleActivityIndex];
  const activityTitle = period === 'today'
    ? 'Today Activity'
    : period === 'week'
      ? 'This Week'
      : period === 'month'
        ? 'This Month'
        : 'All-time Trend';
  const averageDivisor = period === 'today'
    ? Math.max(1, new Date(now).getHours() + 1)
    : period === 'week'
      ? ((new Date(now).getDay() + 6) % 7) + 1
      : period === 'month'
        ? new Date(now).getDate()
        : Math.max(1, Math.floor((startOfDay(now) - startOfDay(
          sessions.reduce((earliest, session) => Math.min(earliest, session.startedAt), now),
        )) / 86400000) + 1);
  const averageStudySec = Math.floor(periodStudySec / averageDivisor);
  const averageLabel = period === 'today' ? 'Hourly average' : 'Daily average';
  const bestLabel = period === 'today'
    ? 'Best time'
    : period === 'week'
      ? 'Best day'
      : period === 'month'
        ? 'Best week'
        : 'Best period';
  const periodLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? 'Week';

  const subjectMap: Record<string, number> = {};
  filteredSessions.forEach((session) => {
    subjectMap[session.subject] = (subjectMap[session.subject] ?? 0) + session.durationSec;
  });
  const topSubjects = Object.entries(subjectMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxSubject = topSubjects[0]?.[1] ?? 1;

  const modeTotals = filteredSessions.reduce(
    (totals, session) => {
      totals[session.type] += session.durationSec;
      return totals;
    },
    { pomodoro: 0, stopwatch: 0, deep: 0 },
  );
  const trackedModeTotal = modeTotals.pomodoro + modeTotals.stopwatch + modeTotals.deep;

  const weekStart = startOfWeek(now);
  const weekEnd = weekStart + 7 * 86400000;
  const plannedThisWeek = blocks.reduce(
    (total, block) => total + Math.max(0, block.endMin - block.startMin) * 60,
    0,
  );
  const studiedFromSchedule = sessions
    .filter((session) =>
      Boolean(session.scheduleBlockId) &&
      session.startedAt >= weekStart &&
      session.startedAt < weekEnd,
    )
    .reduce((total, session) => total + session.durationSec, 0);
  const scheduleProgress = plannedThisWeek > 0 ? Math.min(studiedFromSchedule / plannedThisWeek, 1) : 0;

  return (
    <div className="space-y-5 animate-fade-in pb-4">
      <header className="flex items-center justify-between px-1">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Profile</h1>
        <button onClick={() => setShowSettings(true)} className="w-10 h-10 rounded-2xl glass-subtle flex items-center justify-center glass-press">
          <SettingsIcon size={18} />
        </button>
      </header>

      {/* Hero */}
      <GlassCard strong className="p-6 text-center">
        <div className="flex justify-center mb-3">
          <ProgressRing progress={lvl.progress} size={120} stroke={8}>
            <div className="w-20 h-20 rounded-full bg-accent/15 flex items-center justify-center text-4xl">{profile.avatar}</div>
          </ProgressRing>
        </div>
        <h2 className="font-display text-2xl font-bold">{profile.name}</h2>
        <p className="text-sm text-neutralt-500 dark:text-neutralt-400">Level {lvl.level} · {profile.xp} XP</p>
        <div className="mt-3 mx-auto max-w-xs">
          <div className="h-2 rounded-full bg-neutralt-400/20 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-400 transition-all duration-500" style={{ width: `${lvl.progress * 100}%` }} />
          </div>
          <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1">{lvl.current} / {lvl.needed} XP to level {lvl.level + 1}</p>
        </div>
        <div className="flex items-center justify-center gap-2 mt-4">
          <Badge color="amber"><Coins size={12} /> {profile.coins}</Badge>
          <Badge color="accent"><Flame size={12} /> {profile.currentStreak} day streak</Badge>
        </div>
      </GlassCard>

      {/* Statistics */}
      <div>
        <div className="flex items-end justify-between px-1 mb-3">
          <div>
            <p className="font-display font-bold text-xl">Statistics</p>
            <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-0.5">Your real focus activity.</p>
          </div>
        </div>
        <SegmentedControl
          options={PERIOD_OPTIONS}
          value={period}
          onChange={(nextPeriod) => {
            setPeriod(nextPeriod);
            setSelectedActivityIndex(null);
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Clock} label="Study Time" value={fmtStatTime(periodStudySec)} accent />
        <StatCard icon={Target} label="Sessions" value={String(periodSessions)} />
        <StatCard icon={TrendingUp} label="Avg Session" value={fmtStatTime(avgSession)} />
        <StatCard icon={ListChecks} label="Tasks Done" value={String(periodTasksDone)} />
        <StatCard icon={Flame} label="Current Streak" value={`${profile.currentStreak}d`} accent />
        <StatCard icon={Trophy} label="Best Streak" value={`${profile.longestStreak}d`} />
      </div>

      {/* One activity graph — Profile only */}
      <GlassCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-display font-bold text-lg">{activityTitle}</p>
          <Badge color="accent">{fmtStatTime(periodStudySec)}</Badge>
        </div>
        {activityTotal === 0 ? (
          <div className="h-24 flex items-center justify-center text-center">
            <p className="text-sm text-neutralt-500 dark:text-neutralt-400">No study activity in this period yet.</p>
          </div>
        ) : (
          <div>
            <div className="glass-subtle rounded-xl px-3 py-2 mb-3 flex items-center justify-between gap-3">
              <span className="text-xs text-neutralt-500 dark:text-neutralt-400 truncate">{selectedActivity.detail}</span>
              <span className="text-sm font-bold shrink-0">{fmtStatTime(selectedActivity.sec)}</span>
            </div>
            <div
              className="grid h-24 items-end gap-2"
              style={{ gridTemplateColumns: `repeat(${activity.length}, minmax(0, 1fr))` }}
            >
              {activity.map((bucket, index) => {
                const height = bucket.sec > 0 ? Math.max((bucket.sec / maxActivity) * 100, 8) : 3;
                const selected = index === visibleActivityIndex;
                return (
                  <button
                    key={`${bucket.label}-${index}`}
                    type="button"
                    onClick={() => setSelectedActivityIndex(index)}
                    className="h-full min-w-0 flex items-end rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    aria-label={`${bucket.detail}: ${fmtStatTime(bucket.sec)}`}
                    aria-pressed={selected}
                  >
                    <span
                      className={`block w-full rounded-t-lg transition-all duration-500 ${selected ? 'bg-accent' : bucket.active ? 'bg-accent/70' : 'bg-accent/35'}`}
                      style={{ height: `${height}%` }}
                    />
                  </button>
                );
              })}
            </div>
            <div
              className="grid gap-2 mt-1.5"
              style={{ gridTemplateColumns: `repeat(${activity.length}, minmax(0, 1fr))` }}
            >
              {activity.map((bucket, index) => (
                <span
                  key={`${bucket.label}-label-${index}`}
                  className={`text-[10px] font-medium text-center truncate ${index === visibleActivityIndex ? 'text-accent' : 'text-neutralt-500 dark:text-neutralt-400'}`}
                >
                  {bucket.label}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-neutralt-400/15">
              <div>
                <p className="text-[10px] text-neutralt-500 dark:text-neutralt-400">{averageLabel}</p>
                <p className="text-sm font-bold mt-0.5">{fmtStatTime(averageStudySec)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-neutralt-500 dark:text-neutralt-400">{bestLabel}</p>
                <p className="text-sm font-bold mt-0.5 truncate">{activity[bestActivityIndex].label} · {fmtStatTime(activity[bestActivityIndex].sec)}</p>
              </div>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Top subjects */}
      <GlassCard className="p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="font-display font-bold text-lg">Top Subjects</p>
          <Badge color="neutral">{periodLabel}</Badge>
        </div>
        {topSubjects.length === 0 ? (
          <p className="text-sm text-neutralt-500 dark:text-neutralt-400 py-4 text-center">No subject data in this period yet.</p>
        ) : (
          <div className="space-y-2.5">
            {topSubjects.map(([subject, sec], index) => (
              <div key={subject}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate pr-3">{index + 1}. {subject}</span>
                  <span className="text-xs text-neutralt-500 dark:text-neutralt-400 shrink-0">{fmtStatTime(sec)}</span>
                </div>
                <div className="h-2 rounded-full bg-neutralt-400/20 overflow-hidden">
                  <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${(sec / maxSubject) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Focus mode distribution */}
      <GlassCard className="p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="font-display font-bold text-lg">Focus Modes</p>
          <Badge color="neutral">{filteredSessions.length} sessions</Badge>
        </div>
        {trackedModeTotal === 0 ? (
          <p className="text-sm text-neutralt-500 dark:text-neutralt-400 py-4 text-center">Complete a focus session to see your mix.</p>
        ) : (
          <div className="space-y-3">
            <ModeRow icon={Timer} label="Pomodoro" sec={modeTotals.pomodoro} total={trackedModeTotal} tone="accent" />
            <ModeRow icon={Watch} label="Stopwatch" sec={modeTotals.stopwatch} total={trackedModeTotal} tone="blue" />
            <ModeRow icon={Brain} label="Deep Focus" sec={modeTotals.deep} total={trackedModeTotal} tone="purple" />
          </div>
        )}
      </GlassCard>

      {/* Schedule progress */}
      {blocks.length > 0 && (
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-display font-bold text-lg">Schedule Progress</p>
              <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-0.5">Planned vs studied this week</p>
            </div>
            <Badge color={scheduleProgress >= 1 ? 'green' : 'accent'}>{Math.round(scheduleProgress * 100)}%</Badge>
          </div>
          <div className="flex items-end justify-between gap-4 mb-3">
            <div>
              <p className="text-xs text-neutralt-500 dark:text-neutralt-400">Studied</p>
              <p className="font-display text-xl font-bold">{fmtHM(studiedFromSchedule)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-neutralt-500 dark:text-neutralt-400">Planned</p>
              <p className="font-display text-xl font-bold">{fmtHM(plannedThisWeek)}</p>
            </div>
          </div>
          <div className="h-3 rounded-full bg-neutralt-400/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-accent-400 transition-all duration-700"
              style={{ width: `${scheduleProgress * 100}%` }}
            />
          </div>
        </GlassCard>
      )}

      {/* Achievements */}
      <GlassCard className="p-5">
        <p className="font-display font-bold text-lg mb-3">Achievements</p>
        <div className="grid grid-cols-3 gap-3">
          {profile.achievements.map((achievement) => {
            const Icon = ACH_ICONS[achievement.icon] ?? Award;
            return (
              <div key={achievement.id} className={`rounded-2xl p-3 text-center transition-all ${achievement.unlocked ? 'glass-subtle' : 'bg-neutralt-400/10 opacity-50'}`}>
                <div className={`w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-1.5 ${achievement.unlocked ? 'bg-accent/15 text-accent' : 'bg-neutralt-400/20 text-neutralt-400'}`}>
                  <Icon size={22} />
                </div>
                <p className="text-[11px] font-semibold leading-tight">{achievement.name}</p>
                <p className="text-[9px] text-neutralt-500 dark:text-neutralt-400 mt-0.5">{achievement.unlocked ? 'Unlocked' : `${achievement.progress}/${achievement.target}`}</p>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Settings modal */}
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Settings">
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold mb-2">Appearance</p>
            <SegmentedControl
              options={[
                { value: 'light', label: 'Light', icon: Sun },
                { value: 'dark', label: 'Dark', icon: MoonIcon },
                { value: 'system', label: 'Auto', icon: Monitor },
              ]}
              value={settings.theme}
              onChange={(value: ThemeMode) => store.updateSettings({ theme: value })}
            />
          </div>
          <div>
            <p className="text-sm font-semibold mb-2">Daily Goal</p>
            <div className="grid grid-cols-4 gap-2">
              {DAILY_GOALS.map((goal) => (
                <button key={goal.min} onClick={() => store.updateSettings({ dailyGoalMin: goal.min })} className={`py-3 rounded-2xl font-bold text-sm glass-press transition-all ${settings.dailyGoalMin === goal.min ? 'bg-accent text-white shadow-glow' : 'glass-subtle'}`}>{goal.label}</button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Notifications</p>
            <ToggleRow icon={Volume2} label="Sound" value={settings.soundEnabled} onChange={(value) => store.updateSettings({ soundEnabled: value })} />
            <ToggleRow icon={Vibrate} label="Vibration" value={settings.vibrationEnabled} onChange={(value) => store.updateSettings({ vibrationEnabled: value })} />
            <ToggleRow icon={Bell} label="Daily goal reminder" value={settings.dailyGoalReminder} onChange={(value) => store.updateSettings({ dailyGoalReminder: value })} />
          </div>
          <button onClick={() => { setShowSettings(false); setShowReset(true); }} className="w-full flex items-center justify-between glass-subtle rounded-2xl px-4 py-3 text-red-500 glass-press">
            <span className="flex items-center gap-2 text-sm font-medium"><RotateCcw size={16} /> Reset all data</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </Modal>

      <Modal open={showReset} onClose={() => setShowReset(false)} title="Reset all data?">
        <p className="text-sm text-neutralt-500 dark:text-neutralt-400 mb-5">This will erase all your progress, tasks, sessions, and achievements. This cannot be undone.</p>
        <div className="flex gap-3">
          <GlassButton variant="neutral" className="flex-1" onClick={() => setShowReset(false)}>Cancel</GlassButton>
          <GlassButton variant="danger" className="flex-1" onClick={() => { store.resetAll(); setShowReset(false); }}>Reset</GlassButton>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent = false }: { icon: LucideIcon; label: string; value: string; accent?: boolean }) {
  return (
    <GlassCard className="p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${accent ? 'bg-accent/15 text-accent' : 'bg-neutralt-400/15 text-neutralt-600 dark:text-neutralt-300'}`}>
        <Icon size={18} />
      </div>
      <p className="text-xs text-neutralt-500 dark:text-neutralt-400">{label}</p>
      <p className="font-display text-lg font-bold">{value}</p>
    </GlassCard>
  );
}

function ModeRow({
  icon: Icon,
  label,
  sec,
  total,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  sec: number;
  total: number;
  tone: 'accent' | 'blue' | 'purple';
}) {
  const progress = total > 0 ? (sec / total) * 100 : 0;
  const iconClass = tone === 'accent'
    ? 'bg-accent/15 text-accent'
    : tone === 'blue'
      ? 'bg-blue-500/15 text-blue-500'
      : 'bg-purple-500/15 text-purple-500';
  const barClass = tone === 'accent'
    ? 'bg-accent'
    : tone === 'blue'
      ? 'bg-blue-500'
      : 'bg-purple-500';

  return (
    <div>
      <div className="flex items-center gap-3 mb-1.5">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${iconClass}`}>
          <Icon size={15} />
        </div>
        <span className="text-sm font-medium flex-1">{label}</span>
        <span className="text-xs text-neutralt-500 dark:text-neutralt-400">{fmtHM(sec)}</span>
      </div>
      <div className="h-2 rounded-full bg-neutralt-400/20 overflow-hidden ml-11">
        <div className={`h-full rounded-full transition-all duration-500 ${barClass}`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function ToggleRow({ icon: Icon, label, value, onChange }: { icon: LucideIcon; label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="w-full flex items-center justify-between glass-subtle rounded-2xl px-4 py-3 glass-press">
      <span className="flex items-center gap-2 text-sm font-medium"><Icon size={16} className="text-neutralt-500" />{label}</span>
      <span className={`w-10 h-6 rounded-full p-0.5 transition-colors ${value ? 'bg-accent' : 'bg-neutralt-400/40'}`}>
        <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
}

