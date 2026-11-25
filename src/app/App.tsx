import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { AuthProvider } from '../auth/AuthProvider'
import { DialogProvider } from '../components/dialog'
import { envResult } from '../lib/env'
import { ConfigErrorPage } from '../pages/ConfigErrorPage'
import { router } from './router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      // retry only transient failures; business-rule errors are definitive
      retry: (count, err) => count < 1 && (err as { retryable?: boolean }).retryable === true,
    },
    mutations: { retry: false },
  },
})

export function App() {
  if (!envResult.ok) return <ConfigErrorPage problems={envResult.problems} />
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DialogProvider>
          <RouterProvider router={router} />
        </DialogProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
