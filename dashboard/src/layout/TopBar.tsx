import { Bell, Hexagon, Search, User } from 'lucide-react'
import { Input } from '@/components/ui/input'

export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <Hexagon className="size-5 text-primary" aria-hidden="true" />
        <span className="text-sm font-bold">HedgeFund Sim</span>
      </div>

      <div className="relative ml-4 hidden w-full max-w-xs md:block">
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input disabled placeholder="Search coins…" className="h-9 pl-9" />
      </div>

      <div className="ml-auto flex items-center gap-4">
        <Bell className="size-4 text-muted-foreground" aria-hidden="true" />
        <div
          aria-label="Your profile"
          className="flex size-8 items-center justify-center rounded-full bg-secondary text-muted-foreground"
        >
          <User className="size-4" aria-hidden="true" />
        </div>
      </div>
    </header>
  )
}
