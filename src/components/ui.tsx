/* Reusable, accessible UI primitives (functional first; visual polish via Figma later). */
import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import type { Enums } from '../lib/database.types'
import { SIGNUP_STATUS_LABELS } from '../lib/format'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Button({
  variant = 'primary', busy = false, className, children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' && 'bg-brand-700 text-white hover:bg-brand-800',
        variant === 'secondary' && 'border border-black/15 bg-white text-ink-900 hover:bg-black/5',
        variant === 'danger' && 'bg-rose-700 text-white hover:bg-rose-800',
        variant === 'ghost' && 'text-brand-700 hover:bg-brand-50',
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
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink-900">{label}</label>
      {children({ id, describedBy: [hintId, errId].filter(Boolean).join(' ') || undefined })}
      {hint && <p id={hintId} className="text-xs text-ink-500">{hint}</p>}
      {error && <p id={errId} className="text-xs font-medium text-rose-700">{error}</p>}
    </div>
  )
}
const inputCls = (error?: string) =>
  cx('w-full rounded-md border bg-white px-3 py-2 text-sm', error ? 'border-rose-600' : 'border-black/20')

export function TextField({ label, error, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  return (
    <FieldShell label={label} error={error} hint={hint}>
      {({ id, describedBy }) => <input id={id} aria-invalid={!!error || undefined} aria-describedby={describedBy} className={inputCls(error)} {...rest} />}
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
      <input id={id} type="checkbox" className="h-4 w-4" {...rest} />
      <label htmlFor={id} className="text-sm text-ink-900">{label}</label>
    </div>
  )
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'success' | 'error' | 'warning'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-md border px-3 py-2 text-sm',
        tone === 'info' && 'border-brand-100 bg-brand-50 text-brand-800',
        tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
        tone === 'error' && 'border-rose-200 bg-rose-50 text-rose-900',
        tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900',
      )}
    >
      {children}
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
    <div role="alert" className="my-6 rounded-lg border border-rose-200 bg-rose-50 p-4">
      <p className="font-medium text-rose-900">{title}</p>
      {message && <p className="mt-1 text-sm text-rose-800">{message}</p>}
      {onRetry && <Button variant="secondary" className="mt-3" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="my-4 rounded-lg border border-dashed border-black/15 bg-white p-6 text-center">
      <p className="font-medium text-ink-900">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-500">{children}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-lg border border-black/10 bg-white p-4', className)}>{children}</div>
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-ink-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink-900">{value}</p>
    </Card>
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
      <div className="h-2 w-full overflow-hidden rounded-full bg-black/10" role="progressbar" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={confirmed} aria-label="Seats filled">
        <div className="h-full bg-brand-600" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-500">
        {confirmed}/{capacity} confirmed{waitlisted ? ` · ${waitlisted} waitlisted` : ''}
      </p>
    </div>
  )
}
