import { NavLink } from 'react-router-dom'
import {
  Activity,
  Bot,
  CandlestickChart,
  FlaskConical,
  LayoutDashboard,
  Newspaper,
  Settings,
  Trophy,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const MAIN_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/markets', label: 'Markets', icon: CandlestickChart },
  { to: '/portfolio', label: 'Portfolio', icon: Wallet },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/news', label: 'News', icon: Newspaper },
]

const LAB_ITEMS: NavItem[] = [
  { to: '/lab/backtests', label: 'Backtests', icon: FlaskConical },
  { to: '/lab/research', label: 'Research', icon: Bot },
  { to: '/lab/paper', label: 'Paper Sessions', icon: Activity },
]

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-200',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{item.label}</span>
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <nav
      aria-label="Main navigation"
      className="flex w-52 shrink-0 flex-col gap-1 border-r border-border px-3 py-4"
    >
      {MAIN_ITEMS.map((item) => (
        <SidebarLink key={item.to} item={item} />
      ))}

      <div className="mt-4 border-t border-border pt-4">
        <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          Strategy Lab
        </p>
        {LAB_ITEMS.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </div>

      <div className="mt-auto border-t border-border pt-4">
        <SidebarLink item={{ to: '/settings', label: 'Settings', icon: Settings }} />
      </div>
    </nav>
  )
}
