import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Newspaper, Trophy } from 'lucide-react'
import { AppShell } from './layout/AppShell'
import { ComingSoon } from './components/ComingSoon'
import { RedirectWithParams } from './components/RedirectWithParams'
import { DashboardPage } from './pages/DashboardPage'
import { MarketsPage } from './pages/MarketsPage'
import { AssetPage } from './pages/AssetPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { SettingsPage } from './pages/SettingsPage'
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
  const location = useLocation()
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Beginner surfaces — placeholders until Phases 2-5 */}
        <Route path="/" element={<DashboardPage />} />
        <Route path="/markets" element={<MarketsPage />} />
        <Route path="/coins/:symbol" element={<AssetPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
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
        <Route path="/settings" element={<SettingsPage />} />

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
        <Route
          path="/paper"
          element={<Navigate to={{ pathname: '/lab/paper', search: location.search }} replace />}
        />
        <Route path="/paper/history" element={<Navigate to="/lab/paper/history" replace />} />
        <Route path="/paper/sessions/:id" element={<RedirectWithParams to="/lab/paper/sessions/:id" />} />
      </Route>
    </Routes>
  )
}
