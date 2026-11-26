import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Last line of defence for errors thrown outside the router (providers, dialogs).
 * Route-level errors are handled by RouteErrorPage; this keeps the page from
 * going blank if anything above the router fails. No error details are shown.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Development aid only; production builds keep the console clean of user data.
    if (import.meta.env.DEV) console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="mx-auto max-w-xl px-4 py-24" role="alert">
        <h1 className="text-2xl font-semibold text-ink-900">Something went wrong</h1>
        <p className="mt-3 text-ink-700">The page hit an unexpected problem. Your account and data are safe.</p>
        <button type="button" className="mt-6 rounded-md bg-brand-700 px-4 py-2 font-medium text-white hover:bg-brand-800"
          onClick={() => window.location.reload()}>Reload</button>
      </main>
    )
  }
}
