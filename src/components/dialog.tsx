import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from './ui'

/**
 * Accessible replacement for window.confirm / window.prompt, built on the
 * native <dialog> element (modal focus handling + Esc to cancel for free).
 * Usage: const ask = useDialog(); if (await ask.confirm({...})) ...
 */
type ConfirmOptions = { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean }
type PromptOptions = ConfirmOptions & {
  label: string; defaultValue?: string; inputType?: 'text' | 'number'; required?: boolean
  validate?: (value: string) => string | null
}
type Pending =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void }

type DialogApi = { confirm: (o: ConfirmOptions) => Promise<boolean>; prompt: (o: PromptOptions) => Promise<string | null> }
const DialogContext = createContext<DialogApi | null>(null)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const ref = useRef<HTMLDialogElement>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ kind: 'confirm', opts, resolve })), [])
  const prompt = useCallback((opts: PromptOptions) => new Promise<string | null>((resolve) => {
    setValue(opts.defaultValue ?? '')
    setError(null)
    setPending({ kind: 'prompt', opts, resolve })
  }), [])

  useEffect(() => {
    const el = ref.current
    if (pending && el && !el.open) el.showModal()
  }, [pending])

  function close(result: boolean) {
    if (!pending) return
    if (pending.kind === 'confirm') pending.resolve(result)
    else {
      if (result) {
        const v = value.trim()
        const msg = pending.opts.required !== false && !v ? 'This field is required.' : pending.opts.validate?.(v) ?? null
        if (msg) return setError(msg)
        pending.resolve(v)
      } else pending.resolve(null)
    }
    ref.current?.close()
    setPending(null)
  }

  const opts = pending?.opts
  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      <dialog
        ref={ref}
        aria-labelledby="wk-dialog-title"
        className="w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-black/10 p-0 shadow-xl backdrop:bg-black/40"
        onCancel={(e) => { e.preventDefault(); close(false) }}
      >
        {opts && (
          <form method="dialog" className="flex flex-col gap-4 p-5" onSubmit={(e) => { e.preventDefault(); close(true) }}>
            <h2 id="wk-dialog-title" className="text-lg font-semibold text-ink-900">{opts.title}</h2>
            {opts.message && <div className="text-sm text-ink-700">{opts.message}</div>}
            {pending?.kind === 'prompt' && (
              <div className="flex flex-col gap-1">
                <label htmlFor="wk-dialog-input" className="text-sm font-medium">{pending.opts.label}</label>
                <input
                  id="wk-dialog-input" autoFocus type={pending.opts.inputType ?? 'text'} value={value}
                  step={pending.opts.inputType === 'number' ? 'any' : undefined}
                  aria-invalid={!!error || undefined} aria-describedby={error ? 'wk-dialog-err' : undefined}
                  onChange={(e) => { setValue(e.currentTarget.value); setError(null) }}
                  className={`rounded-md border px-3 py-2 text-sm ${error ? 'border-rose-600' : 'border-black/20'}`}
                />
                {error && <p id="wk-dialog-err" className="text-xs font-medium text-rose-700">{error}</p>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => close(false)}>Cancel</Button>
              <Button type="submit" variant={opts.danger ? 'danger' : 'primary'} autoFocus={pending?.kind === 'confirm'}>
                {opts.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </DialogContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components -- hook co-located with its provider
export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used inside DialogProvider')
  return ctx
}
