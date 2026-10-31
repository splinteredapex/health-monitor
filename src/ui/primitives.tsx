import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XOctagon } from 'lucide-react';

export const cx = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(' ');

export function Card({ title, action, children, className, as: As = 'section', titleId }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; as?: 'section' | 'div' | 'article'; titleId?: string }) {
  const gen = useId();
  const hid = titleId ?? gen;
  return (
    <As className={cx('rounded-2xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgb(15_35_64/0.06)] sm:p-5', className)} aria-labelledby={title ? hid : undefined}>
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          {title && <h2 id={hid} className="text-base font-semibold text-text">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </As>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'primary', size = 'md', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' }) {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-primary text-on-primary hover:bg-primary-strong',
    secondary: 'border border-border bg-surface text-text hover:bg-surface-2',
    ghost: 'text-primary hover:bg-surface-2',
    danger: 'bg-danger text-white hover:opacity-90 dark:text-black',
  };
  const s = { sm: 'min-h-10 px-3 text-sm', md: 'min-h-12 px-4 text-[15px]', lg: 'min-h-14 px-5 text-base' }[size];
  return (
    <button type="button" className={cx('inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50', v[variant], s, className)} {...rest}>
      {children}
    </button>
  );
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-text', className)} {...rest}>
      {children}
    </button>
  );
}

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  suffix?: string;
  ref?: React.Ref<HTMLInputElement>;
}
export function Field({ label, hint, error, suffix, className, id, ...rest }: FieldProps) {
  const gen = useId();
  const fid = id ?? gen;
  const hintId = hint ? `${fid}-hint` : undefined;
  const errId = error ? `${fid}-err` : undefined;
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={fid} className="text-sm font-medium text-text">{label}</label>
      <div className="relative">
        <input
          id={fid}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
          className={cx('tabular min-h-12 w-full rounded-xl border bg-surface px-3 text-base text-text placeholder:text-muted/70', error ? 'border-danger' : 'border-border', suffix && 'pr-14')}
          {...rest}
        />
        {suffix && <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">{suffix}</span>}
      </div>
      {hint && <p id={hintId} className="text-xs text-muted">{hint}</p>}
      {error && <p id={errId} role="alert" className="flex items-center gap-1 text-sm text-danger"><XOctagon size={14} aria-hidden />{error}</p>}
    </div>
  );
}

export function TextArea({ label, value, onChange, rows = 2, hint }: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <textarea id={id} rows={rows} maxLength={2000} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-base" aria-describedby={hint ? `${id}-h` : undefined} />
      {hint && <p id={`${id}-h`} className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Select({ label, children, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <select id={id} className="min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base" {...rest}>{children}</select>
    </div>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange, hideLabel, size = 'md' }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (v: T) => void; hideLabel?: boolean; size?: 'sm' | 'md' }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-labelledby={id} className="flex flex-col gap-1">
      <span id={id} className={cx('text-sm font-medium', hideLabel && 'sr-only')}>{label}</span>
      <div className="flex flex-wrap gap-1 rounded-xl bg-surface-2 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cx('flex-1 rounded-lg px-3 font-medium transition-colors', size === 'sm' ? 'min-h-9 text-sm' : 'min-h-11 text-[15px]', value === o.value ? 'bg-surface text-text shadow-sm ring-1 ring-border' : 'text-muted hover:text-text')}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={cx('min-h-10 rounded-full border px-3 text-sm font-medium', selected ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface text-text')}>
      {children}
    </button>
  );
}

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';
const TONE: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok border-ok/30',
  warn: 'bg-warn-bg text-warn border-warn/30',
  danger: 'bg-danger-bg text-danger border-danger/30',
  info: 'bg-info-bg text-info border-info/30',
  neutral: 'bg-surface-2 text-muted border-border',
};
const TONE_ICON: Record<Tone, typeof Info> = { ok: CheckCircle2, warn: AlertTriangle, danger: XOctagon, info: Info, neutral: Info };

/** Status always carries an icon + text, never colour alone. */
export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const Icon = TONE_ICON[tone];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold', TONE[tone])}>
      <Icon size={12} aria-hidden />
      {children}
    </span>
  );
}

const TITLE_TONE: Record<Tone, string> = { ok: 'text-ok', warn: 'text-warn', danger: 'text-danger', info: 'text-info', neutral: 'text-text' };
export function Notice({ tone, title, children, role }: { tone: Tone; title?: string; children: ReactNode; role?: 'alert' | 'status' }) {
  const Icon = TONE_ICON[tone];
  return (
    <div role={role} className={cx('flex gap-3 rounded-xl border p-3 text-sm', TONE[tone])}>
      <Icon size={20} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 text-text">
        {title && <p className={cx('font-semibold', TITLE_TONE[tone])}>{title}</p>}
        <div className="space-y-1">{children}</div>
      </div>
    </div>
  );
}

export function Stat({ label, value, unit, sub }: { label: string; value: ReactNode; unit?: string; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="tabular mt-0.5 text-2xl font-semibold text-text">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}
      </p>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">{children}</p>;
}

/** Accessible modal using native <dialog> (focus trap + Esc handled by the browser). */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-2xl border border-border bg-surface p-0 sm:m-auto sm:max-w-lg sm:rounded-2xl"
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 id={id} className="text-lg font-semibold">{title}</h2>
            <IconButton label="Close" onClick={onClose}><X size={20} aria-hidden /></IconButton>
          </div>
          <div className="overflow-y-auto px-4 py-4">{children}</div>
          {footer && <div className="safe-bottom flex gap-2 border-t border-border px-4 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/* ---- Toasts (polite live region) ---- */
type ToastMsg = { id: number; text: string; tone: Tone };
const ToastCtx = createContext<(text: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, tone: Tone = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {items.map((t) => (
          <div key={t.id} className={cx('pointer-events-auto rounded-xl border px-4 py-2 text-sm font-medium shadow-lg', TONE[t.tone])}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Confirmation dialog helper. */
export function ConfirmSheet({ open, title, body, confirmLabel, danger, onConfirm, onClose }: { open: boolean; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={title} footer={<><Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} className="flex-1" onClick={onConfirm}>{confirmLabel}</Button></>}>
      <div className="space-y-2 text-sm">{body}</div>
    </Sheet>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/** Parse a user-typed number; accepts comma decimals. Empty → null. */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
