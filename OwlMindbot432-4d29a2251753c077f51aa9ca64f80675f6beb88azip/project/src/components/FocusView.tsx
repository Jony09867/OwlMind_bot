import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Square, RotateCcw, Timer, Watch, Brain, ChevronDown, Check, Volume2, Vibrate, Bell } from 'lucide-react';
import { GlassCard, GlassButton, ProgressRing, SegmentedControl, Modal, Badge } from './ui';
import { store, useStore, useDailyStudySec, useWeeklyStudySec } from '../store';
import { fmtDuration, fmtHM, fmtClock, playChime } from '../hooks';
import { POMODORO_PRESETS, DAILY_GOALS, type SessionType, type PomodoroPhase } from '../types';
import { clearRoomFocus, setRoomFocusPaused, setRoomFocusRunning } from '../lib/roomFocus';

type Tab = SessionType;

export function FocusView() {
  const [tab, setTab] = useState<Tab>('pomodoro');
  const settings = useStore((s) => s.settings);
  const dailyGoal = settings.dailyGoalMin * 60;
  const dailySec = useDailyStudySec();
  const weekly = useWeeklyStudySec();
  const sessions = useStore((s) => s.sessions);
  const profile = useStore((s) => s.profile);
  const categories = useStore((s) => s.categories);

  const [subject, setSubject] = useState('Study');
  const [category, setCategory] = useState(categories[0]?.id ?? 'study');
  const [showSettings, setShowSettings] = useState(false);
  const [showSummary, setShowSummary] = useState<null | { xp: number; leveledUp: boolean; newAch: string[]; duration: number; pomodoros: number }>(null);

  const goalProgress = dailyGoal > 0 ? Math.min(dailySec / dailyGoal, 1) : 0;

  return (
    <div className="space-y-5 animate-fade-in pb-4">
      <header className="px-1">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Focus</h1>
        <p className="text-neutralt-500 dark:text-neutralt-400 text-sm mt-1">The heart of your study flow.</p>
      </header>

      <SegmentedControl
        options={[
          { value: 'pomodoro', label: 'Pomodoro', icon: Timer },
          { value: 'stopwatch', label: 'Stopwatch', icon: Watch },
          { value: 'deep', label: 'Deep Focus', icon: Brain },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'pomodoro' && (
        <PomodoroTimer
          subject={subject}
          category={category}
          onComplete={(duration, pomodoros, xp, leveledUp, newAch) => {
            setShowSummary({ xp, leveledUp, newAch, duration, pomodoros });
          }}
        />
      )}
      {tab === 'stopwatch' && (
        <StopwatchTimer
          subject={subject}
          category={category}
          onComplete={(duration, xp, leveledUp, newAch) => {
            setShowSummary({ xp, leveledUp, newAch, duration, pomodoros: 0 });
          }}
        />
      )}
      {tab === 'deep' && (
        <DeepFocusTimer
          subject={subject}
          category={category}
          onComplete={(duration, xp, leveledUp, newAch) => {
            setShowSummary({ xp, leveledUp, newAch, duration, pomodoros: 0 });
          }}
        />
      )}

      {/* Subject + category selector */}
      <GlassCard className="p-4">
        <p className="text-xs font-semibold text-neutralt-500 dark:text-neutralt-400 uppercase tracking-wide mb-3">Current session</p>
        <div className="flex gap-2">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="flex-1 glass-subtle rounded-xl px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="glass-subtle rounded-xl px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent appearance-none"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </GlassCard>

      {/* Daily goal */}
      <GlassCard strong className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-neutralt-500 dark:text-neutralt-400 uppercase tracking-wide">Daily Goal</p>
            <p className="font-display text-2xl font-bold mt-0.5">{fmtHM(dailySec)} <span className="text-neutralt-400 font-normal text-lg">/ {fmtHM(dailyGoal)}</span></p>
          </div>
          <button onClick={() => setShowSettings(true)} className="glass-subtle rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-1 glass-press">
            <ChevronDown size={14} /> Goal
          </button>
        </div>
        <div className="h-3 rounded-full bg-neutralt-400/20 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-accent-400 transition-all duration-700"
            style={{ width: `${goalProgress * 100}%` }}
          />
        </div>
        <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-2">
          {goalProgress >= 1 ? 'Goal complete! Bonus XP earned.' : `${Math.round(goalProgress * 100)}% there`}
        </p>
      </GlassCard>

      {/* Weekly chart */}
      <GlassCard className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-display font-bold text-lg">This Week</p>
          <Badge color="accent">{fmtHM(weekly.reduce((a, b) => a + b, 0))} total</Badge>
        </div>
        <div className="flex items-end justify-between gap-2 h-32">
          {weekly.map((sec, i) => {
            const max = Math.max(...weekly, 3600);
            const h = Math.max((sec / max) * 100, 4);
            const today = i === weekly.length - 1;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="w-full flex-1 flex items-end">
                  <div
                    className={`w-full rounded-t-lg transition-all duration-500 ${today ? 'bg-accent' : 'bg-accent/40'}`}
                    style={{ height: `${h}%` }}
                  />
                </div>
                <span className="text-[10px] text-neutralt-500 dark:text-neutralt-400 font-medium">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}
                </span>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Session history */}
      <GlassCard className="p-5">
        <p className="font-display font-bold text-lg mb-3">Session History</p>
        {sessions.length === 0 ? (
          <p className="text-sm text-neutralt-500 dark:text-neutralt-400 py-4 text-center">No sessions yet. Start your first focus session above.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-hide">
            {sessions.slice(-8).reverse().map((s) => (
              <div key={s.id} className="flex items-center justify-between glass-subtle rounded-xl px-3 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent-500 flex items-center justify-center shrink-0">
                    {s.type === 'pomodoro' ? <Timer size={16} /> : s.type === 'deep' ? <Brain size={16} /> : <Watch size={16} />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{s.subject}</p>
                    <p className="text-xs text-neutralt-500 dark:text-neutralt-400 truncate">
                      {new Date(s.startedAt).toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                      {s.scheduleBlockId && ` · Schedule · ${s.scheduleBlockTitle || 'Study block'}`}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">{fmtDuration(s.durationSec)}</p>
                  <p className="text-xs text-accent-500 font-semibold">+{s.xpEarned} XP</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Daily Goal & Timer Settings">
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold mb-2">Daily Goal</p>
            <div className="grid grid-cols-4 gap-2">
              {DAILY_GOALS.map((g) => (
                <button
                  key={g.min}
                  onClick={() => store.updateSettings({ dailyGoalMin: g.min })}
                  className={`py-3 rounded-2xl font-bold text-sm glass-press transition-all ${settings.dailyGoalMin === g.min ? 'bg-accent text-white shadow-glow' : 'glass-subtle'}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold mb-2">Pomodoro Presets</p>
            <div className="space-y-2">
              {POMODORO_PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => store.updateSettings({ pomodoroFocus: p.focus, pomodoroShort: p.short, pomodoroLong: p.long })}
                  className={`w-full flex items-center justify-between py-3 px-4 rounded-2xl font-semibold text-sm glass-press transition-all ${settings.pomodoroFocus === p.focus ? 'bg-accent text-white shadow-glow' : 'glass-subtle'}`}
                >
                  <span>{p.name}</span>
                  <span className="text-xs opacity-80">{p.focus}/{p.short} · long {p.long}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold mb-2">Custom Intervals (minutes)</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'pomodoroFocus', label: 'Focus' },
                { key: 'pomodoroShort', label: 'Short' },
                { key: 'pomodoroLong', label: 'Long' },
              ] as const).map((f) => (
                <label key={f.key} className="glass-subtle rounded-2xl p-3 text-center">
                  <span className="text-xs text-neutralt-500 dark:text-neutralt-400 block mb-1">{f.label}</span>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={settings[f.key]}
                    onChange={(e) => store.updateSettings({ [f.key]: Math.max(1, +e.target.value || 1) } as any)}
                    className="w-full bg-transparent text-center font-bold text-lg outline-none"
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Notifications</p>
            <ToggleRow icon={Volume2} label="Sound on session end" value={settings.soundEnabled} onChange={(v) => store.updateSettings({ soundEnabled: v })} />
            <ToggleRow icon={Vibrate} label="Vibration on session end" value={settings.vibrationEnabled} onChange={(v) => store.updateSettings({ vibrationEnabled: v })} />
            <ToggleRow icon={Bell} label="Daily goal reminder" value={settings.dailyGoalReminder} onChange={(v) => store.updateSettings({ dailyGoalReminder: v })} />
          </div>
        </div>
      </Modal>

      <Modal open={!!showSummary} onClose={() => setShowSummary(null)} title="Session Complete">
        {showSummary && (
          <div className="text-center space-y-4">
            <div className="mx-auto w-20 h-20 rounded-full bg-accent/15 flex items-center justify-center animate-scale-in">
              <Check size={40} className="text-accent" />
            </div>
            <div>
              <p className="font-display text-2xl font-bold">{fmtDuration(showSummary.duration)}</p>
              <p className="text-sm text-neutralt-500 dark:text-neutralt-400">{showSummary.pomodoros > 0 && `${showSummary.pomodoros} pomodoros · `}{showSummary.xp} XP earned</p>
            </div>
            {showSummary.leveledUp && (
              <Badge color="accent" className="text-sm py-1">Level Up! +20 coins</Badge>
            )}
            {showSummary.newAch.length > 0 && (
              <div className="space-y-1">
                {showSummary.newAch.map((id) => {
                  const a = profile.achievements.find((x) => x.id === id);
                  return a ? <Badge key={id} color="amber" className="text-sm py-1">Achievement: {a.name}</Badge> : null;
                })}
              </div>
            )}
            <GlassButton className="w-full" onClick={() => setShowSummary(null)}>Continue</GlassButton>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ToggleRow({ icon: Icon, label, value, onChange }: { icon: any; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="w-full flex items-center justify-between glass-subtle rounded-2xl px-4 py-3 glass-press">
      <span className="flex items-center gap-2 text-sm font-medium">
        <Icon size={16} className="text-neutralt-500" />
        {label}
      </span>
      <span className={`w-10 h-6 rounded-full p-0.5 transition-colors ${value ? 'bg-accent' : 'bg-neutralt-400/40'}`}>
        <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
}

function useTimerEngine(opts: {
  durationSec: number | null;
  onComplete: (elapsed: number) => void;
  autoStop?: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const elapsedBaseRef = useRef(0);

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now();
    const tick = () => {
      const now = Date.now();
      const total = elapsedBaseRef.current + (now - (startRef.current ?? now)) / 1000;
      setElapsed(total);
      if (opts.durationSec && total >= opts.durationSec) {
        stop();
        opts.onComplete(total);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const start = () => {
    elapsedBaseRef.current = elapsed;
    setRunning(true);
  };
  const pause = () => {
    setRunning(false);
    elapsedBaseRef.current = elapsed;
  };
  const stop = () => {
    setRunning(false);
  };
  const reset = () => {
    setRunning(false);
    setElapsed(0);
    elapsedBaseRef.current = 0;
  };

  return { running, elapsed, start, pause, stop, reset, setElapsed };
}

function PomodoroTimer({ subject, category, onComplete }: { subject: string; category: string; onComplete: (duration: number, pomodoros: number, xp: number, leveledUp: boolean, newAch: string[]) => void }) {
  const settings = useStore((s) => s.settings);
  const [phase, setPhase] = useState<PomodoroPhase>('focus');
  const [pomodoroCount, setPomodoroCount] = useState(0);
  const [completedDuration, setCompletedDuration] = useState(0);
  const joinedRoomId = useStore((s) => s.joinedRoomId);

  const phaseDuration = phase === 'focus' ? settings.pomodoroFocus * 60 : phase === 'short' ? settings.pomodoroShort * 60 : settings.pomodoroLong * 60;

  const engine = useTimerEngine({
    durationSec: phaseDuration,
    onComplete: () => {
      const dur = phaseDuration;
      setCompletedDuration((c) => c + dur);
      playChime(settings.soundEnabled, settings.vibrationEnabled);
      if (joinedRoomId) void clearRoomFocus(joinedRoomId, subject);
      if (phase === 'focus') {
        const newCount = pomodoroCount + 1;
        setPomodoroCount(newCount);
        const isLong = newCount % 4 === 0;
        setPhase(isLong ? 'long' : 'short');
      } else {
        setPhase('focus');
      }
      engine.reset();
    },
  });

  useEffect(() => {
    if (!joinedRoomId) return;
    if (engine.running) {
      if (phase === 'focus') void setRoomFocusRunning(joinedRoomId, subject, 'pomodoro', engine.elapsed);
      else void setRoomFocusPaused(joinedRoomId, subject, 'pomodoro', 0);
    } else if (engine.elapsed > 0) {
      void setRoomFocusPaused(joinedRoomId, subject, 'pomodoro', phase === 'focus' ? engine.elapsed : 0);
    }
    // Only resync when the active room changes; timer ticks must stay local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedRoomId]);

  useEffect(() => () => {
    if (joinedRoomId) void clearRoomFocus(joinedRoomId, subject);
    // Clear stale live state if this timer mode is unmounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedRoomId]);

  const startTimer = () => {
    engine.start();
    if (!joinedRoomId) return;
    if (phase === 'focus') {
      void setRoomFocusRunning(joinedRoomId, subject, 'pomodoro', engine.elapsed);
    } else {
      void setRoomFocusPaused(joinedRoomId, subject, 'pomodoro', 0);
    }
  };

  const pauseTimer = () => {
    engine.pause();
    if (!joinedRoomId) return;
    if (phase === 'focus') {
      void setRoomFocusPaused(joinedRoomId, subject, 'pomodoro', engine.elapsed);
    } else {
      void setRoomFocusPaused(joinedRoomId, subject, 'pomodoro', 0);
    }
  };

  const resetTimer = () => {
    engine.reset();
    store.cancelScheduleFocus();
    if (joinedRoomId) void clearRoomFocus(joinedRoomId, subject);
  };

  const handleEnd = () => {
    if (completedDuration > 0 || engine.elapsed > 10) {
      const total = completedDuration + Math.floor(engine.elapsed);
      const result = store.completeSession({
        type: 'pomodoro',
        subject,
        category,
        durationSec: total,
        pomodoroCount,
        roomId: joinedRoomId,
      });
      onComplete(total, pomodoroCount, result.xpEarned, result.leveledUp, result.newAchievements);
      if (joinedRoomId) store.updateRoomMemberStudy(subject, total);
    } else {
      store.cancelScheduleFocus();
    }
    if (joinedRoomId) void clearRoomFocus(joinedRoomId, subject);
    setCompletedDuration(0);
    setPomodoroCount(0);
    setPhase('focus');
    engine.reset();
  };

  const progress = engine.elapsed / phaseDuration;
  const remaining = Math.max(phaseDuration - engine.elapsed, 0);

  return (
    <GlassCard strong className="p-6 animate-scale-in">
      <div className="flex justify-center mb-4">
        <Badge color={phase === 'focus' ? 'accent' : 'blue'}>
          {phase === 'focus' ? 'Focus' : phase === 'short' ? 'Short Break' : 'Long Break'}
        </Badge>
      </div>
      <div className="flex justify-center">
        <ProgressRing progress={phase === 'focus' ? progress : 1 - progress} size={220} stroke={14} color={phase === 'focus' ? '#f54d1c' : '#3b82f6'}>
          <div className="text-center">
            <p className="font-display text-5xl font-extrabold tabular-nums">{fmtClock(remaining)}</p>
            <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1">Pomodoro #{pomodoroCount + 1}</p>
          </div>
        </ProgressRing>
      </div>
      {pomodoroCount > 0 && (
        <div className="flex justify-center gap-1.5 mt-4">
          {Array.from({ length: Math.min(pomodoroCount, 8) }).map((_, i) => (
            <div key={i} className="w-2.5 h-2.5 rounded-full bg-accent" />
          ))}
        </div>
      )}
      <div className="flex items-center justify-center gap-3 mt-6">
        {!engine.running ? (
          <GlassButton size="lg" icon={Play} onClick={startTimer}>Start</GlassButton>
        ) : (
          <GlassButton size="lg" variant="ghost" icon={Pause} onClick={pauseTimer}>Pause</GlassButton>
        )}
        <GlassButton size="lg" variant="neutral" icon={RotateCcw} onClick={resetTimer}>Reset</GlassButton>
        <GlassButton size="lg" variant="danger" icon={Square} onClick={handleEnd}>End</GlassButton>
      </div>
      {completedDuration > 0 && (
        <p className="text-center text-xs text-neutralt-500 dark:text-neutralt-400 mt-3">
          Completed: {fmtDuration(completedDuration)} · {pomodoroCount} pomodoros
        </p>
      )}
    </GlassCard>
  );
}

function StopwatchTimer({ subject, category, onComplete }: { subject: string; category: string; onComplete: (duration: number, xp: number, leveledUp: boolean, newAch: string[]) => void }) {
  const joinedRoomId = useStore((s) => s.joinedRoomId);
  const engine = useTimerEngine({ durationSec: null, onComplete: () => {} });

  useEffect(() => {
    if (!joinedRoomId) return;
    if (engine.running) void setRoomFocusRunning(joinedRoomId, subject, 'stopwatch', engine.elapsed);
    else if (engine.elapsed > 0) void setRoomFocusPaused(joinedRoomId, subject, 'stopwatch', engine.elapsed);
    // Only resync when the active room changes; timer ticks must stay local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedRoomId]);

  useEffect(() => () => {
    if (joinedRoomId) void clearRoomFocus(joinedRoomId, subject);
    // Clear stale live state if this timer mode is unmounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedRoomId]);

  const startTimer = () => {
    engine.start();
    if (joinedRoomId) void setRoomFocusRunning(joinedRoomId, subject, 'stopwatch', engine.elapsed);
  };

  const pauseTimer = () => {
    engine.pause();
    if (joinedRoomId) void setRoomFocusPaused(joinedRoomId, subject, 'stopwatch', engine.elapsed);
  };

  const resetTimer = () => {
    engine.reset();
    store.cancelScheduleFocus();
    if (joinedRoomId) void clearRoomFocus(joinedRoomId, subject);
  };

  const handleEnd = () => {
    const total = Math.floor(engine.elapsed);
    if (total < 10) {
      resetTimer();
      return;
    }
    const result = store.completeSession({ type: 'stopwatch', subject, category, durationSec: total, pomodoroCount: 0, roomId: joinedRoomId });
    onComplete(total, result.xpEarned, result.leveledUp, result.newAchievements);
    if (joinedRoomId) {
      store.updateRoomMemberStudy(subject, total);
      void clearRoomFocus(joinedRoomId, subject);
    }
    engine.reset();
  };

  return (
    <GlassCard strong className="p-6 animate-scale-in">
      <div className="flex justify-center mb-4">
        <Badge color="green">Stopwatch</Badge>
      </div>
      <div className="flex justify-center">
        <div className="text-center py-8">
          <p className="font-display text-6xl font-extrabold tabular-nums">{fmtDuration(engine.elapsed)}</p>
          <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-2">Free-flow study time</p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-3 mt-6">
        {!engine.running ? (
          <GlassButton size="lg" icon={Play} onClick={startTimer}>Start</GlassButton>
        ) : (
          <GlassButton size="lg" variant="ghost" icon={Pause} onClick={pauseTimer}>Pause</GlassButton>
        )}
        <GlassButton size="lg" variant="neutral" icon={RotateCcw} onClick={resetTimer}>Reset</GlassButton>
        <GlassButton size="lg" variant="danger" icon={Square} onClick={handleEnd}>Save</GlassButton>
      </div>
    </GlassCard>
  );
}

function DeepFocusTimer({ subject, category, onComplete }: { subject: string; category: string; onComplete: (duration: number, xp: number, leveledUp: boolean, newAch: string[]) => void }) {
  const settings = useStore((s) => s.settings);
  const joinedRoomId = useStore((s) => s.joinedRoomId);
  const [targetMin, setTargetMin] = useState(90);
  const engine = useTimerEngine({
    durationSec: targetMin * 60,
    onComplete: (elapsed) => {
      const total = Math.floor(elapsed);
      playChime(settings.soundEnabled, settings.vibrationEnabled);
      const result = store.completeSession({ type: 'deep', subject, category, durationSec: total, pomodoroCount: 0, roomId: joinedRoomId });
      onComplete(total, result.xpEarned, result.leveledUp, result.newAchievements);
      if (joinedRoomId) {
        store.updateRoomMemberStudy(subject, total);
        void clearRoomFocus(joinedRoomId, subject);
      }
      engine.reset();
    },
  });

  useEffect(() => {
    if (!joinedRoomId) return;
    if (engine.running) void setRoomFocusRunning(joinedRoomId, subject, 'deep', engine.elapsed);
    else if (engine.elapsed > 0) void setRoomFocusPaused(joinedRoomId, subject, 'deep', engine.elapsed);
    // Only resync when the active room changes; timer ticks must stay local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedRoomId]);

  useEffect(() => () => {
    if (joinedRoomId) void clearRoomFocus(joinedRoomId, subject);
    // Clear stale live state if this timer mode is unmounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedRoomId]);

  const startTimer = () => {
    engine.start();
    if (joinedRoomId) void setRoomFocusRunning(joinedRoomId, subject, 'deep', engine.elapsed);
  };

  const pauseTimer = () => {
    engine.pause();
    if (joinedRoomId) void setRoomFocusPaused(joinedRoomId, subject, 'deep', engine.elapsed);
  };

  const resetTimer = () => {
    engine.reset();
    store.cancelScheduleFocus();
    if (joinedRoomId) void clearRoomFocus(joinedRoomId, subject);
  };

  const resetForTargetChange = () => {
    engine.reset();
    if (joinedRoomId) void clearRoomFocus(joinedRoomId, subject);
  };

  const progress = engine.elapsed / (targetMin * 60);
  const remaining = Math.max(targetMin * 60 - engine.elapsed, 0);

  return (
    <GlassCard strong className="p-6 animate-scale-in">
      <div className="flex justify-center mb-4">
        <Badge color="purple">Deep Focus</Badge>
      </div>
      <div className="flex justify-center">
        <ProgressRing progress={progress} size={220} stroke={14} color="#a855f7">
          <div className="text-center">
            <p className="font-display text-5xl font-extrabold tabular-nums">{fmtClock(remaining)}</p>
            <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1">No interruptions</p>
          </div>
        </ProgressRing>
      </div>
      <div className="flex justify-center gap-2 mt-4">
        {[60, 90, 120, 180].map((m) => (
          <button
            key={m}
            onClick={() => {
              setTargetMin(m);
              resetForTargetChange();
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold glass-press transition-all ${targetMin === m ? 'bg-accent text-white' : 'glass-subtle'}`}
          >
            {m}m
          </button>
        ))}
      </div>
      <div className="flex items-center justify-center gap-3 mt-6">
        {!engine.running ? (
          <GlassButton size="lg" icon={Play} onClick={startTimer}>Start</GlassButton>
        ) : (
          <GlassButton size="lg" variant="ghost" icon={Pause} onClick={pauseTimer}>Pause</GlassButton>
        )}
        <GlassButton size="lg" variant="neutral" icon={RotateCcw} onClick={resetTimer}>Reset</GlassButton>
        <GlassButton size="lg" variant="danger" icon={Square} onClick={() => {
          const total = Math.floor(engine.elapsed);
          if (total < 10) {
            resetTimer();
            return;
          }
          const result = store.completeSession({ type: 'deep', subject, category, durationSec: total, pomodoroCount: 0, roomId: joinedRoomId });
          onComplete(total, result.xpEarned, result.leveledUp, result.newAchievements);
          if (joinedRoomId) {
            store.updateRoomMemberStudy(subject, total);
            void clearRoomFocus(joinedRoomId, subject);
          }
          engine.reset();
        }}>Save</GlassButton>
      </div>
    </GlassCard>
  );
}
