/** Shown when the environment is missing or points anywhere other than Worldkin. */
export function ConfigErrorPage({ problems }: { problems: string[] }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-24" role="alert">
      <h1 className="text-2xl font-semibold text-ink-900">Configuration required</h1>
      <p className="mt-3 text-ink-700">Worldkin Roster cannot start because its environment is not set correctly:</p>
      <ul className="mt-3 list-disc pl-6 text-sm text-rose-800">
        {problems.map((p) => <li key={p}>{p}</li>)}
      </ul>
      <p className="mt-4 text-sm text-ink-500">
        Copy <code>.env.example</code> to <code>.env.local</code> and fill in the Worldkin publishable key.
      </p>
    </main>
  )
}
