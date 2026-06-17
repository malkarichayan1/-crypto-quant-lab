import { Routes, Route } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { NewRunPage } from './pages/NewRunPage'
import { HistoryPage } from './pages/HistoryPage'
import { ResultPage } from './pages/ResultPage'
import { AgentRunPage } from './pages/AgentRunPage'
import { AgentResultPage } from './pages/AgentResultPage'
import { AgentHistoryPage } from './pages/AgentHistoryPage'

export default function App() {
  return (
    <>
      <NavBar />
      <main className="container">
        <Routes>
          <Route path="/" element={<NewRunPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/backtests/:id" element={<ResultPage />} />
          <Route path="/research" element={<AgentRunPage />} />
          <Route path="/research/runs/:id" element={<AgentResultPage />} />
          <Route path="/research/history" element={<AgentHistoryPage />} />
        </Routes>
      </main>
    </>
  )
}
