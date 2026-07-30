import { Outlet, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { cn } from '@/lib/utils'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppShell() {
  const location = useLocation()
  const isLabRoute = location.pathname === '/lab' || location.pathname.startsWith('/lab/')

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-x-hidden p-6">
          <div className={cn('mx-auto w-full max-w-6xl', isLabRoute && 'legacy-scope')}>
            <Outlet />
          </div>
        </main>
      </div>
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  )
}
