import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { SpecForm } from '../components/spec-form/SpecForm'
import { createBacktest } from '../api/backtests'
import type { CreateBacktestRequest } from '../types'

export function NewRunPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (req: CreateBacktestRequest) => createBacktest(req),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['backtests'] })
      navigate(`/backtests/${result.id}`)
    },
  })

  return (
    <div>
      <h2>New Run</h2>
      {mutation.isError && (
        <p className="neg" role="alert">{mutation.error.message}</p>
      )}
      <SpecForm
        onSubmit={(req) => mutation.mutate(req)}
        pending={mutation.isPending}
      />
    </div>
  )
}
