import { NavLink } from 'react-router-dom'
import {
  BookOpen,
  CandlestickChart,
  LayoutDashboard,
  Newspaper,
  Settings,
  Trophy,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PortfolioSummaryCard } from '../components/PortfolioSummaryCard'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const DASHBOARD_ITEM: NavItem = { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true }

const TRADE_ITEMS: NavItem[] = [
  { to: '/app/markets', label: 'Markets', icon: CandlestickChart },
  { to: '/app/portfolio', label: 'Portfolio', icon: Wallet },
]

const DISCOVER_ITEMS: NavItem[] = [
  { to: '/app/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/app/news', label: 'News', icon: Newspaper },
  { to: '/app/learn', label: 'Learn', icon: BookOpen },
]

const SETTINGS_ITEM: NavItem = { to: '/app/settings', label: 'Settings', icon: Settings }

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

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
      {children}
    </p>
  )
}

export function Sidebar() {
  return (
    <nav
      aria-label="Main navigation"
      className="flex w-52 shrink-0 flex-col gap-1 border-r border-border px-3 py-4"
    >
      <SidebarLink item={DASHBOARD_ITEM} />

      <div className="mt-4 border-t border-border pt-4">
        <SectionLabel>Trade</SectionLabel>
        {TRADE_ITEMS.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <SectionLabel>Discover</SectionLabel>
        {DISCOVER_ITEMS.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4">
        <PortfolioSummaryCard />
        <SidebarLink item={SETTINGS_ITEM} />
      </div>
    </nav>
  )
}
