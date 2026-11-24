import { isRouteErrorResponse, useRouteError } from 'react-router'

/* Shown when a route throws while rendering, so users never see a blank screen. */
export function RouteErrorPage() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : 'An unexpected error occurred.'

  return (
    <main className="mx-auto max-w-xl px-4 py-24" role="alert">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-3 text-ink-700">{message}</p>
      <a href="/" className="mt-6 inline-block font-medium text-brand-700 underline">
        Reload the home page
      </a>
    </main>
  )
}
