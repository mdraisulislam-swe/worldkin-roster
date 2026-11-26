/* Reusable, accessible UI primitives — styled to the approved design system (docs/DESIGN_SYSTEM.md). */
import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import type { Enums } from '../lib/database.types'
import { SIGNUP_STATUS_LABELS } from '../lib/format'
import { Icon, type IconName } from './Icon'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Button({
  variant = 'primary', busy = false, className, children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent'; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-transparent px-4 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-brand-700 text-white hover:bg-brand-800',
        variant === 'secondary' && 'border-[#d5d9d2] bg-white text-ink-900 hover:border-brand-600 hover:text-brand-700',
        variant === 'danger' && 'bg-rose-700 text-white hover:bg-rose-800',
        variant === 'ghost' && 'text-brand-700 hover:bg-brand-50',
        variant === 'accent' && 'bg-terracotta-700 text-white hover:brightness-95',
        className,
      )}
    >
      {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  )
}

type FieldShellProps = { label: string; error?: string; hint?: string; children: (ids: { id: string; describedBy?: string }) => ReactNode }
function FieldShell({ label, error, hint, children }: FieldShellProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink-900">{label}</label>
      {children({ id, describedBy: [hintId, errId].filter(Boolean).join(' ') || undefined })}
      {hint && <p id={hintId} className="text-xs text-ink-500">{hint}</p>}
      {error && <p id={errId} className="flex items-center gap-1 text-xs font-medium text-rose-700"><Icon name="x-circle" size={14} />{error}</p>}
    </div>
  )
}
const inputCls = (error?: string) =>
  cx('min-h-11 w-full rounded-lg border bg-white px-3 py-2 text-[15px] text-ink-900 placeholder:text-ink-500/70 focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-600/25', error ? 'border-rose-600' : 'border-[#d5d9d2]')

export function TextField({ label, error, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {({ id, describedBy }) => <input id={id} aria-invalid={!!error || undefined} aria-describedby={describedBy} className={inputCls(error)} {...rest} />}
    </FieldShell>
  )
}
/** Password input with a show/hide toggle (keeps the same label, hint and error behaviour). */
export function PasswordField({ label, error, hint, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string; error?: string; hint?: string }) {
  const [show, setShow] = useState(false)
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {({ id, describedBy }) => (
        <div className="relative">
          <input id={id} type={show ? 'text' : 'password'} aria-invalid={!!error || undefined} aria-describedby={describedBy} className={inputCls(error) + ' pr-16'} {...rest} />
          <button type="button" onClick={() => setShow((v) => !v)} aria-controls={id} aria-pressed={show}
            className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-brand-700 hover:underline">
            {show ? 'Hide' : 'Show'}<span className="sr-only"> password</span>
          </button>
        </div>
      )}
    </FieldShell>
  )
}

export function TextArea({ label, error, hint, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {({ id, describedBy }) => <textarea id={id} rows={4} aria-invalid={!!error || undefined} aria-describedby={describedBy} className={inputCls(error)} {...rest} />}
    </FieldShell>
  )
}
export function Select({ label, error, hint, options, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string; error?: string; hint?: string; options: { value: string; label: string }[]
}) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {({ id, describedBy }) => (
        <select id={id} aria-invalid={!!error || undefined} aria-describedby={describedBy} className={inputCls(error)} {...rest}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </FieldShell>
  )
}
export function Checkbox({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <input id={id} type="checkbox" className="h-4 w-4 accent-brand-700" {...rest} />
      <label htmlFor={id} className="text-sm text-ink-900">{label}</label>
    </div>
  )
}

