import { Navigate, Route, Routes } from 'react-router-dom'
import {
  CandlestickChart,
  LayoutDashboard,
  Newspaper,
  Settings,
  Trophy,
  Wallet,
} from 'lucide-react'
import { AppShell } from './layout/AppShell'
import { ComingSoon } from './components/ComingSoon'
import { RedirectWithParams } from './components/RedirectWithParams'
import { NewRunPage } from './pages/NewRunPage'
import { HistoryPage } from './pages/HistoryPage'
import { ResultPage } from './pages/ResultPage'
import { AgentRunPage } from './pages/AgentRunPage'
import { AgentResultPage } from './pages/AgentResultPage'
import { AgentHistoryPage } from './pages/AgentHistoryPage'
import { PaperStartPage } from './pages/PaperStartPage'
import { PaperHistoryPage } from './pages/PaperHistoryPage'
import { PaperLivePage } from './pages/PaperLivePage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Beginner surfaces — placeholders until Phases 2-5 */}
        <Route
          path="/"
          element={
            <ComingSoon
              icon={LayoutDashboard}
              title="Dashboard"
              description="Your $100,000 practice portfolio is on its way. Markets and trading arrive in the next phases — the Strategy Lab is fully open in the meantime."
              cta={{ to: '/lab/backtests', label: 'Explore the Strategy Lab' }}
            />
          }
        />
        <Route
          path="/markets"
          element={
            <ComingSoon
              icon={CandlestickChart}
              title="Markets"
              description="Browse and search every tradeable coin with live prices and sparklines. Coming in Phase 2."
            />
          }
        />
        <Route
          path="/portfolio"
          element={
            <ComingSoon
              icon={Wallet}
              title="Portfolio"
              description="Your positions, orders, and activity will live here once trading opens in Phase 3."
            />
          }
        />
        <Route
          path="/leaderboard"
          element={
            <ComingSoon
              icon={Trophy}
              title="Leaderboard"
              description="You vs the AI strategies vs buy-and-hold Bitcoin. Coming in Phase 5."
            />
          }
        />
        <Route
          path="/news"
          element={
            <ComingSoon
              icon={Newspaper}
              title="News"
              description="Crypto headlines, refreshed automatically. Coming in Phase 5."
            />
          }
        />
        <Route
          path="/settings"
          element={
            <ComingSoon
              icon={Settings}
              title="Settings"
              description="Portfolio reset, starting cash, and advisor controls arrive with trading in Phase 3."
            />
          }
        />

        {/* Strategy Lab — existing pages, new addresses */}
        <Route path="/lab/backtests" element={<NewRunPage />} />
        <Route path="/lab/backtests/history" element={<HistoryPage />} />
        <Route path="/lab/backtests/:id" element={<ResultPage />} />
        <Route path="/lab/research" element={<AgentRunPage />} />
        <Route path="/lab/research/history" element={<AgentHistoryPage />} />
        <Route path="/lab/research/runs/:id" element={<AgentResultPage />} />
        <Route path="/lab/paper" element={<PaperStartPage />} />
        <Route path="/lab/paper/history" element={<PaperHistoryPage />} />
        <Route path="/lab/paper/sessions/:id" element={<PaperLivePage />} />

        {/* Legacy redirects — keep old bookmarks and in-app links working */}
        <Route path="/history" element={<Navigate to="/lab/backtests/history" replace />} />
        <Route path="/backtests/:id" element={<RedirectWithParams to="/lab/backtests/:id" />} />
        <Route path="/research" element={<Navigate to="/lab/research" replace />} />
        <Route path="/research/history" element={<Navigate to="/lab/research/history" replace />} />
        <Route path="/research/runs/:id" element={<RedirectWithParams to="/lab/research/runs/:id" />} />
        <Route path="/paper" element={<Navigate to="/lab/paper" replace />} />
        <Route path="/paper/history" element={<Navigate to="/lab/paper/history" replace />} />
        <Route path="/paper/sessions/:id" element={<RedirectWithParams to="/lab/paper/sessions/:id" />} />
      </Route>
    </Routes>
  )
}
