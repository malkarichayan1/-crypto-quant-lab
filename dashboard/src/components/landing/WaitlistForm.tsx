import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { joinWaitlist } from '../../api/waitlist'

export function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('') // honeypot
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () => joinWaitlist(email, company),
    onSuccess: () => navigate('/thank-you'),
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    mutation.mutate()
  }

  return (
    <section className="mx-auto w-full max-w-sm px-6 py-16">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <h2 className="text-center text-xl font-bold">Get notified about new features</h2>
        <div className="flex gap-2">
          <Input
            type="email"
            required
            placeholder="you@example.com"
            aria-label="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Submitting…' : 'Notify me'}
          </Button>
        </div>
        {/* Honeypot: hidden from real users via CSS and aria-hidden. Bots
            that fill every field they find trip this; the backend accepts
            the request but stores nothing (see waitlist_schemas.py). */}
        <input
          type="text"
          name="company"
          data-testid="waitlist-honeypot"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
        />
        {mutation.isError && (
          <p role="alert" className="text-sm text-loss">
            Something went wrong. Please try again.
          </p>
        )}
      </form>
    </section>
  )
}
