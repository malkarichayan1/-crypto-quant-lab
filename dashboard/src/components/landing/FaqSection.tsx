import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useJsonLd } from '../../hooks/useJsonLd'

export type FaqItem = { question: string; answer: string; privacyLink?: boolean }

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Is this real money?',
    answer:
      'No. You start with $100,000 in virtual cash and every trade is simulated — nothing ever touches a real exchange or a real bank account.',
  },
  {
    question: 'Do I need to sign up?',
    answer: 'No account or sign-up is required. Open the app and start trading immediately.',
  },
  {
    question: 'Is the AI advice financial advice?',
    answer:
      'No. Suggestions are generated for learning purposes only, grounded in real indicator signals, and are never a recommendation to trade with real money.',
  },
  {
    question: 'Where do the prices come from?',
    answer:
      'Live market prices come from real exchange data, so charts and fills behave like the real market — only the money is fake.',
  },
  {
    question: 'What data do you collect?',
    answer: "Very little — there's no account or password to create. See our Privacy Policy for the full picture.",
    privacyLink: true,
  },
]

// Computed once at module load, not per-render, so useJsonLd gets a stable
// reference and doesn't re-run its effect on every FaqSection render.
const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer },
  })),
}

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  useJsonLd('faq-schema', FAQ_JSON_LD)

  return (
    <section aria-labelledby="faq-heading" className="mx-auto w-full max-w-2xl px-6 py-16">
      <h2 id="faq-heading" className="mb-6 text-center text-2xl font-bold">
        Frequently asked questions
      </h2>
      <dl className="flex flex-col gap-2">
        {FAQ_ITEMS.map((item, index) => {
          const isOpen = openIndex === index
          const panelId = `faq-panel-${index}`
          return (
            <div key={item.question} className="rounded-lg border border-border">
              <dt>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm font-medium"
                >
                  {item.question}
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      'size-4 shrink-0 transition-transform duration-200',
                      isOpen && 'rotate-180',
                    )}
                  />
                </button>
              </dt>
              {isOpen && (
                <dd id={panelId} className="px-4 pb-4 text-sm text-muted-foreground">
                  {item.privacyLink ? (
                    <>
                      There's no account or password to create.{' '}
                      <Link to="/privacy" className="underline underline-offset-2">
                        See our Privacy Policy
                      </Link>{' '}
                      for the full picture.
                    </>
                  ) : (
                    item.answer
                  )}
                </dd>
              )}
            </div>
          )
        })}
      </dl>
    </section>
  )
}
