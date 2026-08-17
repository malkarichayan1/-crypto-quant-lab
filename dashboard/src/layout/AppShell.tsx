import { Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { PageMetaSync } from '../components/PageMetaSync'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PageMetaSync />
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-x-hidden p-6">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  )
}
