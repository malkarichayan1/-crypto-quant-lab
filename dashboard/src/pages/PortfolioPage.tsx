import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { getPortfolio, getPortfolioOrders } from '../api/portfolio'
import { PositionsTable } from '../components/PositionsTable'
import { StalePricesBanner } from '../components/StalePricesBanner'
import { formatUnits, formatUsd } from '../lib/format'
import type { ManualOrder } from '../types'

const POLL_INTERVAL_MS = 30_000

function orderText(order: ManualOrder): string {
  const verb = order.side === 'buy' ? 'Bought' : 'Sold'
  return `${verb} ${formatUsd(order.usd_amount)} of ${order.symbol}`
}

function OrderLine({ order }: { order: ManualOrder }) {
  const Icon = order.side === 'buy' ? ArrowDownCircle : ArrowUpCircle
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5">
      <Icon
        className={cn('size-5', order.side === 'buy' ? 'text-profit' : 'text-loss')}
        aria-hidden="true"
      />
      <div className="flex-1">
        <p className="text-sm">{orderText(order)}</p>
        <p className="text-xs text-muted-foreground">
          {formatUnits(order.units)} @ {formatUsd(order.fill_price)} ·{' '}
          {new Date(order.created_at).toLocaleString()}
        </p>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-card">
        <Wallet className="size-6 text-primary" aria-hidden="true" />
      </div>
      <p className="text-sm text-muted-foreground">
        You don't own any coins yet — find your first one in Markets.
      </p>
      <Button asChild variant="outline">
        <Link to="/markets">Explore Markets</Link>
      </Button>
    </div>
  )
}

export function PortfolioPage() {
  const portfolioQuery = useQuery({
    queryKey: ['portfolio'],
    queryFn: getPortfolio,
    refetchInterval: POLL_INTERVAL_MS,
  })
  const ordersQuery = useQuery({
    queryKey: ['portfolio', 'orders'],
    queryFn: getPortfolioOrders,
  })

  const portfolio = portfolioQuery.data
  const orders = ordersQuery.data ?? []

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Portfolio</h1>
      {portfolio?.stale && <StalePricesBanner />}

      {portfolioQuery.isError && !portfolioQuery.data ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">
            We couldn't load your portfolio.
          </p>
          <Button variant="outline" onClick={() => portfolioQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : portfolioQuery.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        portfolio && (
          <Tabs defaultValue="positions">
            <TabsList>
              <TabsTrigger value="positions">Positions</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="positions" className="mt-4">
              {portfolio.positions.length === 0 ? (
                <EmptyState />
              ) : (
                <PositionsTable positions={portfolio.positions} />
              )}
            </TabsContent>

            <TabsContent value="orders" className="mt-4">
              {orders.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No orders yet.
                </p>
              ) : (
                orders.map((order) => <OrderLine key={order.id} order={order} />)
              )}
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              {orders.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  Your trades will show up here.
                </p>
              ) : (
                <div className="flex flex-col gap-1 border-l border-border pl-4">
                  {orders.map((order) => (
                    <OrderLine key={order.id} order={order} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )
      )}
    </div>
  )
}
