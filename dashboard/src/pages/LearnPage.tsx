import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Lesson = {
  title: string
  body: string
}

// Grounded in what this app actually does: market-price buy/sell only (no
// limit orders), a live leaderboard, and an AI advisor on the Dashboard.
// Keep every lesson accurate to real app behavior, not generic finance
// content that implies features that don't exist here.
const LESSONS: Lesson[] = [
  {
    title: 'How this simulator works',
    body: "You start with $100,000 in virtual cash. Prices are real, live crypto market prices — but every trade is simulated, so no real money ever changes hands. It's a safe place to build habits before you'd risk anything real.",
  },
  {
    title: 'Buying and selling',
    body: "Every order here fills at the current market price — there's no separate order type to choose. When you buy, cash converts into a position in that coin; when you sell, it converts back into cash. Your \"buying power\" is simply the cash you have left to spend.",
  },
  {
    title: 'Reading price changes',
    body: "The 24h change on the Markets page shows how much a coin has moved in the last day. Crypto can swing a lot in short windows — a single red day doesn't mean a coin is a bad choice, and a single green day doesn't mean it's a good one.",
  },
  {
    title: 'Diversification',
    body: "Putting everything into one coin means one bad move wipes out your whole portfolio. Spreading your cash across a handful of coins means no single price swing decides your outcome — a habit worth building here before it costs anything real.",
  },
  {
    title: 'Volatility and risk',
    body: "Crypto is more volatile than most traditional assets — bigger swings, in both directions, over shorter periods. A good practice (even with play money) is deciding upfront how much of your portfolio you're willing to put behind one idea, before you place the order.",
  },
  {
    title: 'Tracking your performance',
    body: "Your Dashboard shows total equity, today's P/L, and total return since you started. The Leaderboard compares your simulated return against other strategies. Watch total return over weeks, not day-to-day P/L — a single day tells you very little.",
  },
]

export function LearnPage() {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Learn</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Short, plain-English lessons for getting started — no jargon, no prerequisites.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {LESSONS.map((lesson) => (
          <Card key={lesson.title}>
            <CardHeader>
              <CardTitle className="text-base">{lesson.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{lesson.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
