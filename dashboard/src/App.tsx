import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { RedirectWithParams } from './components/RedirectWithParams'
import { CookieConsentBanner } from './components/CookieConsentBanner'
import { useGoogleAnalytics } from './hooks/useGoogleAnalytics'
import { LandingPage } from './pages/LandingPage'
import { ThankYouPage } from './pages/ThankYouPage'
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { DashboardPage } from './pages/DashboardPage'
import { MarketsPage } from './pages/MarketsPage'
import { AssetPage } from './pages/AssetPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { NewsPage } from './pages/NewsPage'
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
import { PARAM_REDIRECTS, STATIC_REDIRECTS } from './routes/legacyRedirects'

export default function App() {
  const location = useLocation()
  useGoogleAnalytics()
  return (
    <>
      <Routes>
        {/* Public marketing surface — no AppShell */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/thank-you" element={<ThankYouPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />

        <Route element={<AppShell />}>
          {/* Beginner surfaces */}
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/app/markets" element={<MarketsPage />} />
          <Route path="/app/coins/:symbol" element={<AssetPage />} />
          <Route path="/app/portfolio" element={<PortfolioPage />} />
          <Route path="/app/leaderboard" element={<LeaderboardPage />} />
          <Route path="/app/news" element={<NewsPage />} />
          <Route path="/app/settings" element={<SettingsPage />} />

          {/* Strategy Lab — existing pages */}
          <Route path="/app/lab/backtests" element={<NewRunPage />} />
          <Route path="/app/lab/backtests/history" element={<HistoryPage />} />
          <Route path="/app/lab/backtests/:id" element={<ResultPage />} />
          <Route path="/app/lab/research" element={<AgentRunPage />} />
          <Route path="/app/lab/research/history" element={<AgentHistoryPage />} />
          <Route path="/app/lab/research/runs/:id" element={<AgentResultPage />} />
          <Route path="/app/lab/paper" element={<PaperStartPage />} />
          <Route path="/app/lab/paper/history" element={<PaperHistoryPage />} />
          <Route path="/app/lab/paper/sessions/:id" element={<PaperLivePage />} />
        </Route>

        {/* Legacy redirects — every bookmark that worked before this /app
            split (or before the older Strategy Lab rename) keeps working. */}
        {Object.entries(STATIC_REDIRECTS).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        {PARAM_REDIRECTS.map(({ from, to }) => (
          <Route key={from} path={from} element={<RedirectWithParams to={to} />} />
        ))}
        <Route
          path="/paper"
          element={
            <Navigate to={{ pathname: '/app/lab/paper', search: location.search }} replace />
          }
        />

        {/* Unmatched path */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <CookieConsentBanner />
    </>
  )
}
