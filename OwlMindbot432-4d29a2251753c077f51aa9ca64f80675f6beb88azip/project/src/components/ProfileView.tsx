import { useState } from 'react';
import {
  Sparkles, Flame, CheckCircle, BookOpen, GraduationCap, Trophy, Award, Sunrise, Moon, Zap, Star, Target,
  Settings as SettingsIcon, Moon as MoonIcon, Sun, Monitor, Volume2, Vibrate, Bell, RotateCcw, ChevronRight, Coins, Clock, ListChecks, TrendingUp,
} from 'lucide-react';
import { GlassCard, GlassButton, Badge, Modal, ProgressRing, SegmentedControl } from './ui';
import { store, useStore, useWeeklyStudySec } from '../store';
import { levelFromXp, DAILY_GOALS, type ThemeMode } from '../types';
import { fmtHM } from '../hooks';

const ACH_ICONS: Record<string, any> = {
  sparkles: Sparkles, flame: Flame, 'check-circle': CheckCircle, 'book-open': BookOpen,
  'graduation-cap': GraduationCap, trophy: Trophy, award: Award, sunrise: Sunrise,
  moon: Moon, zap: Zap, star: Star, target: Target,
};

export function ProfileView() {
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const sessions = useStore((s) => s.sessions);
  const [showSettings, setShowSettings] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const lvl = levelFromXp(profile.xp);
  const weekly = useWeeklyStudySec();
  const weeklyTotal = weekly.reduce((a, b) => a + b, 0);
  const todayIndex = (new Date().getDay() + 6) % 7;

  const subjectMap: Record<string, number> = {};
  sessions.forEach((s) => { subjectMap[s.subject] = (subjectMap[s.subject] ?? 0) + s.durationSec; });
  const topSubjects = Object.entries(subjectMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxSubject = topSubjects[0]?.[1] ?? 1;

  const avgSession = sessions.length ? Math.floor(profile.totalStudySec / sessions.length) : 0;
  const unlockedAch = profile.achievements.filter((a) => a.unlocked).length;

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

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={Clock} label="Total Study" value={fmtHM(profile.totalStudySec)} accent />
        <StatCard icon={Target} label="Sessions" value={String(profile.totalSessions)} />
        <StatCard icon={ListChecks} label="Tasks Done" value={String(profile.totalTasksDone)} />
        <StatCard icon={TrendingUp} label="Longest Streak" value={`${profile.longestStreak}d`} />
        <StatCard icon={Flame} label="Current Streak" value={`${profile.currentStreak}d`} accent />
        <StatCard icon={Trophy} label="Achievements" value={`${unlockedAch}/${profile.achievements.length}`} />
      </div>

      {/* Weekly overview */}
      <GlassCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-display font-bold text-lg">This Week</p>
          <Badge color="accent">{fmtHM(weeklyTotal)}</Badge>
        </div>
        <div className="flex items-end justify-between gap-2 h-24">
          {weekly.map((sec, i) => {
            const max = Math.max(...weekly, 3600);
            const h = Math.max((sec / max) * 100, 4);
            const today = i === todayIndex;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex-1 flex items-end">
                  <div className={`w-full rounded-t-lg transition-all duration-500 ${today ? 'bg-accent' : 'bg-accent/40'}`} style={{ height: `${h}%` }} />
                </div>
                <span className="text-[10px] text-neutralt-500 dark:text-neutralt-400 font-medium">{['M','T','W','T','F','S','S'][i]}</span>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Top subjects */}
      {topSubjects.length > 0 && (
        <GlassCard className="p-5">
          <p className="font-display font-bold text-lg mb-3">Top Subjects</p>
          <div className="space-y-2.5">
            {topSubjects.map(([subj, sec], i) => (
              <div key={subj}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{i + 1}. {subj}</span>
                  <span className="text-xs text-neutralt-500 dark:text-neutralt-400">{fmtHM(sec)}</span>
                </div>
                <div className="h-2 rounded-full bg-neutralt-400/20 overflow-hidden">
                  <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${(sec / maxSubject) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-neutralt-400/20 flex items-center justify-between">
            <span className="text-xs text-neutralt-500 dark:text-neutralt-400">Avg session</span>
            <span className="text-sm font-bold">{fmtHM(avgSession)}</span>
          </div>
        </GlassCard>
      )}

      {/* Achievements */}
      <GlassCard className="p-5">
        <p className="font-display font-bold text-lg mb-3">Achievements</p>
        <div className="grid grid-cols-3 gap-3">
          {profile.achievements.map((a) => {
            const Icon = ACH_ICONS[a.icon] ?? Award;
            return (
              <div key={a.id} className={`rounded-2xl p-3 text-center transition-all ${a.unlocked ? 'glass-subtle' : 'bg-neutralt-400/10 opacity-50'}`}>
                <div className={`w-12 h-12 mx-auto rounded-2xl flex items-center justify-center mb-1.5 ${a.unlocked ? 'bg-accent/15 text-accent' : 'bg-neutralt-400/20 text-neutralt-400'}`}>
                  <Icon size={22} />
                </div>
                <p className="text-[11px] font-semibold leading-tight">{a.name}</p>
                <p className="text-[9px] text-neutralt-500 dark:text-neutralt-400 mt-0.5">{a.unlocked ? 'Unlocked' : `${a.progress}/${a.target}`}</p>
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
              onChange={(v: ThemeMode) => store.updateSettings({ theme: v })}
            />
          </div>
          <div>
            <p className="text-sm font-semibold mb-2">Daily Goal</p>
            <div className="grid grid-cols-4 gap-2">
              {DAILY_GOALS.map((g) => (
                <button key={g.min} onClick={() => store.updateSettings({ dailyGoalMin: g.min })} className={`py-3 rounded-2xl font-bold text-sm glass-press transition-all ${settings.dailyGoalMin === g.min ? 'bg-accent text-white shadow-glow' : 'glass-subtle'}`}>{g.label}</button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Notifications</p>
            <ToggleRow icon={Volume2} label="Sound" value={settings.soundEnabled} onChange={(v) => store.updateSettings({ soundEnabled: v })} />
            <ToggleRow icon={Vibrate} label="Vibration" value={settings.vibrationEnabled} onChange={(v) => store.updateSettings({ vibrationEnabled: v })} />
            <ToggleRow icon={Bell} label="Daily goal reminder" value={settings.dailyGoalReminder} onChange={(v) => store.updateSettings({ dailyGoalReminder: v })} />
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

function StatCard({ icon: Icon, label, value, accent = false }: { icon: any; label: string; value: string; accent?: boolean }) {
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

function ToggleRow({ icon: Icon, label, value, onChange }: { icon: any; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="w-full flex items-center justify-between glass-subtle rounded-2xl px-4 py-3 glass-press">
      <span className="flex items-center gap-2 text-sm font-medium"><Icon size={16} className="text-neutralt-500" />{label}</span>
      <span className={`w-10 h-6 rounded-full p-0.5 transition-colors ${value ? 'bg-accent' : 'bg-neutralt-400/40'}`}>
        <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
}
