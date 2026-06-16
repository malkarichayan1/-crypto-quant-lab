import { Routes, Route } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { NewRunPage } from './pages/NewRunPage'
import { HistoryPage } from './pages/HistoryPage'
import { ResultPage } from './pages/ResultPage'

export default function App() {
  return (
    <>
      <NavBar />
      <main className="container">
        <Routes>
          <Route path="/" element={<NewRunPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/backtests/:id" element={<ResultPage />} />
        </Routes>
      </main>
    </>
  )
}
