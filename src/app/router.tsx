import { createBrowserRouter } from 'react-router'
import { AppShell } from '../components/layout/AppShell.tsx'
import { HomePage } from '../pages/HomePage.tsx'
import { NotFoundPage } from '../pages/NotFoundPage.tsx'
import { RouteErrorPage } from '../pages/RouteErrorPage.tsx'

/*
 * Central route table. Later phases add:
 *   /explore, /opportunities/:id, /me/shifts, /org/..., /admin/...
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
