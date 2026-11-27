import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { OTP_LENGTH, normalizeOtp } from '../lib/otp'

/**
 * Six single-digit boxes for an email verification code.
 * Typing moves focus forward, Backspace on an empty box moves back, arrows move between
 * boxes, and pasting the whole code (spaces/dashes ignored) fills every box.
 * The first box carries autocomplete="one-time-code" so mobile keyboards can offer the code.
 */
export function OtpInput({ value, onChange, onComplete, disabled, invalid, describedBy }: {
  value: string; onChange: (v: string) => void; onComplete?: (v: string) => void
  disabled?: boolean; invalid?: boolean; describedBy?: string
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  // Newest value, readable from focus handlers before React re-renders.
  const latest = useRef(value)
  useEffect(() => { latest.current = value }, [value])
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? '')
  const focus = (i: number) => refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, i))]?.focus()

  function setAt(i: number, chunk: string) {
    const clean = normalizeOtp(chunk)
    if (!clean) return
    // Typing or pasting several digits fills from this box onwards.
    const next = (value.slice(0, i) + clean + value.slice(i + clean.length)).slice(0, OTP_LENGTH)
    latest.current = next
    onChange(next)
    focus(i + clean.length)
    if (next.length === OTP_LENGTH && !next.includes(' ')) onComplete?.(next)
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      if (digits[i]) { latest.current = value.slice(0, i) + value.slice(i + 1); onChange(latest.current) }
      else if (i > 0) { latest.current = value.slice(0, i - 1) + value.slice(i); onChange(latest.current); focus(i - 1) }
    } else if (e.key === 'ArrowLeft') { e.preventDefault(); focus(i - 1) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); focus(i + 1) }
  }

  function onPaste(i: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    setAt(i, e.clipboardData.getData('text'))
  }

  return (
    <div role="group" aria-label="Verification code" aria-describedby={describedBy} className="flex justify-between gap-2">
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el }}
          name={i === 0 ? 'code' : undefined}
          value={d} disabled={disabled}
          inputMode="numeric" pattern="[0-9]*" maxLength={OTP_LENGTH}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`} aria-invalid={invalid || undefined}
          onChange={(e) => setAt(i, e.currentTarget.value.replace(d, '') || e.currentTarget.value)}
          onKeyDown={(e) => onKeyDown(i, e)} onPaste={(e) => onPaste(i, e)}
          onFocus={(e) => { if (i > latest.current.length) focus(latest.current.length); else e.currentTarget.select() }}
          className={`h-14 w-full min-w-0 max-w-14 rounded-md border bg-white text-center font-mono text-2xl font-semibold text-ink-900
            focus:border-brand-600 focus:outline-2 focus:outline-brand-600 disabled:bg-black/5
            ${invalid ? 'border-rose-500' : 'border-black/20'}`} />
      ))}
    </div>
  )
}
