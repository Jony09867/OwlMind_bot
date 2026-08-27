import { useEffect, useState } from 'react';
import { Timer, ListTodo, Calendar, Users, Trophy, User, Flame } from 'lucide-react';
import { FocusView } from './components/FocusView';
import { TasksView } from './components/TasksView';
import { ScheduleView } from './components/ScheduleView';
import { RoomsSearchView } from './components/RoomsSearchView';
import { RankingsView } from './components/RankingsView';
import { ProfileView } from './components/ProfileView';
import { TimerWidget } from './components/TimerWidget';
import { OnboardingModal } from './components/OnboardingModal';
import { useTheme } from './hooks';
import { store, useStore } from './store';
import { getTelegramStartParam, getTelegramUser, initTelegram } from './telegram';
import { isSupabaseConfigured, loadUserStudyData, syncLocalFocusSessions, syncUserStudyStats, upsertTelegramUser } from './lib/supabase';

type Tab = 'focus' | 'tasks' | 'schedule' | 'rooms' | 'rankings' | 'profile';

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'focus', label: 'Focus', icon: Timer },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'rooms', label: 'Rooms', icon: Users },
  { id: 'rankings', label: 'Ranks', icon: Trophy },
  { id: 'profile', label: 'Profile', icon: User },
];

export default function App() {
  useTheme();
  initTelegram();
  useEffect(() => {
    const telegramUser = getTelegramUser();
    if (!telegramUser || !isSupabaseConfigured) return;

    let cancelled = false;
    const hydrateStudyData = async () => {
      const { error: userError } = await upsertTelegramUser(telegramUser);
      if (userError) {
        console.error('Failed to sync Telegram user', userError.message);
        return;
      }

      const local = store.get();
      const { error: sessionSyncError } = await syncLocalFocusSessions(telegramUser.id, local.sessions);
      if (sessionSyncError) console.error('Failed to sync local focus sessions', sessionSyncError.message);

      const { error: statsSyncError } = await syncUserStudyStats(
        telegramUser,
        local.profile.totalStudySec,
        local.profile.totalSessions,
        local.profile.level,
      );
      if (statsSyncError) console.error('Failed to preserve study totals', statsSyncError.message);

      const cloud = await loadUserStudyData(telegramUser.id);
      if (cloud.error) {
        console.error('Failed to load cloud study data', cloud.error.message);
        return;
      }
      if (!cancelled) store.hydrateStudyData(cloud.sessions, cloud.stats);
    };

    hydrateStudyData();
    return () => { cancelled = true; };
  }, []);
  const [tab, setTab] = useState<Tab>(() => {
    const joinParam = new URLSearchParams(window.location.search).get('join');
    const startParam = getTelegramStartParam();
    return joinParam || startParam?.startsWith('room_') ? 'rooms' : 'focus';
  });
  const streak = useStore((s) => s.profile.currentStreak);

  const startFocusFromBlock = (blockId: string) => {
    store.beginScheduleFocus(blockId);
    setTab('focus');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Ambient gradient background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute top-1/3 -left-40 w-80 h-80 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-72 h-72 rounded-full bg-accent/5 blur-3xl" />
      </div>

      {/* Streak banner */}
      {streak > 0 && (
        <div className="fixed top-3 right-3 z-30 glass rounded-full px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold shadow-glass-sm">
          <Flame size={14} className="text-accent" />
          <span>{streak}</span>
        </div>
      )}

      {/* Onboarding */}
      <OnboardingModal />

      {/* Floating timer widget */}
      <TimerWidget />

      {/* Main content */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 pt-6 pb-28">
        <div className={tab === 'focus' ? 'block' : 'hidden'} aria-hidden={tab !== 'focus'}>
          <FocusView />
        </div>
        {tab === 'tasks' && <TasksView />}
        {tab === 'schedule' && <ScheduleView onStartFocus={startFocusFromBlock} />}
        <div className={tab === 'rooms' ? 'block' : 'hidden'} aria-hidden={tab !== 'rooms'}>
          <RoomsSearchView />
        </div>
        {tab === 'rankings' && <RankingsView />}
        {tab === 'profile' && <ProfileView />}
      </main>

      {/* Bottom tab bar — liquid glass */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-4 pt-2">
        <div className="max-w-2xl mx-auto">
          <div className="glass-strong rounded-3xl px-2 py-2 flex items-center justify-between shadow-glass-lg">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="relative flex flex-col items-center justify-center gap-0.5 flex-1 py-2 rounded-2xl glass-press transition-all"
                >
                  <div className={`relative w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${active ? 'bg-accent text-white shadow-glow scale-105' : 'text-neutralt-500 dark:text-neutralt-400'}`}>
                    <t.icon size={20} />
                  </div>
                  <span className={`text-[10px] font-semibold transition-colors ${active ? 'text-accent' : 'text-neutralt-500 dark:text-neutralt-400'}`}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
