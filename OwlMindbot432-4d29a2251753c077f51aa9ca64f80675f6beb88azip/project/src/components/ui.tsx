import { type ReactNode, type ButtonHTMLAttributes } from 'react';
import { type LucideIcon } from 'lucide-react';

export function GlassCard({
  children,
  className = '',
  strong = false,
  subtle = false,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  subtle?: boolean;
  onClick?: () => void;
}) {
  const base = strong ? 'glass-strong' : subtle ? 'glass-subtle' : 'glass';
  return (
    <div
      onClick={onClick}
      className={`${base} rounded-3xl ${onClick ? 'glass-press cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  children?: ReactNode;
};

export function GlassButton({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const sizes = {
    sm: 'px-3 py-1.5 text-sm rounded-xl',
    md: 'px-4 py-2.5 text-sm rounded-2xl',
    lg: 'px-6 py-3.5 text-base rounded-2xl',
  };
  const variants = {
    primary: 'bg-accent text-white shadow-glow liquid-shine hover:bg-accent-600',
    ghost: 'glass text-ink dark:text-neutralt-100 hover:bg-white/80 dark:hover:bg-white/10',
    danger: 'bg-red-500 text-white hover:bg-red-600 liquid-shine',
    neutral: 'glass-subtle text-ink dark:text-neutralt-100 hover:bg-white/60 dark:hover:bg-white/10',
  };
  return (
    <button
      className={`glass-press font-semibold inline-flex items-center justify-center gap-2 transition-all ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {Icon && <Icon size={size === 'lg' ? 20 : 16} />}
      {children}
    </button>
  );
}

export function Badge({
  children,
  color = 'accent',
  className = '',
}: {
  children: ReactNode;
  color?: 'accent' | 'blue' | 'green' | 'purple' | 'neutral' | 'red' | 'amber';
  className?: string;
}) {
  const colors: Record<string, string> = {
    accent: 'bg-accent/15 text-accent-600 dark:text-accent-300',
    blue: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
    green: 'bg-green-500/15 text-green-600 dark:text-green-300',
    purple: 'bg-purple-500/15 text-purple-600 dark:text-purple-300',
    neutral: 'bg-neutralt-400/20 text-neutralt-700 dark:text-neutralt-300',
    red: 'bg-red-500/15 text-red-600 dark:text-red-300',
    amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[color]} ${className}`}>
      {children}
    </span>
  );
}

export function ProgressRing({
  progress,
  size = 120,
  stroke = 10,
  color = '#f54d1c',
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - progress * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-neutralt-400/30" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-strong relative w-full max-w-md rounded-3xl p-6 animate-slide-up max-h-[85vh] overflow-y-auto scrollbar-hide">
        {title && <h2 className="font-display text-xl font-bold mb-4">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: { value: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`glass-subtle rounded-2xl p-1 flex gap-1 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-sm font-semibold transition-all glass-press ${
              active ? 'bg-accent text-white shadow-glow' : 'text-neutralt-600 dark:text-neutralt-300'
            }`}
          >
            {o.icon && <o.icon size={15} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
      <div className="w-20 h-20 rounded-3xl glass-subtle flex items-center justify-center mb-4">
        <Icon size={36} className="text-neutralt-400" />
      </div>
      <p className="font-semibold text-ink dark:text-neutralt-100">{title}</p>
      {subtitle && <p className="text-sm text-neutralt-500 dark:text-neutralt-400 mt-1 max-w-xs">{subtitle}</p>}
    </div>
  );
}

export function StatPill({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="glass-subtle rounded-2xl px-3 py-2 flex items-center gap-2">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${accent ? 'bg-accent/15 text-accent-500' : 'bg-neutralt-400/15 text-neutralt-600 dark:text-neutralt-300'}`}>
        <Icon size={16} />
      </div>
      <div>
        <p className="text-xs text-neutralt-500 dark:text-neutralt-400 leading-none">{label}</p>
        <p className="font-bold text-sm leading-tight">{value}</p>
      </div>
    </div>
  );
}
