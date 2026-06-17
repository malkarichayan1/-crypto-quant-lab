import { NavLink } from 'react-router-dom'

export function NavBar() {
  return (
    <nav className="navbar">
      <span className="brand">HedgeFund Sim</span>
      <NavLink to="/" end>New Run</NavLink>
      <NavLink to="/history">History</NavLink>
      <NavLink to="/research">Research</NavLink>
      <NavLink to="/research/history">Research History</NavLink>
    </nav>
  )
}