const ALERT_ICON: Record<string, IconName> = { info: 'info', success: 'check-circle', error: 'x-circle', warning: 'alert' }
export function Alert({ tone = 'info', children }: { tone?: 'info' | 'success' | 'error' | 'warning'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm',
        tone === 'info' && 'border-brand-100 bg-brand-50 text-brand-800',
        tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
        tone === 'error' && 'border-rose-200 bg-rose-50 text-rose-900',
        tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900',
      )}
    >
      <Icon name={ALERT_ICON[tone]} size={18} className="mt-px" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-10 text-sm text-ink-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" aria-hidden />
      {label}…
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="my-6 rounded-xl border border-rose-200 bg-rose-50 p-5">
      <p className="font-medium text-rose-900">{title}</p>
      {message && <p className="mt-1 text-sm text-rose-800">{message}</p>}
      {onRetry && <Button variant="secondary" className="mt-3" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="my-4 flex flex-col items-center rounded-xl border border-neutral-100 bg-white px-6 py-10 text-center">
      <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-700"><Icon name="inbox" size={26} /></span>
      <p className="font-display text-lg font-semibold text-ink-900">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm text-ink-500">{children}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-xl border border-neutral-100 bg-white p-5 shadow-[0_1px_2px_rgba(20,26,34,0.04)]', className)}>{children}</div>
}

/** Dashboard stat tile (prototype "kpi"): icon + label, large number, optional caption. Values always come from the database. */
export function Stat({ label, value, icon, caption }: { label: string; value: ReactNode; icon?: IconName; caption?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-neutral-100 bg-white px-5 py-[18px] shadow-[0_1px_2px_rgba(20,26,34,0.04)]">
      <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-500">{icon && <Icon name={icon} size={16} />}{label}</span>
      <span className="font-display text-[32px] font-bold leading-[1.1] tabular-nums text-ink-900">{value}</span>
      {caption && <span className="text-[12.5px] text-ink-500">{caption}</span>}
    </div>
  )
}

const STATUS_TONE: Record<string, string> = {
  confirmed: 'bg-emerald-100 text-emerald-900',
  attended: 'bg-emerald-100 text-emerald-900',
  verified: 'bg-emerald-100 text-emerald-900',
  published: 'bg-emerald-100 text-emerald-900',
  scheduled: 'bg-emerald-100 text-emerald-900',
  waitlisted: 'bg-amber-100 text-amber-900',
  pending: 'bg-amber-100 text-amber-900',
  draft: 'bg-slate-100 text-slate-800',
  cancelled: 'bg-slate-100 text-slate-800',
  closed: 'bg-slate-100 text-slate-800',
  no_show: 'bg-rose-100 text-rose-900',
  rejected: 'bg-rose-100 text-rose-900',
  suspended: 'bg-rose-100 text-rose-900',
  accepted: 'bg-emerald-100 text-emerald-900',
  active: 'bg-emerald-100 text-emerald-900',
  resolved: 'bg-emerald-100 text-emerald-900',
  selected: 'bg-sky-100 text-sky-900',
  submitted: 'bg-slate-100 text-slate-800',
  under_review: 'bg-amber-100 text-amber-900',
  in_review: 'bg-amber-100 text-amber-900',
  open: 'bg-amber-100 text-amber-900',
  withdrawn: 'bg-slate-100 text-slate-800',
  declined: 'bg-slate-100 text-slate-800',
  dismissed: 'bg-slate-100 text-slate-800',
  hidden: 'bg-slate-100 text-slate-800',
  expired: 'bg-rose-100 text-rose-900',
  revoked: 'bg-rose-100 text-rose-900',
  'platform admin': 'bg-violet-100 text-violet-900',
}
/** Status is always shown as text + colour (never colour alone). */
export function StatusBadge({ status }: { status: string }) {
  const label = SIGNUP_STATUS_LABELS[status as Enums<'signup_status'>] ?? status.replace(/_/g, ' ')
  return (
    <span className={cx('inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_TONE[status] ?? 'bg-slate-100 text-slate-800')}>
      {label}
    </span>
  )
}

export function CapacityMeter({ confirmed, capacity, waitlisted }: { confirmed: number; capacity: number; waitlisted?: number }) {
  const pct = Math.min(100, Math.round((confirmed / Math.max(capacity, 1)) * 100))
  return (
    <div className="min-w-32">
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={confirmed} aria-label="Seats filled">
        <div className="h-full bg-brand-600" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-500">
        {confirmed}/{capacity} confirmed{waitlisted ? ` · ${waitlisted} waitlisted` : ''}
      </p>
    </div>
  )
}
