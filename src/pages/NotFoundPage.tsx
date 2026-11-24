import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="mt-3 text-ink-700">The page you are looking for does not exist.</p>
      <Link to="/" className="mt-6 inline-block font-medium text-brand-700 underline">
        Back to home
      </Link>
    </section>
  )
}
