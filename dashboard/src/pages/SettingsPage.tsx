import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { setAdvisorEnabled, useAdvisorEnabled } from '../hooks/useAdvisorEnabled'

export function SettingsPage() {
  const advisorEnabled = useAdvisorEnabled()

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Advisor</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-center justify-between gap-6">
            <span>
              <span className="block text-sm font-medium">AI Advisor</span>
              <span className="block text-xs text-muted-foreground">
                Show suggestion cards on the Dashboard and coin pages. Suggestions are
                only generated when you ask for them.
              </span>
            </span>
            <Switch
              aria-label="AI Advisor"
              checked={advisorEnabled}
              onCheckedChange={setAdvisorEnabled}
            />
          </label>
        </CardContent>
      </Card>
    </div>
  )
}
