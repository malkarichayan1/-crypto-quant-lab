import { Navigate, generatePath, useParams } from 'react-router-dom'

export function RedirectWithParams({ to }: { to: string }) {
  const params = useParams()
  return <Navigate to={generatePath(to, params)} replace />
}
