import { useState } from 'react';
import { Plus, Play, Bell, Trash2, Clock, Calendar } from 'lucide-react';
import { GlassCard, GlassButton, Badge, Modal, EmptyState } from './ui';
import { store, useStore } from '../store';
import { fmtMin } from '../hooks';
import type { StudyBlock } from '../types';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ScheduleView({ onStartFocus }: { onStartFocus: (subject: string) => void }) {
  const blocks = useStore((s) => s.blocks);
  const [showAdd, setShowAdd] = useState(false);

  const todayIdx = (new Date().getDay() + 6) % 7;

  const byDay: Record<number, StudyBlock[]> = {};
  blocks.forEach((b) => (byDay[b.day] ??= []).push(b));
  Object.values(byDay).forEach((arr) => arr.sort((a, b) => a.startMin - b.startMin));

  return (
    <div className="space-y-5 animate-fade-in pb-4">
      <header className="flex items-center justify-between px-1">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Schedule</h1>
          <p className="text-neutralt-500 dark:text-neutralt-400 text-sm mt-1">{blocks.length} study blocks</p>
        </div>
        <GlassButton icon={Plus} onClick={() => setShowAdd(true)}>Add</GlassButton>
      </header>

      <GlassCard strong className="p-4">
        <div className="grid grid-cols-7 gap-2">
          {DAYS.map((d, i) => {
            const isToday = i === todayIdx;
            const count = (byDay[i] ?? []).length;
            return (
              <div key={d} className={`flex flex-col items-center py-2 rounded-2xl transition-all ${isToday ? 'bg-accent text-white' : 'glass-subtle'}`}>
                <span className="text-xs font-semibold">{d}</span>
                <span className="text-lg font-bold mt-0.5">{count}</span>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {blocks.length === 0 ? (
        <EmptyState icon={Calendar} title="No study blocks yet" subtitle="Plan your week with timed study blocks." />
      ) : (
        <div className="space-y-5">
          {DAYS.map((d, i) => {
            const dayBlocks = byDay[i] ?? [];
            if (dayBlocks.length === 0) return null;
            return (
              <div key={d}>
                <p className="text-xs font-semibold text-neutralt-500 dark:text-neutralt-400 uppercase tracking-wide mb-2 px-1 flex items-center gap-2">
                  {d} {i === todayIdx && <Badge color="accent">Today</Badge>}
                </p>
                <div className="space-y-2">
                  {dayBlocks.map((b) => (
                    <BlockRow key={b.id} block={b} onStart={() => onStartFocus(b.subject)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddBlockModal open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}

function BlockRow({ block, onStart }: { block: StudyBlock; onStart: () => void }) {
  return (
    <GlassCard className="p-3.5 flex items-center gap-3">
      <div className="shrink-0 w-1 h-12 rounded-full bg-accent" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{block.title}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs text-neutralt-500 dark:text-neutralt-400 flex items-center gap-1">
            <Clock size={11} /> {fmtMin(block.startMin)} – {fmtMin(block.endMin)}
          </span>
          <Badge color="neutral">{block.subject}</Badge>
          {block.reminder && <Badge color="amber"><Bell size={10} /> Reminder</Badge>}
        </div>
      </div>
      <button onClick={onStart} className="shrink-0 w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center glass-press liquid-shine">
        <Play size={16} />
      </button>
      <button onClick={() => store.deleteBlock(block.id)} className="shrink-0 p-2 text-neutralt-400 hover:text-red-500">
        <Trash2 size={15} />
      </button>
    </GlassCard>
  );
}

function AddBlockModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [day, setDay] = useState(0);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [reminder, setReminder] = useState(true);

  const submit = () => {
    if (!title.trim()) return;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    store.addBlock({
      title: title.trim(),
      subject: subject.trim() || 'Study',
      day,
      startMin: sh * 60 + sm,
      endMin: eh * 60 + em,
      reminder,
    });
    setTitle(''); setSubject(''); setStart('09:00'); setEnd('10:00');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="New Study Block">
      <div className="space-y-4">
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Block title" className="w-full glass-subtle rounded-2xl px-4 py-3 font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent" />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full glass-subtle rounded-2xl px-4 py-3 font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent" />
        <div>
          <p className="text-xs font-semibold text-neutralt-500 dark:text-neutralt-400 mb-2">Day</p>
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map((d, i) => (
              <button key={d} onClick={() => setDay(i)} className={`py-2 rounded-lg text-xs font-bold glass-press ${day === i ? 'bg-accent text-white' : 'glass-subtle'}`}>{d}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="glass-subtle rounded-2xl px-3 py-2.5">
            <span className="text-xs text-neutralt-500 dark:text-neutralt-400 block mb-1">Start</span>
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="w-full bg-transparent font-medium outline-none" />
          </label>
          <label className="glass-subtle rounded-2xl px-3 py-2.5">
            <span className="text-xs text-neutralt-500 dark:text-neutralt-400 block mb-1">End</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full bg-transparent font-medium outline-none" />
          </label>
        </div>
        <button onClick={() => setReminder(!reminder)} className="w-full flex items-center justify-between glass-subtle rounded-2xl px-4 py-3 glass-press">
          <span className="flex items-center gap-2 text-sm font-medium"><Bell size={16} className="text-neutralt-500" /> Reminder</span>
          <span className={`w-10 h-6 rounded-full p-0.5 transition-colors ${reminder ? 'bg-accent' : 'bg-neutralt-400/40'}`}>
            <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${reminder ? 'translate-x-4' : ''}`} />
          </span>
        </button>
        <GlassButton className="w-full" onClick={submit} disabled={!title.trim()}>Add Block</GlassButton>
      </div>
    </Modal>
  );
}
