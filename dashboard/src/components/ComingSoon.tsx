import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

type Props = {
  icon: LucideIcon
  title: string
  description: string
  cta?: { to: string; label: string }
}

export function ComingSoon({ icon: Icon, title, description, cta }: Props) {
  return (
    <section className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl border border-border bg-card">
        <Icon className="size-7 text-primary" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {cta && (
        <Button asChild variant="outline" className="mt-2">
          <Link to={cta.to}>{cta.label}</Link>
        </Button>
      )}
    </section>
  )
}
