import { useEffect, useState } from 'react';
import { Play, Pause, Square, RotateCcw, Timer as TimerIcon, ChevronUp, ChevronDown } from 'lucide-react';
import { store, useStore } from '../store';
import { fmtDuration } from '../hooks';
import { hapticImpact } from '../telegram';

export function TimerWidget() {
  const timer = useStore((s) => s.timer);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!timer?.isRunning) return;
    const id = setInterval(() => store.tickTimer(), 1000);
    return () => clearInterval(id);
  }, [timer?.isRunning]);

  if (!timer) return null;

  const handlePause = () => { hapticImpact('light'); store.pauseTimer(); };
  const handleResume = () => { hapticImpact('light'); store.resumeTimer(); };
  const handleEnd = () => { hapticImpact('medium'); store.endTimer(); };
  const handleReset = () => { hapticImpact('light'); store.resetTimer(); };

  return (
    <div className="fixed bottom-24 left-4 right-4 z-40 max-w-2xl mx-auto animate-slide-up">
      <div className="glass-strong rounded-3xl shadow-glass-lg overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-3 glass-press"
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${timer.isRunning ? 'bg-accent text-white' : 'bg-accent/15 text-accent'}`}>
              <TimerIcon size={18} />
            </div>
            <div className="text-left">
              <p className="text-xs text-neutralt-500 dark:text-neutralt-400 leading-none">{timer.subject}</p>
              <p className="font-display font-bold text-lg tabular-nums leading-tight">{fmtDuration(timer.elapsedSec)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${timer.isRunning ? 'bg-green-500/15 text-green-600' : 'bg-amber-500/15 text-amber-600'}`}>
              {timer.isRunning ? 'Running' : 'Paused'}
            </span>
            {expanded ? <ChevronDown size={16} className="text-neutralt-400" /> : <ChevronUp size={16} className="text-neutralt-400" />}
          </div>
        </button>

        {expanded && (
          <div className="px-4 pb-4 pt-1 flex gap-2 animate-fade-in">
            {timer.isRunning ? (
              <button onClick={handlePause} className="flex-1 glass-subtle rounded-2xl py-2.5 flex items-center justify-center gap-2 text-sm font-semibold glass-press">
                <Pause size={16} /> Pause
              </button>
            ) : (
              <button onClick={handleResume} className="flex-1 bg-accent text-white rounded-2xl py-2.5 flex items-center justify-center gap-2 text-sm font-semibold glass-press">
                <Play size={16} /> Resume
              </button>
            )}
            <button onClick={handleReset} className="glass-subtle rounded-2xl py-2.5 px-4 flex items-center justify-center gap-2 text-sm font-semibold glass-press">
              <RotateCcw size={16} />
            </button>
            <button onClick={handleEnd} className="bg-red-500 text-white rounded-2xl py-2.5 px-4 flex items-center justify-center gap-2 text-sm font-semibold glass-press">
              <Square size={16} /> End
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
