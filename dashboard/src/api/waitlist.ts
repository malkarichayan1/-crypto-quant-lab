import { apiFetch } from './client'

export function joinWaitlist(email: string, company: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>('/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, company }),
  })
}
