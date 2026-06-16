import { useState } from 'react'
import { INITIAL_FORM_STATE } from './types'
import type { SpecFormState } from './types'
import { buildCreateRequest } from '../../lib/buildRequest'
import type { CreateBacktestRequest } from '../../types'
import { Step1Strategy } from './Step1Strategy'
import { Step2Indicators } from './Step2Indicators'

interface Props {
  onSubmit: (req: CreateBacktestRequest) => void
  pending: boolean
}

const STEP_LABELS = [
  'Step 1 — Strategy',
  'Step 2 — Indicators',
  'Step 3 — Selection',
  'Step 4 — Sizing & Costs',
]

export function SpecForm({ onSubmit, pending }: Props) {
  const [step, setStep] = useState(0)
  const [state, setState] = useState<SpecFormState>(INITIAL_FORM_STATE)

  function update(patch: Partial<SpecFormState>) {
    setState((prev) => ({ ...prev, ...patch }))
  }

  function handleSubmit() {
    onSubmit(buildCreateRequest(state))
  }

  return (
    <div className="spec-form">
      <aside className="steps">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className={i === step ? 'step-active' : ''}>
            {label}
          </div>
        ))}
      </aside>

      <section className="step-body">
        <h3>{STEP_LABELS[step]}</h3>

        {step === 0 && <Step1Strategy state={state} update={update} />}
        {step === 1 && <Step2Indicators state={state} update={update} />}
        {step === 2 && <p>Selection step (added in Task 9)</p>}
        {step === 3 && <p>Sizing step (added in Task 9)</p>}

        <div className="step-nav">
          {step > 0 && (
            <button type="button" onClick={() => setStep((s) => s - 1)}>
              ← Back
            </button>
          )}
          {step < STEP_LABELS.length - 1 && (
            <button type="button" onClick={() => setStep((s) => s + 1)}>
              Next →
            </button>
          )}
          {step === STEP_LABELS.length - 1 && (
            <button
              type="button"
              className="primary"
              disabled={pending}
              onClick={handleSubmit}
            >
              {pending ? 'Running…' : 'Run Backtest →'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
