import { useTrading } from '@/contexts/TradingContext';
import { PortfolioSummary } from '@/components/portfolio/PortfolioSummary';
import { ExchangeBreakdown } from '@/components/portfolio/ExchangeBreakdown';
import { HoldingsTable } from '@/components/portfolio/HoldingsTable';
import { AllocationChart } from '@/components/portfolio/AllocationChart';
import { Skeleton } from '@/components/ui/skeleton';

export default function PortfolioPage() {
  const { loading } = useTrading();

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Portfolio Holdings</h1>
        <p className="text-muted-foreground">Real-time view of your trading portfolio across all exchanges</p>
      </div>
      
      {/* Summary Cards */}
      <PortfolioSummary />
      
      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ExchangeBreakdown />
        <AllocationChart />
      </div>
      
      {/* Holdings Table */}
      <HoldingsTable />
    </div>
  );
}
