import { useState } from 'react';
import { Plus, Check, Trash2, Flag, Calendar, Repeat, Inbox } from 'lucide-react';
import { GlassCard, GlassButton, Badge, Modal, EmptyState, SegmentedControl } from './ui';
import { store, useStore } from '../store';
import type { Priority, Task } from '../types';

type FilterTab = 'today' | 'upcoming' | 'done' | 'all';

export function TasksView() {
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const [tab, setTab] = useState<FilterTab>('today');
  const [showAdd, setShowAdd] = useState(false);
  const [filterCat, setFilterCat] = useState<string>('all');

  const today = new Date().toISOString().slice(0, 10);

  const filtered = tasks.filter((t) => {
    if (filterCat !== 'all' && t.category !== filterCat) return false;
    if (tab === 'today') return !t.done && t.deadline === today;
    if (tab === 'upcoming') return !t.done && t.deadline && t.deadline !== today;
    if (tab === 'done') return t.done;
    return true;
  });

  const grouped: Record<string, Task[]> = {};
  filtered.forEach((t) => {
    const key = t.deadline ?? 'No date';
    (grouped[key] ??= []).push(t);
  });

  return (
    <div className="space-y-5 animate-fade-in pb-4">
      <header className="flex items-center justify-between px-1">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Tasks</h1>
          <p className="text-neutralt-500 dark:text-neutralt-400 text-sm mt-1">{tasks.filter((t) => !t.done).length} open</p>
        </div>
        <GlassButton icon={Plus} onClick={() => setShowAdd(true)}>Add</GlassButton>
      </header>

      <SegmentedControl
        options={[
          { value: 'today', label: 'Today' },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'done', label: 'Done' },
          { value: 'all', label: 'All' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        <button
          onClick={() => setFilterCat('all')}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold glass-press transition-all ${filterCat === 'all' ? 'bg-accent text-white' : 'glass-subtle'}`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilterCat(c.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold glass-press transition-all flex items-center gap-1.5 ${filterCat === c.id ? 'bg-accent text-white' : 'glass-subtle'}`}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: c.color }} />
            {c.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={tab === 'done' ? Check : Inbox} title={tab === 'done' ? 'No completed tasks yet' : 'No tasks here'} subtitle="Tap Add to create your first task." />
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <p className="text-xs font-semibold text-neutralt-500 dark:text-neutralt-400 uppercase tracking-wide mb-2 px-1">
                {date === today ? 'Today' : date === 'No date' ? 'No deadline' : new Date(date).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
              <div className="space-y-2">
                {items.map((t) => (
                  <TaskRow key={t.id} task={t} categoryName={categories.find((c) => c.id === t.category)?.name ?? t.category} categoryColor={categories.find((c) => c.id === t.category)?.color ?? '#c8c8c8'} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AddTaskModal open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}

function TaskRow({ task, categoryName, categoryColor }: { task: Task; categoryName: string; categoryColor: string }) {
  const priorityColors: Record<Priority, 'red' | 'amber' | 'neutral'> = { high: 'red', medium: 'amber', low: 'neutral' };
  return (
    <GlassCard className="p-3.5 flex items-center gap-3 glass-press" >
      <button
        onClick={() => store.toggleTask(task.id)}
        className={`shrink-0 w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all ${
          task.done ? 'bg-accent border-accent text-white' : 'border-neutralt-400/50 hover:border-accent'
        }`}
      >
        {task.done && <Check size={16} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm truncate ${task.done ? 'line-through text-neutralt-400' : ''}`}>{task.title}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs text-neutralt-500 dark:text-neutralt-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: categoryColor }} />
            {task.subject} · {categoryName}
          </span>
          {task.priority !== 'low' && <Badge color={priorityColors[task.priority]}><Flag size={10} /> {task.priority}</Badge>}
          {task.repeat !== 'none' && <Badge color="blue"><Repeat size={10} /> {task.repeat}</Badge>}
        </div>
      </div>
      <button onClick={() => store.deleteTask(task.id)} className="shrink-0 p-2 text-neutralt-400 hover:text-red-500 transition-colors">
        <Trash2 size={16} />
      </button>
    </GlassCard>
  );
}

function AddTaskModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const categories = useStore((s) => s.categories);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState(categories[0]?.id ?? 'study');
  const [priority, setPriority] = useState<Priority>('medium');
  const [deadline, setDeadline] = useState('');
  const [repeat, setRepeat] = useState<'none' | 'daily' | 'weekly'>('none');

  const submit = () => {
    if (!title.trim()) return;
    store.addTask({
      title: title.trim(),
      subject: subject.trim() || 'General',
      category,
      priority,
      deadline: deadline || null,
      repeat,
    });
    setTitle(''); setSubject(''); setDeadline(''); setRepeat('none'); setPriority('medium');
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="New Task">
      <div className="space-y-4">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you need to do?"
          className="w-full glass-subtle rounded-2xl px-4 py-3 font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <div className="grid grid-cols-2 gap-3">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="glass-subtle rounded-2xl px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="glass-subtle rounded-2xl px-3 py-2.5 text-sm font-medium outline-none bg-transparent appearance-none">
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs font-semibold text-neutralt-500 dark:text-neutralt-400 mb-2">Priority</p>
          <div className="grid grid-cols-3 gap-2">
            {(['low', 'medium', 'high'] as Priority[]).map((p) => (
              <button key={p} onClick={() => setPriority(p)} className={`py-2.5 rounded-xl text-sm font-bold capitalize glass-press transition-all ${priority === p ? 'bg-accent text-white' : 'glass-subtle'}`}>{p}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="glass-subtle rounded-2xl px-3 py-2.5">
            <span className="text-xs text-neutralt-500 dark:text-neutralt-400 flex items-center gap-1 mb-1"><Calendar size={12} /> Deadline</span>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full bg-transparent text-sm font-medium outline-none" />
          </label>
          <label className="glass-subtle rounded-2xl px-3 py-2.5">
            <span className="text-xs text-neutralt-500 dark:text-neutralt-400 flex items-center gap-1 mb-1"><Repeat size={12} /> Repeat</span>
            <select value={repeat} onChange={(e) => setRepeat(e.target.value as any)} className="w-full bg-transparent text-sm font-medium outline-none appearance-none">
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>
        </div>
        <GlassButton className="w-full" onClick={submit} disabled={!title.trim()}>Create Task</GlassButton>
      </div>
    </Modal>
  );
}
